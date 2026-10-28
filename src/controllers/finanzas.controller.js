import pool from "../config/db.js";


// ==========================================
// REGISTRAR GASTO GENERAL
// ==========================================

export const registrarGasto = async (req, res) => {

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    categoria,
    monto,
    descripcion,
    fecha_movimiento
  } = req.body;


  const categoriasPermitidas = [
    "veterinario",
    "combustible",
    "mantenimiento",
    "transporte",
    "servicios",
    "mano_obra",
    "alimentacion",
    "medicamentos",
    "infraestructura",
    "otro"
  ];


  if (
    !categoria ||
    !categoriasPermitidas.includes(categoria)
  ) {
    return res.status(400).json({
      ok: false,
      message: "Categoría de gasto inválida"
    });
  }


  const montoFinal = Number(monto);


  if (
    Number.isNaN(montoFinal) ||
    montoFinal <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "El monto debe ser mayor que cero"
    });
  }


  if (
    !descripcion ||
    !descripcion.trim()
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "La descripción del gasto es obligatoria"
    });
  }


  try {

    const resultado = await pool.query(
      `
        INSERT INTO movimientos_financieros (
          finca_id,
          tipo,
          categoria,
          monto,
          descripcion,
          fecha_movimiento,
          registrado_por
        )

        VALUES (
          $1,
          'gasto',
          $2,
          $3,
          $4,
          COALESCE(
            $5::timestamp,
            CURRENT_TIMESTAMP
          ),
          $6
        )

        RETURNING *
      `,
      [
        fincaId,
        categoria,
        montoFinal,
        descripcion.trim(),
        fecha_movimiento || null,
        usuarioId
      ]
    );


    return res.status(201).json({

      ok: true,

      message:
        "Gasto registrado correctamente",

      movimiento:
        resultado.rows[0]

    });


  } catch (error) {

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message:
          "La fecha del gasto no es válida"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al registrar el gasto"
    });

  }

};


// ==========================================
// LISTAR MOVIMIENTOS FINANCIEROS
// ==========================================

export const listarMovimientosFinancieros = async (
  req,
  res
) => {

  const fincaId = req.usuario.finca_id;

  const {
    tipo,
    categoria,
    desde,
    hasta
  } = req.query;


  try {

    const valores = [fincaId];

    const condiciones = [
      "mf.finca_id = $1"
    ];


    if (tipo) {

      if (
        !["ingreso", "gasto"].includes(tipo)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "El tipo debe ser ingreso o gasto"
        });
      }


      valores.push(tipo);

      condiciones.push(
        `mf.tipo = $${valores.length}`
      );
    }


    if (categoria) {

      valores.push(categoria);

      condiciones.push(
        `mf.categoria = $${valores.length}`
      );
    }


    if (desde) {

      valores.push(desde);

      condiciones.push(
        `mf.fecha_movimiento::date >= $${valores.length}::date`
      );
    }


    if (hasta) {

      valores.push(hasta);

      condiciones.push(
        `mf.fecha_movimiento::date <= $${valores.length}::date`
      );
    }


    const resultado = await pool.query(
      `
        SELECT
          mf.id,
          mf.tipo,
          mf.categoria,
          mf.monto,
          mf.descripcion,
          mf.referencia_tipo,
          mf.referencia_id,
          mf.fecha_movimiento,

          u.id AS registrado_por,
          u.nombre AS registrado_por_nombre

        FROM movimientos_financieros mf

        LEFT JOIN usuarios u
          ON u.id = mf.registrado_por

        WHERE
          ${condiciones.join(" AND ")}

        ORDER BY
          mf.fecha_movimiento DESC
      `,
      valores
    );


    return res.status(200).json({

      ok: true,

      total:
        resultado.rows.length,

      movimientos:
        resultado.rows

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar los movimientos financieros"
    });

  }

};




// ==========================================
// REGISTRAR VENTA DE LECHE
// ==========================================

export const registrarVentaLeche = async (req, res) => {

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    comprador,
    cantidad_litros,
    precio_litro,
    fecha_venta,
    observacion
  } = req.body;


  const cantidadLitros =
    Number(cantidad_litros);

  const precioLitro =
    Number(precio_litro);


  if (
    Number.isNaN(cantidadLitros) ||
    cantidadLitros <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "La cantidad de litros debe ser mayor que cero"
    });
  }


  if (
    Number.isNaN(precioLitro) ||
    precioLitro < 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "El precio por litro no es válido"
    });
  }


  const client =
    await pool.connect();


  try {

    await client.query("BEGIN");


    // Registrar la venta.
    const ventaResultado =
      await client.query(
        `
          INSERT INTO ventas_leche (
            finca_id,
            comprador,
            cantidad_litros,
            precio_litro,
            fecha_venta,
            observacion,
            registrado_por
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            COALESCE(
              $5::timestamp,
              CURRENT_TIMESTAMP
            ),
            $6,
            $7
          )

          RETURNING *
        `,
        [
          fincaId,
          comprador?.trim() || null,
          cantidadLitros,
          precioLitro,
          fecha_venta || null,
          observacion?.trim() || null,
          usuarioId
        ]
      );


    const venta =
      ventaResultado.rows[0];


    // Registrar automáticamente el ingreso.
    const financieroResultado =
      await client.query(
        `
          INSERT INTO movimientos_financieros (
            finca_id,
            tipo,
            categoria,
            monto,
            descripcion,
            referencia_tipo,
            referencia_id,
            fecha_movimiento,
            registrado_por
          )

          VALUES (
            $1,
            'ingreso',
            'venta_leche',
            $2,
            $3,
            'venta_leche',
            $4,
            $5,
            $6
          )

          RETURNING *
        `,
        [
          fincaId,
          venta.total,

          comprador
            ? `Venta de leche a ${comprador}`
            : `Venta de leche #${venta.id}`,

          venta.id,
          venta.fecha_venta,
          usuarioId
        ]
      );


    await client.query("COMMIT");


    return res.status(201).json({

      ok: true,

      message:
        "Venta de leche registrada correctamente",

      venta,

      movimiento_financiero:
        financieroResultado.rows[0]

    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message:
          "La fecha de venta no es válida"
      });
    }


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "La venta ya tiene un movimiento financiero asociado"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al registrar la venta de leche"
    });


  } finally {

    client.release();

  }

};


// ==========================================
// LISTAR VENTAS DE LECHE
// ==========================================

export const listarVentasLeche = async (req, res) => {

  const fincaId = req.usuario.finca_id;

  try {

    const resultado = await pool.query(
      `
        SELECT
          vl.id,
          vl.comprador,
          vl.cantidad_litros,
          vl.precio_litro,
          vl.total,
          vl.fecha_venta,
          vl.estado,
          vl.observacion,

          u.nombre AS registrado_por_nombre

        FROM ventas_leche vl

        LEFT JOIN usuarios u
          ON u.id = vl.registrado_por

        WHERE vl.finca_id = $1

        ORDER BY
          vl.fecha_venta DESC
      `,
      [fincaId]
    );


    return res.status(200).json({

      ok: true,

      total_ventas:
        resultado.rows.length,

      ventas:
        resultado.rows

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar las ventas de leche"
    });

  }

};


// ==========================================
// REGISTRAR VENTA DE ANIMAL
// ==========================================

export const registrarVentaAnimal = async (req, res) => {

  const animalId =
    Number(req.params.animalId);

  const fincaId =
    req.usuario.finca_id;

  const usuarioId =
    req.usuario.id;

  const {
    comprador,
    precio_venta,
    fecha_venta,
    observacion
  } = req.body;


  if (
    !Number.isInteger(animalId) ||
    animalId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "ID de animal inválido"
    });
  }


  const precioVenta =
    Number(precio_venta);


  if (
    Number.isNaN(precioVenta) ||
    precioVenta <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "El precio de venta debe ser mayor que cero"
    });
  }


  const client =
    await pool.connect();


  try {

    await client.query("BEGIN");


    // ======================================
    // BUSCAR Y BLOQUEAR ANIMAL
    // ======================================

    const animalResultado =
      await client.query(
        `
          SELECT
            id,
            identificacion,
            nombre,
            sexo,
            raza,
            estado

          FROM animales

          WHERE id = $1
            AND finca_id = $2

          FOR UPDATE
        `,
        [
          animalId,
          fincaId
        ]
      );


    if (
      animalResultado.rows.length === 0
    ) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Animal no encontrado"
      });
    }


    const animal =
      animalResultado.rows[0];


    if (animal.estado !== "activo") {

      await client.query("ROLLBACK");

      return res.status(409).json({

        ok: false,

        message:
          "Solo se pueden vender animales activos",

        estado_actual:
          animal.estado

      });
    }


    // ======================================
    // CREAR VENTA
    // ======================================

    const ventaResultado =
      await client.query(
        `
          INSERT INTO ventas_animales (
            finca_id,
            animal_id,
            comprador,
            precio_venta,
            fecha_venta,
            observacion,
            registrado_por
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,

            COALESCE(
              $5::timestamp,
              CURRENT_TIMESTAMP
            ),

            $6,
            $7
          )

          RETURNING *
        `,
        [
          fincaId,
          animalId,
          comprador?.trim() || null,
          precioVenta,
          fecha_venta || null,
          observacion?.trim() || null,
          usuarioId
        ]
      );


    const venta =
      ventaResultado.rows[0];


    // ======================================
    // SACAR ANIMAL DEL LOTE ACTUAL
    // ======================================

    await client.query(
      `
        UPDATE animales_lotes

        SET
          fecha_salida = $1,
          motivo_salida = 'Venta del animal'

        WHERE animal_id = $2
          AND fecha_salida IS NULL
      `,
      [
        venta.fecha_venta,
        animalId
      ]
    );


    // ======================================
    // FINALIZAR LACTANCIA ACTIVA
    // ======================================

    // Solo aplica si el animal vendido
    // tiene una lactancia actualmente activa.
    await client.query(
      `
        UPDATE lactancias

        SET
          estado = 'finalizada',
          fecha_fin = $1::date,
          motivo_fin = 'venta',
          observacion =
            CASE

              WHEN observacion IS NULL
                OR observacion = ''
              THEN 'Lactancia finalizada por venta del animal'

              ELSE
                observacion
                || ' | Lactancia finalizada por venta del animal'

            END

        WHERE animal_id = $2
          AND estado = 'activa'
          AND $1::date >= fecha_inicio::date
      `,
      [
        venta.fecha_venta,
        animalId
      ]
    );


    // ======================================
    // CAMBIAR ESTADO DEL ANIMAL
    // ======================================

    const animalActualizado =
      await client.query(
        `
          UPDATE animales

          SET estado = 'vendido'

          WHERE id = $1
            AND finca_id = $2

          RETURNING
            id,
            identificacion,
            nombre,
            sexo,
            raza,
            estado,
            finca_id
        `,
        [
          animalId,
          fincaId
        ]
      );


    // ======================================
    // HISTORIAL DE ESTADOS
    // ======================================

    await client.query(
      `
        INSERT INTO historial_estados_animales (
          animal_id,
          finca_id,
          estado_anterior,
          estado_nuevo,
          observacion,
          cambiado_por
        )

        VALUES (
          $1,
          $2,
          $3,
          'vendido',
          $4,
          $5
        )
      `,
      [
        animalId,
        fincaId,
        animal.estado,

        comprador
          ? `Animal vendido a ${comprador}`
          : "Animal registrado como vendido",

        usuarioId
      ]
    );


    // ======================================
    // INGRESO FINANCIERO AUTOMÁTICO
    // ======================================

    const financieroResultado =
      await client.query(
        `
          INSERT INTO movimientos_financieros (
            finca_id,
            tipo,
            categoria,
            monto,
            descripcion,
            referencia_tipo,
            referencia_id,
            fecha_movimiento,
            registrado_por
          )

          VALUES (
            $1,
            'ingreso',
            'venta_animal',
            $2,
            $3,
            'venta_animal',
            $4,
            $5,
            $6
          )

          RETURNING *
        `,
        [
          fincaId,
          precioVenta,

          comprador
            ?
              'Venta de '
              || (animal.nombre || animal.identificacion)
              || ` a ${comprador}`
            :
              'Venta de '
              || (animal.nombre || animal.identificacion),

          venta.id,
          venta.fecha_venta,
          usuarioId
        ]
      );


    await client.query("COMMIT");


    return res.status(201).json({

      ok: true,

      message:
        "Venta del animal registrada correctamente",

      venta,

      animal:
        animalActualizado.rows[0],

      movimiento_financiero:
        financieroResultado.rows[0]

    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "El animal ya tiene una venta registrada"
      });
    }


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message:
          "La fecha de venta no es válida"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al registrar la venta del animal"
    });


  } finally {

    client.release();

  }

};


// ==========================================
// LISTAR VENTAS DE ANIMALES
// ==========================================

export const listarVentasAnimales = async (
  req,
  res
) => {

  const fincaId =
    req.usuario.finca_id;


  try {

    const resultado =
      await pool.query(
        `
          SELECT
            va.id,
            va.comprador,
            va.precio_venta,
            va.fecha_venta,
            va.estado,
            va.observacion,

            a.id AS animal_id,
            a.identificacion,
            a.nombre,
            a.sexo,
            a.raza,

            u.nombre
              AS registrado_por_nombre

          FROM ventas_animales va

          INNER JOIN animales a
            ON a.id = va.animal_id

          LEFT JOIN usuarios u
            ON u.id = va.registrado_por

          WHERE va.finca_id = $1

          ORDER BY
            va.fecha_venta DESC
        `,
        [fincaId]
      );


    return res.status(200).json({

      ok: true,

      total_ventas:
        resultado.rows.length,

      ventas:
        resultado.rows

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar las ventas de animales"
    });

  }

};


// ==========================================
// RESUMEN FINANCIERO
// ==========================================

export const resumenFinanciero = async (req, res) => {

  const fincaId = req.usuario.finca_id;

  const {
    mes,
    anio
  } = req.query;


  // Debe enviarse mes o año, pero no ambos.
  if (
    (!mes && !anio) ||
    (mes && anio)
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "Debe indicar un mes o un año, pero no ambos"
    });
  }


  // Validar mes: YYYY-MM
  if (
    mes &&
    !/^\d{4}-\d{2}$/.test(mes)
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "El mes debe tener formato YYYY-MM"
    });
  }


  const anioNumero =
    anio ? Number(anio) : null;


  if (
    anio &&
    (
      !Number.isInteger(anioNumero) ||
      anioNumero < 2000
    )
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "El año no es válido"
    });
  }


  try {

    const valores = [fincaId];

    let condicionPeriodo;


    if (mes) {

      valores.push(mes);

      condicionPeriodo = `
        TO_CHAR(
          mf.fecha_movimiento,
          'YYYY-MM'
        ) = $2
      `;

    } else {

      valores.push(anioNumero);

      condicionPeriodo = `
        EXTRACT(
          YEAR FROM mf.fecha_movimiento
        ) = $2
      `;

    }


    // ======================================
    // TOTALES GENERALES
    // ======================================

    const totalesResultado =
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
              AS ingresos,

            COALESCE(
              SUM(monto)
              FILTER (
                WHERE tipo = 'gasto'
              ),
              0
            )::numeric(14,2)
              AS gastos,

            COUNT(*)
              FILTER (
                WHERE tipo = 'ingreso'
              )::int
              AS cantidad_ingresos,

            COUNT(*)
              FILTER (
                WHERE tipo = 'gasto'
              )::int
              AS cantidad_gastos

          FROM movimientos_financieros mf

          WHERE mf.finca_id = $1
            AND ${condicionPeriodo}
        `,
        valores
      );


    const totales =
      totalesResultado.rows[0];


    const ingresos =
      Number(totales.ingresos);

    const gastos =
      Number(totales.gastos);

    const balance =
      ingresos - gastos;


    // ======================================
    // DESGLOSE POR CATEGORÍA
    // ======================================

    const categoriasResultado =
      await pool.query(
        `
          SELECT
            mf.tipo,
            mf.categoria,

            COUNT(*)::int
              AS movimientos,

            SUM(
              mf.monto
            )::numeric(14,2)
              AS total

          FROM movimientos_financieros mf

          WHERE mf.finca_id = $1
            AND ${condicionPeriodo}

          GROUP BY
            mf.tipo,
            mf.categoria

          ORDER BY
            mf.tipo,
            total DESC
        `,
        valores
      );


    const ingresosCategorias =
      categoriasResultado.rows
        .filter(
          item =>
            item.tipo === "ingreso"
        )
        .map(
          item => ({
            categoria:
              item.categoria,

            movimientos:
              item.movimientos,

            total:
              Number(item.total)
          })
        );


    const gastosCategorias =
      categoriasResultado.rows
        .filter(
          item =>
            item.tipo === "gasto"
        )
        .map(
          item => ({
            categoria:
              item.categoria,

            movimientos:
              item.movimientos,

            total:
              Number(item.total)
          })
        );


    return res.status(200).json({

      ok: true,

      periodo:
        mes
          ? {
              tipo: "mensual",
              valor: mes
            }
          : {
              tipo: "anual",
              valor: anioNumero
            },

      resumen: {

        ingresos_totales:
          Number(
            ingresos.toFixed(2)
          ),

        gastos_totales:
          Number(
            gastos.toFixed(2)
          ),

        balance:
          Number(
            balance.toFixed(2)
          ),

        cantidad_ingresos:
          totales.cantidad_ingresos,

        cantidad_gastos:
          totales.cantidad_gastos

      },

      ingresos_por_categoria:
        ingresosCategorias,

      gastos_por_categoria:
        gastosCategorias

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al generar el resumen financiero"
    });

  }

};