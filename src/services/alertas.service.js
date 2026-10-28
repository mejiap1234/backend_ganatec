import pool from "../config/db.js";


// ==========================================
// GUARDAR / ACTUALIZAR ALERTA
// ==========================================

const guardarAlerta = async (
  client,
  {
    fincaId,
    tipo,
    prioridad,
    titulo,
    mensaje,
    entidadTipo,
    entidadId,
    clave,
    datos = null
  }
) => {

  await client.query(
    `
      INSERT INTO alertas (
        finca_id,
        tipo,
        prioridad,
        titulo,
        mensaje,
        entidad_tipo,
        entidad_id,
        clave,
        estado,
        datos
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'pendiente',
        $9
      )

      ON CONFLICT (
        finca_id,
        clave
      )

      DO UPDATE SET

        tipo = EXCLUDED.tipo,
        prioridad = EXCLUDED.prioridad,
        titulo = EXCLUDED.titulo,
        mensaje = EXCLUDED.mensaje,
        entidad_tipo = EXCLUDED.entidad_tipo,
        entidad_id = EXCLUDED.entidad_id,
        datos = EXCLUDED.datos,

        estado = 'pendiente',

        fecha_actualizacion =
          CURRENT_TIMESTAMP,

        fecha_resuelta = NULL,

        resuelta_por = NULL
    `,
    [
      fincaId,
      tipo,
      prioridad,
      titulo,
      mensaje,
      entidadTipo,
      entidadId,
      clave,
      datos
    ]
  );

};


// ==========================================
// SINCRONIZAR ALERTAS DE UNA FINCA
// ==========================================

export const sincronizarAlertasFinca = async (
  fincaId
) => {

  const client =
    await pool.connect();

  try {

    await client.query("BEGIN");


    // Claves que siguen siendo válidas.
    const clavesActivas = [];


    // ======================================
    // 1. INVENTARIO
    // ======================================

    const stockResultado =
      await client.query(
        `
          WITH stock AS (

            SELECT
              pi.id,
              pi.nombre,
              pi.unidad,
              pi.stock_minimo,

              COALESCE(
                SUM(
                  CASE
                    WHEN mi.tipo = 'entrada'
                      THEN mi.cantidad

                    WHEN mi.tipo = 'salida'
                      THEN -mi.cantidad

                    ELSE 0
                  END
                ),
                0
              )::numeric(12,2)
                AS stock_actual

            FROM productos_inventario pi

            LEFT JOIN movimientos_inventario mi
              ON mi.producto_id = pi.id

            WHERE pi.finca_id = $1
              AND pi.activo = TRUE

            GROUP BY pi.id
          )

          SELECT *
          FROM stock

          WHERE stock_actual <= stock_minimo
        `,
        [fincaId]
      );


    for (
      const producto
      of stockResultado.rows
    ) {

      const stock =
        Number(producto.stock_actual);

      const clave =
        `inventario_stock_${producto.id}`;

      clavesActivas.push(clave);


      await guardarAlerta(
        client,
        {
          fincaId,

          tipo: "inventario",

          prioridad:
            stock <= 0
              ? "critica"
              : "alta",

          titulo:
            stock <= 0
              ? "Producto agotado"
              : "Stock bajo",

          mensaje:
            stock <= 0
              ? `${producto.nombre} se encuentra agotado`
              : `${producto.nombre} tiene ${stock} ${producto.unidad} disponibles`,

          entidadTipo:
            "producto_inventario",

          entidadId:
            producto.id,

          clave,

          datos: {
            stock_actual:
              stock,

            stock_minimo:
              Number(
                producto.stock_minimo
              ),

            unidad:
              producto.unidad
          }
        }
      );

    }


    // ======================================
    // 2. VACUNACIONES
    // ======================================

    const vacunasResultado =
      await client.query(
        `
          SELECT
            v.id,
            v.vacuna,
            v.proxima_dosis,

            a.id AS animal_id,
            a.identificacion,
            a.nombre,

            (
              v.proxima_dosis::date
              -
              CURRENT_DATE
            )::int
              AS dias_restantes

          FROM vacunaciones v

          INNER JOIN animales a
            ON a.id = v.animal_id

          WHERE a.finca_id = $1

            AND a.estado = 'activo'

            AND v.proxima_dosis IS NOT NULL

            AND v.proxima_dosis::date
              <= CURRENT_DATE + 15
        `,
        [fincaId]
      );


    for (
      const vacuna
      of vacunasResultado.rows
    ) {

      const dias =
        Number(
          vacuna.dias_restantes
        );

      const clave =
        `vacunacion_${vacuna.id}`;

      clavesActivas.push(clave);


      let mensaje;


      if (dias < 0) {

        mensaje =
          `${vacuna.nombre || vacuna.identificacion}: ${vacuna.vacuna} vencida hace ${Math.abs(dias)} días`;

      } else if (dias === 0) {

        mensaje =
          `${vacuna.nombre || vacuna.identificacion}: ${vacuna.vacuna} corresponde hoy`;

      } else {

        mensaje =
          `${vacuna.nombre || vacuna.identificacion}: ${vacuna.vacuna} dentro de ${dias} días`;

      }


      await guardarAlerta(
        client,
        {
          fincaId,

          tipo:
            "vacunacion",

          prioridad:
            dias <= 0
              ? "alta"
              : "media",

          titulo:
            dias < 0
              ? "Vacunación vencida"
              : "Próxima vacunación",

          mensaje,

          entidadTipo:
            "animal",

          entidadId:
            vacuna.animal_id,

          clave,

          datos: {
            vacunacion_id:
              vacuna.id,

            proxima_dosis:
              vacuna.proxima_dosis,

            dias_restantes:
              dias
          }
        }
      );

    }


    // ======================================
    // 3. PARTOS PRÓXIMOS
    // ======================================

    const partosResultado =
      await client.query(
        `
          SELECT
            g.id,
            g.fecha_probable_parto,

            a.id AS animal_id,
            a.identificacion,
            a.nombre,

            (
              g.fecha_probable_parto::date
              -
              CURRENT_DATE
            )::int
              AS dias_restantes

          FROM gestaciones g

          INNER JOIN servicios_reproductivos sr
            ON sr.id =
               g.servicio_reproductivo_id

          INNER JOIN animales a
            ON a.id = sr.animal_id

          WHERE a.finca_id = $1

            AND g.fecha_fin IS NULL

            AND g.fecha_probable_parto::date
              BETWEEN
                CURRENT_DATE
                AND CURRENT_DATE + 30
        `,
        [fincaId]
      );


    for (
      const gestacion
      of partosResultado.rows
    ) {

      const dias =
        Number(
          gestacion.dias_restantes
        );

      const clave =
        `parto_${gestacion.id}`;

      clavesActivas.push(clave);


      await guardarAlerta(
        client,
        {
          fincaId,

          tipo:
            "reproduccion",

          prioridad:
            dias <= 7
              ? "alta"
              : "media",

          titulo:
            "Parto próximo",

          mensaje:
            `${gestacion.nombre || gestacion.identificacion} tiene parto probable en ${dias} días`,

          entidadTipo:
            "animal",

          entidadId:
            gestacion.animal_id,

          clave,

          datos: {
            gestacion_id:
              gestacion.id,

            fecha_probable_parto:
              gestacion.fecha_probable_parto,

            dias_restantes:
              dias
          }
        }
      );

    }


    // ======================================
    // 4. SALUD GRAVE
    // ======================================

    const saludResultado =
      await client.query(
        `
          SELECT
            es.id,

            a.id AS animal_id,
            a.identificacion,
            a.nombre

          FROM eventos_salud es

          INNER JOIN animales a
            ON a.id = es.animal_id

          WHERE a.finca_id = $1

            AND es.estado = 'abierto'

            AND es.gravedad = 'grave'
        `,
        [fincaId]
      );


    for (
      const evento
      of saludResultado.rows
    ) {

      const clave =
        `salud_grave_${evento.id}`;

      clavesActivas.push(clave);


      await guardarAlerta(
        client,
        {
          fincaId,

          tipo:
            "salud",

          prioridad:
            "critica",

          titulo:
            "Evento sanitario grave",

          mensaje:
            `${evento.nombre || evento.identificacion} tiene un evento sanitario grave abierto`,

          entidadTipo:
            "animal",

          entidadId:
            evento.animal_id,

          clave,

          datos: {
            evento_salud_id:
              evento.id
          }
        }
      );

    }


    // ======================================
    // 5. ANIMALES SIN PESAJE
    // ======================================

    const pesajesResultado =
      await client.query(
        `
          SELECT
            a.id,
            a.identificacion,
            a.nombre,

            MAX(
              p.fecha_pesaje
            ) AS ultimo_pesaje

          FROM animales a

          LEFT JOIN pesajes p
            ON p.animal_id = a.id

          WHERE a.finca_id = $1
            AND a.estado = 'activo'

          GROUP BY a.id

          HAVING
            MAX(p.fecha_pesaje) IS NULL

            OR MAX(
              p.fecha_pesaje
            )::date
              < CURRENT_DATE - 60
        `,
        [fincaId]
      );


    for (
      const animal
      of pesajesResultado.rows
    ) {

      const clave =
        `pesaje_${animal.id}`;

      clavesActivas.push(clave);


      await guardarAlerta(
        client,
        {
          fincaId,

          tipo:
            "pesaje",

          prioridad:
            "media",

          titulo:
            "Pesaje pendiente",

          mensaje:
            animal.ultimo_pesaje
              ? `${animal.nombre || animal.identificacion} lleva más de 60 días sin pesaje`
              : `${animal.nombre || animal.identificacion} no tiene pesajes registrados`,

          entidadTipo:
            "animal",

          entidadId:
            animal.id,

          clave,

          datos: {
            ultimo_pesaje:
              animal.ultimo_pesaje
          }
        }
      );

    }

    // ==========================================
// 8. PÉRDIDA SIGNIFICATIVA DE PESO
// ==========================================

const perdidaPesoResultado =
  await client.query(
    `
      WITH ultimos_pesajes AS (

        SELECT
          p.id,
          p.animal_id,
          p.peso_kg,
          p.fecha_pesaje,

          ROW_NUMBER() OVER (
            PARTITION BY p.animal_id

            ORDER BY
              p.fecha_pesaje DESC,
              p.id DESC
          ) AS posicion

        FROM pesajes p

        INNER JOIN animales a
          ON a.id = p.animal_id

        WHERE a.finca_id = $1
          AND a.estado = 'activo'
      ),

      comparacion AS (

        SELECT

          actual.animal_id,

          actual.peso_kg
            AS peso_actual,

          actual.fecha_pesaje
            AS fecha_actual,

          anterior.peso_kg
            AS peso_anterior,

          anterior.fecha_pesaje
            AS fecha_anterior

        FROM ultimos_pesajes actual

        INNER JOIN ultimos_pesajes anterior
          ON anterior.animal_id =
             actual.animal_id

          AND anterior.posicion = 2

        WHERE actual.posicion = 1
      )

      SELECT

        a.id AS animal_id,
        a.identificacion,
        a.nombre,

        c.peso_actual,
        c.peso_anterior,

        c.fecha_actual,
        c.fecha_anterior,

        (
          c.peso_actual
          -
          c.peso_anterior
        )::numeric(10,2)
          AS diferencia_kg,

        (
          (
            c.peso_actual
            -
            c.peso_anterior
          )
          /
          c.peso_anterior
          * 100
        )::numeric(10,2)
          AS variacion_porcentual

      FROM comparacion c

      INNER JOIN animales a
        ON a.id = c.animal_id

      WHERE c.peso_anterior > 0

        AND c.peso_actual
          < c.peso_anterior

        AND (
          (
            c.peso_anterior
            -
            c.peso_actual
          )
          /
          c.peso_anterior
          * 100
        ) >= 5
    `,
    [fincaId]
  );

  for (
  const animal
  of perdidaPesoResultado.rows
) {

  const variacion =
    Number(
      animal.variacion_porcentual
    );


  const perdidaPorcentaje =
    Math.abs(variacion);


  const perdidaKg =
    Math.abs(
      Number(
        animal.diferencia_kg
      )
    );


  const clave =
    `perdida_peso_${animal.animal_id}`;


  clavesActivas.push(clave);


  await guardarAlerta(
    client,
    {
      fincaId,

      tipo:
        "pesaje",

      prioridad:
        perdidaPorcentaje >= 10
          ? "alta"
          : "media",

      titulo:
        "Pérdida significativa de peso",

      mensaje:
        `${animal.nombre || animal.identificacion} perdió ${perdidaKg.toFixed(2)} kg (${perdidaPorcentaje.toFixed(2)}%) entre sus dos últimos pesajes`,

      entidadTipo:
        "animal",

      entidadId:
        animal.animal_id,

      clave,

      datos: {

        peso_anterior:
          Number(
            animal.peso_anterior
          ),

        peso_actual:
          Number(
            animal.peso_actual
          ),

        diferencia_kg:
          Number(
            animal.diferencia_kg
          ),

        variacion_porcentual:
          variacion,

        fecha_anterior:
          animal.fecha_anterior,

        fecha_actual:
          animal.fecha_actual

      }
    }
  );

}



    // ======================================
    // RESOLVER ALERTAS QUE YA NO APLICAN
    // ======================================

    const tiposAutomaticos = [
      "inventario",
      "vacunacion",
      "reproduccion",
      "salud",
      "pesaje"
    ];


    if (clavesActivas.length > 0) {

      await client.query(
        `
          UPDATE alertas

          SET
            estado = 'resuelta',
            fecha_resuelta =
              CURRENT_TIMESTAMP,
            fecha_actualizacion =
              CURRENT_TIMESTAMP

          WHERE finca_id = $1

            AND estado = 'pendiente'

            AND tipo =
              ANY($2::varchar[])

            AND NOT (
              clave =
              ANY($3::varchar[])
            )
        `,
        [
          fincaId,
          tiposAutomaticos,
          clavesActivas
        ]
      );

    } else {

      await client.query(
        `
          UPDATE alertas

          SET
            estado = 'resuelta',
            fecha_resuelta =
              CURRENT_TIMESTAMP,
            fecha_actualizacion =
              CURRENT_TIMESTAMP

          WHERE finca_id = $1

            AND estado = 'pendiente'

            AND tipo =
              ANY($2::varchar[])
        `,
        [
          fincaId,
          tiposAutomaticos
        ]
      );

    }


    await client.query("COMMIT");


    return {
      ok: true,
      total_detectadas:
        clavesActivas.length
    };


  } catch (error) {

    await client.query("ROLLBACK");

    throw error;


  } finally {

    client.release();

  }

};