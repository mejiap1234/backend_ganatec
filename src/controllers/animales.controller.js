import pool from "../config/db.js";

export const crearAnimal = async (req, res) => {
  try {

    const {
      identificacion,
      nombre,
      sexo,
      fecha_nacimiento,
      raza,
      notas
    } = req.body;


    const fincaId = req.usuario.finca_id;
    const creadoPor = req.usuario.id;


    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada"
      });
    }


    if (!identificacion || !sexo) {
      return res.status(400).json({
        ok: false,
        message: "Identificación y sexo son obligatorios"
      });
    }


    const identificacionLimpia = identificacion.trim();
    const sexoNormalizado = sexo.trim().toLowerCase();

    const nombreLimpio = nombre?.trim() || null;
    const razaLimpia = raza?.trim() || null;
    const notasLimpias = notas?.trim() || null;


    if (!["macho", "hembra"].includes(sexoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: "El sexo debe ser macho o hembra"
      });
    }


    const resultado = await pool.query(
      `
        INSERT INTO animales
        (
          finca_id,
          identificacion,
          nombre,
          sexo,
          fecha_nacimiento,
          raza,
          notas,
          creado_por
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)

        RETURNING
          id,
          finca_id,
          identificacion,
          nombre,
          sexo,
          fecha_nacimiento,
          raza,
          estado,
          notas,
          creado_por,
          fecha_creacion
      `,
      [
        fincaId,
        identificacionLimpia,
        nombreLimpio,
        sexoNormalizado,
        fecha_nacimiento || null,
        razaLimpia,
        notasLimpias,
        creadoPor
      ]
    );


    res.status(201).json({
      ok: true,
      message: "Animal registrado correctamente",
      animal: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "Ya existe un animal con esa identificación en esta finca"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al registrar el animal"
    });

  }
};

/**LISTAR ANIMALES */
export const listarAnimales = async (req, res) => {
  try {

    const fincaId = req.usuario.finca_id;


    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada"
      });
    }


    const resultado = await pool.query(
      `
        SELECT
          id,
          identificacion,
          nombre,
          sexo,
          fecha_nacimiento,
          raza,
          estado,
          notas,
          creado_por,
          fecha_creacion
        FROM animales
        WHERE finca_id = $1
        ORDER BY identificacion ASC
      `,
      [fincaId]
    );


    res.status(200).json({
      ok: true,
      total: resultado.rows.length,
      animales: resultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener los animales"
    });

  }
};


/**OBTENER ANIMAL POR ID */
export const obtenerAnimal = async (req, res) => {
  try {

    const animalId = Number(req.params.id);
    const fincaId = req.usuario.finca_id;


    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido"
      });
    }


    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada"
      });
    }


    const resultado = await pool.query(
      `
        SELECT
          id,
          identificacion,
          nombre,
          sexo,
          fecha_nacimiento,
          raza,
          estado,
          notas,
          creado_por,
          fecha_creacion
        FROM animales
        WHERE id = $1
          AND finca_id = $2
      `,
      [
        animalId,
        fincaId
      ]
    );


    if (resultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Animal no encontrado"
      });
    }


    res.status(200).json({
      ok: true,
      animal: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener el animal"
    });

  }
};

/**ACTUALIZAR ANIMAL */
export const actualizarAnimal = async (req, res) => {
  try {

    const animalId = Number(req.params.id);
    const fincaId = req.usuario.finca_id;

    const {
      identificacion,
      nombre,
      sexo,
      fecha_nacimiento,
      raza,
      notas
    } = req.body;


    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido"
      });
    }


    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada"
      });
    }


    if (!identificacion || !sexo) {
      return res.status(400).json({
        ok: false,
        message: "Identificación y sexo son obligatorios"
      });
    }


    const identificacionLimpia = identificacion.trim();
    const sexoNormalizado = sexo.trim().toLowerCase();

    const nombreLimpio = nombre?.trim() || null;
    const razaLimpia = raza?.trim() || null;
    const notasLimpias = notas?.trim() || null;


    if (!["macho", "hembra"].includes(sexoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: "El sexo debe ser macho o hembra"
      });
    }


    const identificacionExistente = await pool.query(
      `
        SELECT id
        FROM animales
        WHERE finca_id = $1
          AND identificacion = $2
          AND id <> $3
      `,
      [
        fincaId,
        identificacionLimpia,
        animalId
      ]
    );


    if (identificacionExistente.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        message: "Ya existe otro animal con esa identificación"
      });
    }


    const resultado = await pool.query(
      `
        UPDATE animales

        SET
          identificacion = $1,
          nombre = $2,
          sexo = $3,
          fecha_nacimiento = $4,
          raza = $5,
          notas = $6

        WHERE id = $7
          AND finca_id = $8

        RETURNING
          id,
          identificacion,
          nombre,
          sexo,
          fecha_nacimiento,
          raza,
          estado,
          notas,
          creado_por,
          fecha_creacion
      `,
      [
        identificacionLimpia,
        nombreLimpio,
        sexoNormalizado,
        fecha_nacimiento || null,
        razaLimpia,
        notasLimpias,
        animalId,
        fincaId
      ]
    );


    if (resultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Animal no encontrado"
      });
    }


    res.status(200).json({
      ok: true,
      message: "Animal actualizado correctamente",
      animal: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "Ya existe otro animal con esa identificación"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al actualizar el animal"
    });

  }
};

/**cambiarEstadoAnimal */
export const cambiarEstadoAnimal = async (req, res) => {

  const animalId = Number(req.params.id);

  const {
    estado,
    observacion
  } = req.body;

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;


  if (!Number.isInteger(animalId) || animalId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de animal inválido"
    });
  }


  if (!fincaId) {
    return res.status(400).json({
      ok: false,
      message: "El usuario no tiene una finca asociada"
    });
  }


  if (!estado) {
    return res.status(400).json({
      ok: false,
      message: "El estado es obligatorio"
    });
  }


  const estadoNormalizado = estado
    .trim()
    .toLowerCase();


  const estadosPermitidos = [
    "activo",
    "vendido",
    "muerto",
    "trasladado"
  ];


  if (!estadosPermitidos.includes(estadoNormalizado)) {
    return res.status(400).json({
      ok: false,
      message: "Estado de animal inválido"
    });
  }


  const observacionLimpia =
    observacion?.trim() || null;


  const client = await pool.connect();


  try {

    await client.query("BEGIN");


    const resultadoAnimal = await client.query(
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
      [
        animalId,
        fincaId
      ]
    );


    if (resultadoAnimal.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Animal no encontrado"
      });

    }


    const animal = resultadoAnimal.rows[0];

    const estadoAnterior = animal.estado;


    if (estadoAnterior === estadoNormalizado) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: `El animal ya se encuentra en estado ${estadoNormalizado}`
      });

    }


    const resultadoActualizacion = await client.query(
      `
        UPDATE animales

        SET estado = $1

        WHERE id = $2
          AND finca_id = $3

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
        estadoNormalizado,
        animalId,
        fincaId
      ]
    );


    const resultadoHistorial = await client.query(
      `
        INSERT INTO historial_estados_animales
        (
          animal_id,
          finca_id,
          estado_anterior,
          estado_nuevo,
          observacion,
          cambiado_por
        )

        VALUES ($1, $2, $3, $4, $5, $6)

        RETURNING
          id,
          animal_id,
          estado_anterior,
          estado_nuevo,
          observacion,
          cambiado_por,
          fecha_cambio
      `,
      [
        animalId,
        fincaId,
        estadoAnterior,
        estadoNormalizado,
        observacionLimpia,
        usuarioId
      ]
    );


    await client.query("COMMIT");


    res.status(200).json({
      ok: true,
      message: "Estado del animal actualizado correctamente",

      animal: resultadoActualizacion.rows[0],

      cambio: resultadoHistorial.rows[0]
    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al cambiar el estado del animal"
    });

  } finally {

    client.release();

  }

};

/** listar historial de estados */
export const listarHistorialEstados = async (req, res) => {
  try {

    const animalId = Number(req.params.id);
    const fincaId = req.usuario.finca_id;


    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido"
      });
    }


    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada"
      });
    }


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
      [
        animalId,
        fincaId
      ]
    );


    if (animalResultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Animal no encontrado"
      });
    }


    const historialResultado = await pool.query(
      `
        SELECT
          h.id,
          h.estado_anterior,
          h.estado_nuevo,
          h.observacion,
          h.fecha_cambio,

          u.id AS usuario_id,
          u.nombre AS usuario_nombre,
          u.apellido AS usuario_apellido

        FROM historial_estados_animales h

        LEFT JOIN usuarios u
          ON h.cambiado_por = u.id

        WHERE h.animal_id = $1
          AND h.finca_id = $2

        ORDER BY h.fecha_cambio DESC
      `,
      [
        animalId,
        fincaId
      ]
    );


    res.status(200).json({
      ok: true,

      animal: animalResultado.rows[0],

      total: historialResultado.rows.length,

      historial: historialResultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener el historial del animal"
    });

  }
};