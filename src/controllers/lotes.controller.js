import pool from "../config/db.js";


// ==========================================
// CREAR LOTE
// ==========================================

export const crearLote = async (req, res) => {

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    nombre,
    descripcion
  } = req.body;


  if (!nombre || !nombre.trim()) {
    return res.status(400).json({
      ok: false,
      message: "El nombre del lote es obligatorio"
    });
  }


  try {

    const resultado = await pool.query(
      `
        INSERT INTO lotes (
          finca_id,
          nombre,
          descripcion,
          creado_por
        )

        VALUES ($1, $2, $3, $4)

        RETURNING *
      `,
      [
        fincaId,
        nombre.trim(),
        descripcion?.trim() || null,
        usuarioId
      ]
    );


    return res.status(201).json({
      ok: true,
      message: "Lote creado correctamente",
      lote: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "Ya existe un lote con ese nombre en la finca"
      });
    }


    return res.status(500).json({
      ok: false,
      message: "Error al crear el lote"
    });

  }

};



// ==========================================
// LISTAR LOTES
// ==========================================

export const listarLotes = async (req, res) => {

  const fincaId = req.usuario.finca_id;


  try {

    const resultado = await pool.query(
      `
        SELECT
          l.id,
          l.nombre,
          l.descripcion,
          l.estado,
          l.fecha_creacion,

          COUNT(al.id)
            FILTER (
              WHERE al.fecha_salida IS NULL
            )::int AS total_animales

        FROM lotes l

        LEFT JOIN animales_lotes al
          ON al.lote_id = l.id

        WHERE l.finca_id = $1

        GROUP BY l.id

        ORDER BY l.nombre ASC
      `,
      [fincaId]
    );


    return res.status(200).json({
      ok: true,
      total: resultado.rows.length,
      lotes: resultado.rows
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message: "Error al consultar los lotes"
    });

  }

};



// ==========================================
// AGREGAR ANIMAL A UN LOTE
// ==========================================

export const agregarAnimalLote = async (req, res) => {

  const loteId = Number(req.params.loteId);
  const animalId = Number(req.params.animalId);

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;


  if (
    !Number.isInteger(loteId) ||
    loteId <= 0 ||
    !Number.isInteger(animalId) ||
    animalId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "ID de lote o animal inválido"
    });
  }


  try {

    // Verificar que el lote pertenece a la finca.
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
      [loteId, fincaId]
    );


    if (loteResultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Lote no encontrado"
      });
    }


    const lote = loteResultado.rows[0];


    if (lote.estado !== "activo") {
      return res.status(400).json({
        ok: false,
        message:
          "No se pueden agregar animales a un lote inactivo"
      });
    }


    // Verificar animal.
    const animalResultado = await pool.query(
      `
        SELECT
          id,
          identificacion,
          nombre,
          estado

        FROM animales

        WHERE id = $1
          AND finca_id = $2
      `,
      [animalId, fincaId]
    );


    if (animalResultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Animal no encontrado"
      });
    }


    const animal = animalResultado.rows[0];


    if (animal.estado !== "activo") {
      return res.status(400).json({
        ok: false,
        message:
          "Solo los animales activos pueden asignarse a un lote"
      });
    }


    // Verificar si ya pertenece a algún lote activo.
    const loteActualResultado = await pool.query(
      `
        SELECT
          al.id,
          al.lote_id,
          l.nombre AS lote_nombre

        FROM animales_lotes al

        INNER JOIN lotes l
          ON l.id = al.lote_id

        WHERE al.animal_id = $1
          AND al.fecha_salida IS NULL
      `,
      [animalId]
    );


    if (loteActualResultado.rows.length > 0) {

      const loteActual =
        loteActualResultado.rows[0];

      return res.status(409).json({
        ok: false,
        message:
          `El animal ya pertenece al lote "${loteActual.lote_nombre}"`,
        lote_actual: loteActual
      });
    }


    const resultado = await pool.query(
      `
        INSERT INTO animales_lotes (
          lote_id,
          animal_id,
          registrado_por
        )

        VALUES ($1, $2, $3)

        RETURNING *
      `,
      [
        loteId,
        animalId,
        usuarioId
      ]
    );


    return res.status(201).json({

      ok: true,

      message:
        "Animal agregado al lote correctamente",

      lote: {
        id: lote.id,
        nombre: lote.nombre
      },

      animal: {
        id: animal.id,
        identificacion: animal.identificacion,
        nombre: animal.nombre
      },

      asignacion: resultado.rows[0]

    });


  } catch (error) {

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "El animal ya pertenece a un lote activo"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al agregar el animal al lote"
    });

  }

};



// ==========================================
// LISTAR ANIMALES DE UN LOTE
// ==========================================

export const listarAnimalesLote = async (req, res) => {

  const loteId = Number(req.params.loteId);
  const fincaId = req.usuario.finca_id;


  if (!Number.isInteger(loteId) || loteId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de lote inválido"
    });
  }


  try {

    // Verificar que el lote pertenece a la finca.
    const loteResultado = await pool.query(
      `
        SELECT
          id,
          nombre,
          descripcion,
          estado
        FROM lotes
        WHERE id = $1
          AND finca_id = $2
      `,
      [loteId, fincaId]
    );


    if (loteResultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Lote no encontrado"
      });
    }


    const animalesResultado = await pool.query(
      `
        SELECT
          a.id,
          a.identificacion,
          a.nombre,
          a.sexo,
          a.raza,
          a.fecha_nacimiento,
          a.estado,

          al.fecha_ingreso

        FROM animales_lotes al

        INNER JOIN animales a
          ON a.id = al.animal_id

        WHERE al.lote_id = $1
          AND al.fecha_salida IS NULL
          AND a.finca_id = $2

        ORDER BY
          a.identificacion ASC
      `,
      [loteId, fincaId]
    );


    return res.status(200).json({

      ok: true,

      lote: loteResultado.rows[0],

      total_animales:
        animalesResultado.rows.length,

      animales:
        animalesResultado.rows

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar los animales del lote"
    });

  }

};


// ==========================================
// RETIRAR ANIMAL DE UN LOTE
// ==========================================

export const retirarAnimalLote = async (req, res) => {

  const loteId = Number(req.params.loteId);
  const animalId = Number(req.params.animalId);

  const fincaId = req.usuario.finca_id;

  const {
    motivo_salida
  } = req.body;


  if (
    !Number.isInteger(loteId) ||
    loteId <= 0 ||
    !Number.isInteger(animalId) ||
    animalId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "ID de lote o animal inválido"
    });
  }


  if (!motivo_salida || !motivo_salida.trim()) {
    return res.status(400).json({
      ok: false,
      message:
        "El motivo de salida es obligatorio"
    });
  }


  try {

    const resultado = await pool.query(
      `
        UPDATE animales_lotes al

        SET
          fecha_salida = CURRENT_TIMESTAMP,
          motivo_salida = $1

        FROM lotes l,
             animales a

        WHERE al.id = (
          SELECT al2.id
          FROM animales_lotes al2
          WHERE al2.lote_id = $2
            AND al2.animal_id = $3
            AND al2.fecha_salida IS NULL
          LIMIT 1
        )

        AND l.id = al.lote_id
        AND a.id = al.animal_id

        AND l.finca_id = $4
        AND a.finca_id = $4

        RETURNING
          al.id,
          al.lote_id,
          al.animal_id,
          al.fecha_ingreso,
          al.fecha_salida,
          al.motivo_salida
      `,
      [
        motivo_salida.trim(),
        loteId,
        animalId,
        fincaId
      ]
    );


    if (resultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message:
          "El animal no pertenece actualmente a ese lote"
      });
    }


    return res.status(200).json({
      ok: true,
      message:
        "Animal retirado del lote correctamente",
      asignacion: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al retirar el animal del lote"
    });

  }

};



// ==========================================
// MOVER ANIMAL ENTRE LOTES
// ==========================================

export const moverAnimalLote = async (req, res) => {

  const animalId = Number(req.params.animalId);

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    lote_destino_id,
    motivo
  } = req.body;


  const loteDestinoId =
    Number(lote_destino_id);


  if (
    !Number.isInteger(animalId) ||
    animalId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "ID de animal inválido"
    });
  }


  if (
    !Number.isInteger(loteDestinoId) ||
    loteDestinoId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "El lote de destino es inválido"
    });
  }


  if (!motivo || !motivo.trim()) {
    return res.status(400).json({
      ok: false,
      message:
        "El motivo del movimiento es obligatorio"
    });
  }


  const client = await pool.connect();


  try {

    await client.query("BEGIN");


    // ---------------------------------------
    // VALIDAR ANIMAL
    // ---------------------------------------

    const animalResultado = await client.query(
      `
        SELECT
          id,
          identificacion,
          nombre,
          estado

        FROM animales

        WHERE id = $1
          AND finca_id = $2

        FOR UPDATE
      `,
      [animalId, fincaId]
    );


    if (animalResultado.rows.length === 0) {

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

      return res.status(400).json({
        ok: false,
        message:
          "Solo los animales activos pueden cambiar de lote"
      });

    }


    // ---------------------------------------
    // VALIDAR LOTE DE DESTINO
    // ---------------------------------------

    const destinoResultado = await client.query(
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
        loteDestinoId,
        fincaId
      ]
    );


    if (destinoResultado.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message:
          "Lote de destino no encontrado"
      });

    }


    const loteDestino =
      destinoResultado.rows[0];


    if (loteDestino.estado !== "activo") {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message:
          "El lote de destino está inactivo"
      });

    }


    // ---------------------------------------
    // BUSCAR LOTE ACTUAL
    // ---------------------------------------

    const actualResultado = await client.query(
      `
        SELECT
          al.id,
          al.lote_id,
          al.fecha_ingreso,
          l.nombre AS lote_nombre

        FROM animales_lotes al

        INNER JOIN lotes l
          ON l.id = al.lote_id

        WHERE al.animal_id = $1
          AND al.fecha_salida IS NULL

        FOR UPDATE OF al
      `,
      [animalId]
    );


    let loteAnterior = null;


    if (actualResultado.rows.length > 0) {

      loteAnterior =
        actualResultado.rows[0];


      // No tiene sentido moverlo al mismo lote.
      if (
        Number(loteAnterior.lote_id) ===
        loteDestinoId
      ) {

        await client.query("ROLLBACK");

        return res.status(409).json({
          ok: false,
          message:
            "El animal ya pertenece a ese lote"
        });

      }


      // Cerramos la asignación anterior.
      await client.query(
        `
          UPDATE animales_lotes

          SET
            fecha_salida = CURRENT_TIMESTAMP,
            motivo_salida = $1

          WHERE id = $2
        `,
        [
          motivo.trim(),
          loteAnterior.id
        ]
      );

    }


    // ---------------------------------------
    // CREAR NUEVA ASIGNACIÓN
    // ---------------------------------------

    const nuevaAsignacion =
      await client.query(
        `
          INSERT INTO animales_lotes (
            lote_id,
            animal_id,
            registrado_por
          )

          VALUES ($1, $2, $3)

          RETURNING *
        `,
        [
          loteDestinoId,
          animalId,
          usuarioId
        ]
      );


    await client.query("COMMIT");


    return res.status(200).json({

      ok: true,

      message:
        "Animal movido de lote correctamente",

      animal: {
        id: animal.id,
        identificacion:
          animal.identificacion,
        nombre: animal.nombre
      },

      lote_anterior:
        loteAnterior
          ? {
              id: loteAnterior.lote_id,
              nombre:
                loteAnterior.lote_nombre
            }
          : null,

      lote_destino: {
        id: loteDestino.id,
        nombre: loteDestino.nombre
      },

      asignacion:
        nuevaAsignacion.rows[0]

    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "El animal ya tiene una asignación activa"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al mover el animal entre lotes"
    });


  } finally {

    client.release();

  }


  

};


// ==========================================
// LISTAR ANIMALES DISPONIBLES PARA LOTE
// ==========================================

export const listarAnimalesDisponibles = async (
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

            a.id,
            a.identificacion,
            a.nombre,
            a.sexo,
            a.raza,
            a.fecha_nacimiento,
            a.estado

          FROM animales a

          LEFT JOIN animales_lotes al
            ON al.animal_id = a.id
            AND al.fecha_salida IS NULL

          WHERE a.finca_id = $1

            AND a.estado = 'activo'

            AND al.id IS NULL

          ORDER BY
            a.identificacion ASC
        `,
        [
          fincaId
        ]
      );


    return res.status(200).json({

      ok: true,

      total:
        resultado.rows.length,

      animales:
        resultado.rows

    });


  } catch (error) {

    console.error(error);


    return res.status(500).json({

      ok: false,

      message:
        "Error al consultar los animales disponibles"

    });

  }

};