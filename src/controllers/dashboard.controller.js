import pool from "../config/db.js";

import {
  sincronizarAlertasFinca
} from "../services/alertas.service.js";


// Convierte valores PostgreSQL a número
const numero = (valor) => Number(valor || 0);


// ==========================================
// DASHBOARD GENERAL DE GANATEC
// ==========================================

export const obtenerDashboard = async (req, res) => {

  const fincaId = req.usuario.finca_id;
  const rol = req.usuario.rol;

  const esAdministrador =
    rol === "administrador";


  if (!fincaId) {

    return res.status(400).json({
      ok: false,
      message:
        "El usuario no tiene una finca asociada"
    });

  }


  try {

    // ======================================
    // ACTUALIZAR MOTOR DE ALERTAS
    // ======================================

    await sincronizarAlertasFinca(
      fincaId
    );


    // ======================================
    // CONSULTAS PRINCIPALES EN PARALELO
    // ======================================

    const [
      fincaResultado,
      animalesResultado,
      saludResultado,
      reproduccionResultado,
      lecheResultado,
      inventarioResultado,
      potrerosResultado
    ] = await Promise.all([


      // ------------------------------------
      // FINCA
      // ------------------------------------

      pool.query(
        `
          SELECT
            id,
            nombre

          FROM fincas

          WHERE id = $1
        `,
        [fincaId]
      ),


      // ------------------------------------
      // ANIMALES
      // ------------------------------------

      pool.query(
        `
          SELECT

            COUNT(*)::int
              AS total,

            COUNT(*)
              FILTER (
                WHERE estado = 'activo'
              )::int
              AS activos,

            COUNT(*)
              FILTER (
                WHERE estado = 'vendido'
              )::int
              AS vendidos,

            COUNT(*)
              FILTER (
                WHERE estado = 'muerto'
              )::int
              AS muertos,

            COUNT(*)
              FILTER (
                WHERE estado = 'trasladado'
              )::int
              AS trasladados,

            COUNT(*)
              FILTER (
                WHERE estado = 'activo'
                  AND sexo = 'hembra'
              )::int
              AS hembras_activas,

            COUNT(*)
              FILTER (
                WHERE estado = 'activo'
                  AND sexo = 'macho'
              )::int
              AS machos_activos

          FROM animales

          WHERE finca_id = $1
        `,
        [fincaId]
      ),


      // ------------------------------------
      // SALUD
      // ------------------------------------

      pool.query(
        `
          SELECT

            (
              SELECT COUNT(*)::int

              FROM eventos_salud es

              INNER JOIN animales a
                ON a.id = es.animal_id

              WHERE a.finca_id = $1
                AND es.estado = 'abierto'
            )
              AS eventos_abiertos,


            (
              SELECT COUNT(*)::int

              FROM eventos_salud es

              INNER JOIN animales a
                ON a.id = es.animal_id

              WHERE a.finca_id = $1
                AND es.estado = 'abierto'
                AND es.gravedad = 'grave'
            )
              AS eventos_graves,


            (
              SELECT COUNT(*)::int

              FROM tratamientos t

              INNER JOIN eventos_salud es
                ON es.id = t.evento_salud_id

              INNER JOIN animales a
                ON a.id = es.animal_id

              WHERE a.finca_id = $1
                AND t.estado = 'activo'
            )
              AS tratamientos_activos
        `,
        [fincaId]
      ),


      // ------------------------------------
      // REPRODUCCIÓN
      // ------------------------------------

      pool.query(
        `
          SELECT

            COUNT(*)
              FILTER (
                WHERE g.fecha_fin IS NULL
              )::int
              AS gestaciones_activas,


            COUNT(*)
              FILTER (
                WHERE g.fecha_fin IS NULL

                AND g.fecha_probable_parto::date
                  BETWEEN CURRENT_DATE
                  AND CURRENT_DATE + 7
              )::int
              AS partos_7_dias,


            COUNT(*)
              FILTER (
                WHERE g.fecha_fin IS NULL

                AND g.fecha_probable_parto::date
                  BETWEEN CURRENT_DATE
                  AND CURRENT_DATE + 30
              )::int
              AS partos_30_dias

          FROM gestaciones g

          INNER JOIN servicios_reproductivos sr
            ON sr.id =
               g.servicio_reproductivo_id

          INNER JOIN animales a
            ON a.id = sr.animal_id

          WHERE a.finca_id = $1
        `,
        [fincaId]
      ),


      // ------------------------------------
      // PRODUCCIÓN DE LECHE
      // ------------------------------------

           pool.query(
        `
          WITH produccion_detallada AS (

            SELECT

              rl.fecha_ordenio::date
                AS fecha,

              SUM(
                rl.litros
              )::numeric(12,2)
                AS litros

            FROM registros_leche rl

            INNER JOIN lactancias l
              ON l.id = rl.lactancia_id

            INNER JOIN animales a
              ON a.id = l.animal_id

            WHERE a.finca_id = $1

              AND NOT EXISTS (

                SELECT 1

                FROM produccion_leche_diaria pld

                WHERE pld.finca_id = $1

                  AND pld.fecha_produccion =
                      rl.fecha_ordenio::date

              )

            GROUP BY
              rl.fecha_ordenio::date

          ),


          produccion_rapida AS (

            SELECT

              fecha_produccion::date
                AS fecha,

              litros_totales::numeric(12,2)
                AS litros

            FROM produccion_leche_diaria

            WHERE finca_id = $1

          ),


          produccion_unificada AS (

            SELECT *
            FROM produccion_detallada

            UNION ALL

            SELECT *
            FROM produccion_rapida

          )


          SELECT

            COALESCE(
              SUM(litros)
              FILTER (
                WHERE fecha = CURRENT_DATE
              ),
              0
            )::numeric(12,2)
              AS litros_hoy,


            COALESCE(
              SUM(litros)
              FILTER (
                WHERE fecha >=
                  DATE_TRUNC(
                    'month',
                    CURRENT_DATE
                  )::date

                AND fecha <
                  (
                    DATE_TRUNC(
                      'month',
                      CURRENT_DATE
                    )
                    + INTERVAL '1 month'
                  )::date
              ),
              0
            )::numeric(12,2)
              AS litros_mes,


            COALESCE(
              SUM(litros)
              FILTER (
                WHERE fecha
                  BETWEEN
                    CURRENT_DATE - 6
                    AND CURRENT_DATE
              ),
              0
            )::numeric(12,2)
              AS ultimos_7_dias,


            COALESCE(
              SUM(litros)
              FILTER (
                WHERE fecha
                  BETWEEN
                    CURRENT_DATE - 13
                    AND CURRENT_DATE - 7
              ),
              0
            )::numeric(12,2)
              AS anteriores_7_dias

          FROM produccion_unificada
        `,
        [
          fincaId
        ]
      ),


      // ------------------------------------
      // INVENTARIO
      // ------------------------------------

      pool.query(
        `
          WITH stock AS (

            SELECT
              pi.id,
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
              ) AS stock_actual

            FROM productos_inventario pi

            LEFT JOIN movimientos_inventario mi
              ON mi.producto_id = pi.id

            WHERE pi.finca_id = $1
              AND pi.activo = TRUE

            GROUP BY pi.id
          )

          SELECT

            COUNT(*)::int
              AS productos_activos,

            COUNT(*)
              FILTER (
                WHERE
                  stock_actual <= stock_minimo
              )::int
              AS stock_bajo,

            COUNT(*)
              FILTER (
                WHERE stock_actual <= 0
              )::int
              AS agotados

          FROM stock
        `,
        [fincaId]
      ),


      // ------------------------------------
      // POTREROS Y LOTES
      // ------------------------------------

      pool.query(
        `
          SELECT

            COUNT(*)::int
              AS total_potreros,

            COUNT(*)
              FILTER (
                WHERE estado = 'ocupado'
              )::int
              AS ocupados,

            COUNT(*)
              FILTER (
                WHERE estado = 'descanso'
              )::int
              AS descanso,

            COUNT(*)
              FILTER (
                WHERE estado = 'disponible'
              )::int
              AS disponibles,

            (
              SELECT COUNT(*)::int

              FROM lotes

              WHERE finca_id = $1
                AND estado = 'activo'
            )
              AS lotes_activos

          FROM potreros

          WHERE finca_id = $1
        `,
        [fincaId]
      )

    ]);


    // ======================================
    // ALERTAS CENTRALES
    // ======================================

    const alertasResultado =
      await pool.query(
        `
          SELECT
            id,
            tipo,
            prioridad,
            titulo,
            mensaje,
            entidad_tipo,
            entidad_id,
            datos,
            fecha_detectada,
            fecha_actualizacion

          FROM alertas

          WHERE finca_id = $1
            AND estado = 'pendiente'

          ORDER BY

            CASE prioridad

              WHEN 'critica'
                THEN 1

              WHEN 'alta'
                THEN 2

              WHEN 'media'
                THEN 3

              ELSE 4

            END,

            fecha_detectada DESC

          LIMIT 10
        `,
        [fincaId]
      );


    const alertas =
      alertasResultado.rows;

const totalAlertasResultado =
  await pool.query(
    `
      SELECT

        COUNT(*)::int AS total,

        COUNT(*)
          FILTER (
            WHERE prioridad = 'critica'
          )::int AS criticas,

        COUNT(*)
          FILTER (
            WHERE prioridad = 'alta'
          )::int AS altas,

        COUNT(*)
          FILTER (
            WHERE prioridad = 'media'
          )::int AS medias

      FROM alertas

      WHERE finca_id = $1
        AND estado = 'pendiente'
    `,
    [fincaId]
  );


const resumenAlertas =
  totalAlertasResultado.rows[0];


    // ======================================
    // FINANZAS
    // ======================================
    // Solo el administrador recibe
    // información financiera.

    let finanzas = null;


    if (esAdministrador) {

      const financieroResultado =
        await pool.query(
          `
            SELECT

              COALESCE(
                SUM(monto)
                FILTER (
                  WHERE tipo = 'ingreso'
                ),
                0
              )::numeric(14,2)
                AS ingresos_mes,

              COALESCE(
                SUM(monto)
                FILTER (
                  WHERE tipo = 'gasto'
                ),
                0
              )::numeric(14,2)
                AS gastos_mes

            FROM movimientos_financieros

            WHERE finca_id = $1

              AND fecha_movimiento >=
                DATE_TRUNC(
                  'month',
                  CURRENT_DATE
                )

              AND fecha_movimiento <
                DATE_TRUNC(
                  'month',
                  CURRENT_DATE
                )
                + INTERVAL '1 month'
          `,
          [fincaId]
        );


      const datos =
        financieroResultado.rows[0];


      const ingresos =
        numero(
          datos.ingresos_mes
        );


      const gastos =
        numero(
          datos.gastos_mes
        );


      finanzas = {

        ingresos_mes:
          ingresos,

        gastos_mes:
          gastos,

        balance_mes:
          Number(
            (
              ingresos -
              gastos
            ).toFixed(2)
          )

      };

    }


    // ======================================
    // TENDENCIA DE PRODUCCIÓN
    // ======================================

    const leche =
      lecheResultado.rows[0];


    const actual7 =
      numero(
        leche.ultimos_7_dias
      );


    const anterior7 =
      numero(
        leche.anteriores_7_dias
      );


    let variacionLeche = null;

    let tendenciaLeche =
      "sin_comparacion";


    if (anterior7 > 0) {

      variacionLeche =
        (
          (
            actual7 -
            anterior7
          )
          /
          anterior7
        ) * 100;


      if (variacionLeche > 5) {

        tendenciaLeche =
          "subiendo";

      } else if (
        variacionLeche < -5
      ) {

        tendenciaLeche =
          "bajando";

      } else {

        tendenciaLeche =
          "estable";

      }

    }


    // ======================================
    // ESTADO GENERAL
    // ======================================

    const criticas =
  Number(resumenAlertas.criticas);

const altas =
  Number(resumenAlertas.altas);

const medias =
  Number(resumenAlertas.medias);

const totalAlertas =
  Number(resumenAlertas.total);


    let estadoGeneral = "estable";


if (criticas > 0) {

  estadoGeneral =
    "requiere_atencion";

} else if (altas > 0) {

  estadoGeneral =
    "atencion";

} else if (medias > 0) {

  estadoGeneral =
    "seguimiento";

}


    // ======================================
    // RESPUESTA FINAL
    // ======================================

    return res.status(200).json({

      ok: true,

      generado_en:
        new Date().toISOString(),


      finca:
        fincaResultado.rows[0],


      estado_general: {

        estado:
          estadoGeneral,

        alertas_criticas:
          criticas,

        alertas_altas:
          altas,

        alertas_medias:
          medias,

        total_alertas:
          alertas.length

      },


      animales:
        animalesResultado.rows[0],


      salud:
        saludResultado.rows[0],


      reproduccion:
        reproduccionResultado.rows[0],


      leche: {

        litros_hoy:
          numero(
            leche.litros_hoy
          ),

        litros_mes:
          numero(
            leche.litros_mes
          ),

        ultimos_7_dias:
          actual7,

        anteriores_7_dias:
          anterior7,

        variacion_porcentual:
          variacionLeche !== null
            ? Number(
                variacionLeche
                  .toFixed(2)
              )
            : null,

        tendencia:
          tendenciaLeche

      },


      inventario:
        inventarioResultado.rows[0],


      potreros:
        potrerosResultado.rows[0],


      finanzas,


      alertas

    });


  } catch (error) {

    console.error(
      "ERROR DASHBOARD:",
      error
    );


    return res.status(500).json({

      ok: false,

      message:
        "Error al generar el dashboard"

    });

  }

};