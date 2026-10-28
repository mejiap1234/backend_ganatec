import pool from "../config/db.js";

export const crearTratamiento = async (req, res) => {
  try {

    const animalId = Number(req.params.animalId);
    const eventoId = Number(req.params.eventoId);

    const fincaId = req.usuario.finca_id;
    const usuarioId = req.usuario.id;

    const {
      descripcion,
      fecha_inicio,
      fecha_fin,
      observacion
    } = req.body;


    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido"
      });
    }


    if (!Number.isInteger(eventoId) || eventoId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de evento inválido"
      });
    }


    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada"
      });
    }


    if (!descripcion || !descripcion.trim()) {
      return res.status(400).json({
        ok: false,
        message: "La descripción del tratamiento es obligatoria"
      });
    }


    const animalResultado = await pool.query(
      `
        SELECT
          id,
          identificacion,
          nombre

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


    const eventoResultado = await pool.query(
      `
        SELECT
          id,
          animal_id,
          tipo_evento,
          titulo,
          estado

        FROM eventos_salud

        WHERE id = $1
          AND animal_id = $2
      `,
      [
        eventoId,
        animalId
      ]
    );


    if (eventoResultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Evento de salud no encontrado"
      });
    }


    const descripcionLimpia = descripcion.trim();

    const observacionLimpia =
      observacion?.trim() || null;


    const resultado = await pool.query(
      `
        INSERT INTO tratamientos
        (
          evento_salud_id,
          descripcion,
          fecha_inicio,
          fecha_fin,
          observacion,
          registrado_por
        )

        VALUES (
          $1,
          $2,
          COALESCE($3::date, CURRENT_DATE),
          $4,
          $5,
          $6
        )

        RETURNING
          id,
          evento_salud_id,
          descripcion,
          fecha_inicio,
          fecha_fin,
          estado,
          observacion,
          registrado_por,
          fecha_creacion
      `,
      [
        eventoId,
        descripcionLimpia,
        fecha_inicio || null,
        fecha_fin || null,
        observacionLimpia,
        usuarioId
      ]
    );


    res.status(201).json({
      ok: true,
      message: "Tratamiento registrado correctamente",

      animal: animalResultado.rows[0],

      evento_salud: eventoResultado.rows[0],

      tratamiento: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "Alguna de las fechas no es válida"
      });
    }


    if (error.code === "23514") {
      return res.status(400).json({
        ok: false,
        message: "La fecha de finalización no puede ser anterior a la fecha de inicio"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al registrar el tratamiento"
    });

  }
};



export const listarTratamientos = async (req, res) => {
  try {

    const animalId = Number(req.params.animalId);
    const eventoId = Number(req.params.eventoId);

    const fincaId = req.usuario.finca_id;


    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido"
      });
    }


    if (!Number.isInteger(eventoId) || eventoId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de evento inválido"
      });
    }


    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada"
      });
    }


    const verificacion = await pool.query(
      `
        SELECT
          a.id AS animal_id,
          a.identificacion,
          a.nombre,

          e.id AS evento_id,
          e.tipo_evento,
          e.titulo,
          e.estado AS evento_estado

        FROM eventos_salud e

        INNER JOIN animales a
          ON e.animal_id = a.id

        WHERE e.id = $1
          AND a.id = $2
          AND a.finca_id = $3
      `,
      [
        eventoId,
        animalId,
        fincaId
      ]
    );


    if (verificacion.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Evento de salud no encontrado"
      });
    }


    const tratamientosResultado = await pool.query(
  `
    SELECT
      t.id,
      t.descripcion,
      t.fecha_inicio,
      t.fecha_fin,
      t.estado,
      t.observacion,
      t.fecha_creacion,

      u.id AS registrado_por_id,
      u.nombre AS registrado_por_nombre,
      u.apellido AS registrado_por_apellido,

      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'medicamento', m.medicamento,
              'dosis', m.dosis,
              'frecuencia', m.frecuencia,
              'via_administracion', m.via_administracion,
              'duracion_dias', m.duracion_dias,
              'observacion', m.observacion,
              'registrado_por', m.registrado_por,
              'fecha_creacion', m.fecha_creacion
            )
            ORDER BY m.id ASC
          )
          FROM medicamentos_tratamiento m
          WHERE m.tratamiento_id = t.id
        ),
        '[]'::jsonb
      ) AS medicamentos,

      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', h.id,
              'estado_anterior', h.estado_anterior,
              'estado_nuevo', h.estado_nuevo,
              'motivo', h.motivo,
              'cambiado_por', h.cambiado_por,
              'fecha_cambio', h.fecha_cambio
            )
            ORDER BY h.fecha_cambio ASC
          )
          FROM historial_estados_tratamientos h
          WHERE h.tratamiento_id = t.id
        ),
        '[]'::jsonb
      ) AS historial_estados

    FROM tratamientos t

    LEFT JOIN usuarios u
      ON t.registrado_por = u.id

    WHERE t.evento_salud_id = $1

    ORDER BY
      t.fecha_inicio DESC,
      t.id DESC
  `,
  [eventoId]
);


    const datos = verificacion.rows[0];


    res.status(200).json({
      ok: true,

      animal: {
        id: datos.animal_id,
        identificacion: datos.identificacion,
        nombre: datos.nombre
      },

      evento_salud: {
        id: datos.evento_id,
        tipo_evento: datos.tipo_evento,
        titulo: datos.titulo,
        estado: datos.evento_estado
      },

      total: tratamientosResultado.rows.length,

      tratamientos: tratamientosResultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener los tratamientos"
    });

  }
};


/** Cambiar el estado de un tratamiento */
export const cambiarEstadoTratamiento = async (req, res) => {

  const animalId = Number(req.params.animalId);
  const eventoId = Number(req.params.eventoId);
  const tratamientoId = Number(req.params.tratamientoId);

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    estado,
    motivo
  } = req.body;


  if (!Number.isInteger(animalId) || animalId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de animal inválido"
    });
  }


  if (!Number.isInteger(eventoId) || eventoId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de evento inválido"
    });
  }


  if (!Number.isInteger(tratamientoId) || tratamientoId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de tratamiento inválido"
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


  const estadoNormalizado =
    estado.trim().toLowerCase();


  const estadosPermitidos = [
    "activo",
    "finalizado",
    "suspendido"
  ];


  if (!estadosPermitidos.includes(estadoNormalizado)) {
    return res.status(400).json({
      ok: false,
      message: "Estado de tratamiento inválido"
    });
  }


  if (!motivo || !motivo.trim()) {
    return res.status(400).json({
      ok: false,
      message: "El motivo del cambio de estado es obligatorio"
    });
  }


  const client = await pool.connect();


  try {

    await client.query("BEGIN");


    const resultadoTratamiento = await client.query(
      `
        SELECT
          t.id,
          t.descripcion,
          t.estado,

          e.id AS evento_id,
          e.titulo AS evento_titulo,

          a.id AS animal_id,
          a.identificacion,
          a.nombre

        FROM tratamientos t

        INNER JOIN eventos_salud e
          ON t.evento_salud_id = e.id

        INNER JOIN animales a
          ON e.animal_id = a.id

        WHERE t.id = $1
          AND e.id = $2
          AND a.id = $3
          AND a.finca_id = $4

        FOR UPDATE
      `,
      [
        tratamientoId,
        eventoId,
        animalId,
        fincaId
      ]
    );


    if (resultadoTratamiento.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Tratamiento no encontrado"
      });

    }


    const tratamiento =
      resultadoTratamiento.rows[0];

    const estadoAnterior =
      tratamiento.estado;


    if (estadoAnterior === estadoNormalizado) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: `El tratamiento ya se encuentra ${estadoNormalizado}`
      });

    }


    const transicionesPermitidas = {
      activo: [
        "finalizado",
        "suspendido"
      ],

      suspendido: [
        "activo"
      ],

      finalizado: []
    };


    if (
      !transicionesPermitidas[estadoAnterior]
        .includes(estadoNormalizado)
    ) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: `No se puede cambiar un tratamiento de ${estadoAnterior} a ${estadoNormalizado}`
      });

    }


    const actualizacion = await client.query(
      `
        UPDATE tratamientos

        SET estado = $1

        WHERE id = $2

        RETURNING
          id,
          evento_salud_id,
          descripcion,
          fecha_inicio,
          fecha_fin,
          estado,
          observacion,
          registrado_por,
          fecha_creacion
      `,
      [
        estadoNormalizado,
        tratamientoId
      ]
    );


    const historial = await client.query(
      `
        INSERT INTO historial_estados_tratamientos
        (
          tratamiento_id,
          estado_anterior,
          estado_nuevo,
          motivo,
          cambiado_por
        )

        VALUES ($1, $2, $3, $4, $5)

        RETURNING
          id,
          tratamiento_id,
          estado_anterior,
          estado_nuevo,
          motivo,
          cambiado_por,
          fecha_cambio
      `,
      [
        tratamientoId,
        estadoAnterior,
        estadoNormalizado,
        motivo.trim(),
        usuarioId
      ]
    );


    await client.query("COMMIT");


    res.status(200).json({
      ok: true,
      message: "Estado del tratamiento actualizado correctamente",

      tratamiento: actualizacion.rows[0],

      cambio: historial.rows[0]
    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al cambiar el estado del tratamiento"
    });

  } finally {

    client.release();

  }

};