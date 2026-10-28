import pool from "../config/db.js";


// ==========================================
// CREAR POTRERO
// ==========================================

export const crearPotrero = async (req, res) => {

  const fincaId = req.usuario.finca_id;

  const {
    nombre,
    area_hectareas,
    tipo_pasto,
    capacidad_animales,
    observacion
  } = req.body;


  if (!fincaId) {
    return res.status(400).json({
      ok: false,
      message: "El usuario no tiene una finca asociada"
    });
  }


  if (!nombre || !nombre.trim()) {
    return res.status(400).json({
      ok: false,
      message: "El nombre del potrero es obligatorio"
    });
  }


  if (
    area_hectareas !== undefined &&
    area_hectareas !== null &&
    Number(area_hectareas) <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "El área debe ser mayor que cero"
    });
  }


  if (
    capacidad_animales !== undefined &&
    capacidad_animales !== null &&
    (
      !Number.isInteger(Number(capacidad_animales)) ||
      Number(capacidad_animales) <= 0
    )
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "La capacidad de animales debe ser un número entero mayor que cero"
    });
  }


  try {

    const resultado = await pool.query(
      `
        INSERT INTO potreros (
          finca_id,
          nombre,
          area_hectareas,
          tipo_pasto,
          capacidad_animales,
          observacion
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )

        RETURNING *
      `,
      [
        fincaId,
        nombre.trim(),
        area_hectareas || null,
        tipo_pasto?.trim() || null,
        capacidad_animales || null,
        observacion?.trim() || null
      ]
    );


    return res.status(201).json({
      ok: true,
      message: "Potrero registrado correctamente",
      potrero: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "Ya existe un potrero con ese nombre en la finca"
      });
    }


    if (error.code === "23514") {
      return res.status(400).json({
        ok: false,
        message:
          "Los datos del potrero no cumplen las validaciones"
      });
    }


    return res.status(500).json({
      ok: false,
      message: "Error al registrar el potrero"
    });

  }

};



// ==========================================
// LISTAR POTREROS
// ==========================================

export const listarPotreros = async (req, res) => {

  const fincaId = req.usuario.finca_id;


  try {

    const resultado = await pool.query(
      `
        SELECT
          id,
          nombre,
          area_hectareas,
          tipo_pasto,
          capacidad_animales,
          estado,
          observacion,
          fecha_creacion

        FROM potreros

        WHERE finca_id = $1

        ORDER BY nombre ASC
      `,
      [fincaId]
    );


    return res.status(200).json({
      ok: true,
      total: resultado.rows.length,
      potreros: resultado.rows
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message: "Error al consultar los potreros"
    });

  }

};


// ==========================================
// MOVER LOTE A UN POTRERO
// ==========================================

export const moverLotePotrero = async (req, res) => {

  const loteId = Number(req.params.loteId);

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    potrero_id,
    motivo
  } = req.body;


  const potreroId = Number(potrero_id);


  if (
    !Number.isInteger(loteId) ||
    loteId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "ID de lote inválido"
    });
  }


  if (
    !Number.isInteger(potreroId) ||
    potreroId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "ID de potrero inválido"
    });
  }


  const client = await pool.connect();


  try {

    await client.query("BEGIN");


    // ---------------------------------------
    // VALIDAR LOTE
    // ---------------------------------------

    const loteResultado = await client.query(
      `
        SELECT
          id,
          nombre,
          estado

        FROM lotes

        WHERE id = $1
          AND finca_id = $2

        FOR UPDATE
      `,
      [
        loteId,
        fincaId
      ]
    );


    if (loteResultado.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Lote no encontrado"
      });

    }


    const lote =
      loteResultado.rows[0];


    if (lote.estado !== "activo") {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message:
          "No se puede mover un lote inactivo"
      });

    }


    // ---------------------------------------
    // VALIDAR POTRERO
    // ---------------------------------------

    const potreroResultado =
      await client.query(
        `
          SELECT
            id,
            nombre,
            area_hectareas,
            capacidad_animales,
            estado

          FROM potreros

          WHERE id = $1
            AND finca_id = $2

          FOR UPDATE
        `,
        [
          potreroId,
          fincaId
        ]
      );


    if (potreroResultado.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Potrero no encontrado"
      });

    }


    const potrero =
      potreroResultado.rows[0];


    if (potrero.estado === "inactivo") {

  await client.query("ROLLBACK");

  return res.status(400).json({
    ok: false,
    message:
      "No se puede utilizar un potrero inactivo"
  });

}


if (potrero.estado === "descanso") {

  await client.query("ROLLBACK");

  return res.status(409).json({
    ok: false,
    message:
      "El potrero se encuentra actualmente en descanso"
  });

}


    // ---------------------------------------
    // BUSCAR UBICACIÓN ACTUAL DEL LOTE
    // ---------------------------------------

    const actualResultado =
      await client.query(
        `
          SELECT
            mlp.id,
            mlp.potrero_id,
            mlp.fecha_ingreso,
            p.nombre AS potrero_nombre

          FROM movimientos_lotes_potreros mlp

          INNER JOIN potreros p
            ON p.id = mlp.potrero_id

          WHERE mlp.lote_id = $1
            AND mlp.fecha_salida IS NULL

          FOR UPDATE OF mlp
        `,
        [loteId]
      );


    let ubicacionAnterior = null;


    if (actualResultado.rows.length > 0) {

      ubicacionAnterior =
        actualResultado.rows[0];


      if (
        Number(ubicacionAnterior.potrero_id)
        === potreroId
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          ok: false,
          message:
            "El lote ya se encuentra en ese potrero"
        });

      }


      // Cerrar estancia anterior.
      await client.query(
        `
          UPDATE movimientos_lotes_potreros

          SET
            fecha_salida = CURRENT_TIMESTAMP,
            motivo_salida = $1

          WHERE id = $2
        `,
        [
          motivo?.trim()
            || "Traslado a otro potrero",

          ubicacionAnterior.id
        ]
      );

    }


    // ---------------------------------------
    // REGISTRAR NUEVA UBICACIÓN
    // ---------------------------------------

    const nuevoMovimiento =
      await client.query(
        `
          INSERT INTO movimientos_lotes_potreros (
            lote_id,
            potrero_id,
            registrado_por
          )

          VALUES ($1, $2, $3)

          RETURNING *
        `,
        [
          loteId,
          potreroId,
          usuarioId
        ]
      );


    // El nuevo potrero queda ocupado.
    await client.query(
      `
        UPDATE potreros
        SET estado = 'ocupado'
        WHERE id = $1
      `,
      [potreroId]
    );


    // ---------------------------------------
    // ACTUALIZAR POTRERO ANTERIOR
    // ---------------------------------------

    if (ubicacionAnterior) {

      // Comprobar si todavía existe otro lote
      // usando ese potrero.
      const ocupacionAnterior =
        await client.query(
          `
            SELECT COUNT(*)::int AS total

            FROM movimientos_lotes_potreros

            WHERE potrero_id = $1
              AND fecha_salida IS NULL
          `,
          [ubicacionAnterior.potrero_id]
        );


      if (
  ocupacionAnterior.rows[0].total === 0
) {

  // El potrero queda en descanso.
  await client.query(
    `
      UPDATE potreros

      SET estado = 'descanso'

      WHERE id = $1
    `,
    [
      ubicacionAnterior.potrero_id
    ]
  );


  // Guardar el inicio del descanso.
  await client.query(
    `
      INSERT INTO descansos_potreros (
        potrero_id,
        motivo
      )

      VALUES ($1, $2)

      ON CONFLICT DO NOTHING
    `,
    [
      ubicacionAnterior.potrero_id,
      "Inicio automático de descanso después de la salida del último lote"
    ]
  );

}

    }


    await client.query("COMMIT");


    return res.status(200).json({

      ok: true,

      message:
        "Lote trasladado al potrero correctamente",

      lote: {
        id: lote.id,
        nombre: lote.nombre
      },

      potrero_anterior:
        ubicacionAnterior
          ? {
              id:
                ubicacionAnterior.potrero_id,

              nombre:
                ubicacionAnterior.potrero_nombre
            }
          : null,

      potrero_actual: {
        id: potrero.id,
        nombre: potrero.nombre
      },

      movimiento:
        nuevoMovimiento.rows[0]

    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "El lote ya tiene una ubicación activa"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al mover el lote al potrero"
    });


  } finally {

    client.release();

  }

};



// ==========================================
// HISTORIAL DE POTREROS DE UN LOTE
// ==========================================

export const historialPotrerosLote = async (
  req,
  res
) => {

  const loteId = Number(req.params.loteId);
  const fincaId = req.usuario.finca_id;


  if (
    !Number.isInteger(loteId) ||
    loteId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "ID de lote inválido"
    });
  }


  try {

    const loteResultado = await pool.query(
      `
        SELECT
          id,
          nombre,
          estado

        FROM lotes

        WHERE id = $1
          AND finca_id = $2
      `,
      [
        loteId,
        fincaId
      ]
    );


    if (loteResultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Lote no encontrado"
      });
    }


    const resultado = await pool.query(
      `
        SELECT
          mlp.id,

          mlp.fecha_ingreso,
          mlp.fecha_salida,
          mlp.motivo_salida,

          p.id AS potrero_id,
          p.nombre AS potrero_nombre,

          CASE

            WHEN mlp.fecha_salida IS NULL
            THEN (
              CURRENT_DATE
              -
              mlp.fecha_ingreso::date
            ) + 1

            ELSE (
              mlp.fecha_salida::date
              -
              mlp.fecha_ingreso::date
            ) + 1

          END AS dias_permanencia

        FROM movimientos_lotes_potreros mlp

        INNER JOIN potreros p
          ON p.id = mlp.potrero_id

        WHERE mlp.lote_id = $1

        ORDER BY
          mlp.fecha_ingreso DESC
      `,
      [loteId]
    );


    return res.status(200).json({

      ok: true,

      lote:
        loteResultado.rows[0],

      total_movimientos:
        resultado.rows.length,

      ubicacion_actual:
        resultado.rows.find(
          movimiento =>
            movimiento.fecha_salida === null
        ) || null,

      historial:
        resultado.rows

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar el historial del lote"
    });

  }

};


// ==========================================
// CONSULTAR DESCANSOS DE UN POTRERO
// ==========================================

export const listarDescansosPotrero = async (
  req,
  res
) => {

  const potreroId =
    Number(req.params.potreroId);

  const fincaId =
    req.usuario.finca_id;


  if (
    !Number.isInteger(potreroId) ||
    potreroId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "ID de potrero inválido"
    });
  }


  try {

    // Verificar que pertenece a la finca.
    const potreroResultado =
      await pool.query(
        `
          SELECT
            id,
            nombre,
            estado

          FROM potreros

          WHERE id = $1
            AND finca_id = $2
        `,
        [
          potreroId,
          fincaId
        ]
      );


    if (
      potreroResultado.rows.length === 0
    ) {
      return res.status(404).json({
        ok: false,
        message:
          "Potrero no encontrado"
      });
    }


    const resultado =
      await pool.query(
        `
          SELECT
            dp.id,
            dp.fecha_inicio,
            dp.fecha_fin,
            dp.motivo,
            dp.observacion,

            CASE

              WHEN dp.fecha_fin IS NULL
              THEN (
                CURRENT_DATE
                -
                dp.fecha_inicio::date
              ) + 1

              ELSE (
                dp.fecha_fin::date
                -
                dp.fecha_inicio::date
              ) + 1

            END AS dias_descanso,

            u.nombre
              AS finalizado_por_nombre

          FROM descansos_potreros dp

          LEFT JOIN usuarios u
            ON u.id = dp.finalizado_por

          WHERE dp.potrero_id = $1

          ORDER BY
            dp.fecha_inicio DESC
        `,
        [potreroId]
      );


    const descansoActual =
      resultado.rows.find(
        descanso =>
          descanso.fecha_fin === null
      ) || null;


    return res.status(200).json({

      ok: true,

      potrero:
        potreroResultado.rows[0],

      descanso_actual:
        descansoActual,

      total_descansos:
        resultado.rows.length,

      historial:
        resultado.rows

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar los descansos del potrero"
    });

  }

};


// ==========================================
// FINALIZAR DESCANSO DEL POTRERO
// ==========================================

export const finalizarDescansoPotrero = async (
  req,
  res
) => {

  const potreroId =
    Number(req.params.potreroId);

  const fincaId =
    req.usuario.finca_id;

  const usuarioId =
    req.usuario.id;

  const {
    observacion
  } = req.body;


  if (
    !Number.isInteger(potreroId) ||
    potreroId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "ID de potrero inválido"
    });
  }


  const client =
    await pool.connect();


  try {

    await client.query("BEGIN");


    // Bloquear el potrero mientras hacemos el cambio.
    const potreroResultado =
      await client.query(
        `
          SELECT
            id,
            nombre,
            estado

          FROM potreros

          WHERE id = $1
            AND finca_id = $2

          FOR UPDATE
        `,
        [
          potreroId,
          fincaId
        ]
      );


    if (
      potreroResultado.rows.length === 0
    ) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message:
          "Potrero no encontrado"
      });

    }


    const potrero =
      potreroResultado.rows[0];


    if (
      potrero.estado !== "descanso"
    ) {

      await client.query("ROLLBACK");

      return res.status(409).json({
        ok: false,
        message:
          "El potrero no se encuentra en descanso"
      });

    }


    // Buscar descanso activo.
    const descansoResultado =
      await client.query(
        `
          SELECT
            id,
            fecha_inicio

          FROM descansos_potreros

          WHERE potrero_id = $1
            AND fecha_fin IS NULL

          FOR UPDATE
        `,
        [potreroId]
      );


    if (
      descansoResultado.rows.length === 0
    ) {

      await client.query("ROLLBACK");

      return res.status(409).json({
        ok: false,
        message:
          "No existe un descanso activo para este potrero"
      });

    }


    const descanso =
      descansoResultado.rows[0];


    // Finalizar descanso.
    const descansoFinalizado =
      await client.query(
        `
          UPDATE descansos_potreros

          SET
            fecha_fin = CURRENT_TIMESTAMP,
            observacion = $1,
            finalizado_por = $2

          WHERE id = $3

          RETURNING *
        `,
        [
          observacion?.trim() || null,
          usuarioId,
          descanso.id
        ]
      );


    // El potrero vuelve a estar disponible.
    await client.query(
      `
        UPDATE potreros

        SET estado = 'disponible'

        WHERE id = $1
      `,
      [potreroId]
    );


    await client.query("COMMIT");


    return res.status(200).json({

      ok: true,

      message:
        "Descanso del potrero finalizado correctamente",

      potrero: {
        id: potrero.id,
        nombre: potrero.nombre,
        estado: "disponible"
      },

      descanso:
        descansoFinalizado.rows[0]

    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al finalizar el descanso del potrero"
    });


  } finally {

    client.release();

  }

};


// ==========================================
// LISTAR LOTES ACTUALES DE UN POTRERO
// ==========================================

export const listarLotesPotrero = async (
  req,
  res
) => {

  const potreroId =
    Number(req.params.potreroId);

  const fincaId =
    req.usuario.finca_id;


  if (
    !Number.isInteger(potreroId) ||
    potreroId <= 0
  ) {

    return res.status(400).json({
      ok: false,
      message: "ID de potrero inválido"
    });

  }


  try {

    // Verificar que el potrero pertenece a la finca
    const potreroResultado =
      await pool.query(
        `
          SELECT
            id,
            nombre,
            estado,
            area_hectareas,
            capacidad_animales

          FROM potreros

          WHERE id = $1
            AND finca_id = $2
        `,
        [
          potreroId,
          fincaId
        ]
      );


    if (
      potreroResultado.rows.length === 0
    ) {

      return res.status(404).json({
        ok: false,
        message: "Potrero no encontrado"
      });

    }


    // Lotes ubicados actualmente en el potrero
    const resultado =
      await pool.query(
        `
          SELECT

            l.id,
            l.nombre,
            l.descripcion,
            l.estado,

            mlp.fecha_ingreso,

            (
              CURRENT_DATE
              -
              mlp.fecha_ingreso::date
            ) + 1 AS dias_permanencia,

            COUNT(al.id)
              FILTER (
                WHERE al.fecha_salida IS NULL
              )::int AS total_animales

          FROM movimientos_lotes_potreros mlp

          INNER JOIN lotes l
            ON l.id = mlp.lote_id

          LEFT JOIN animales_lotes al
            ON al.lote_id = l.id
            AND al.fecha_salida IS NULL

          WHERE mlp.potrero_id = $1

            AND mlp.fecha_salida IS NULL

            AND l.finca_id = $2

          GROUP BY
            l.id,
            l.nombre,
            l.descripcion,
            l.estado,
            mlp.fecha_ingreso

          ORDER BY
            l.nombre ASC
        `,
        [
          potreroId,
          fincaId
        ]
      );


    return res.status(200).json({

      ok: true,

      potrero:
        potreroResultado.rows[0],

      total_lotes:
        resultado.rows.length,

      lotes:
        resultado.rows

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar los lotes del potrero"
    });

  }

};