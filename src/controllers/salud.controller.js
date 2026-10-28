import pool from "../config/db.js";


export const registrarEventoSalud = async (req, res) => {
  try {

    const animalId = Number(req.params.id);

    const fincaId = req.usuario.finca_id;
    const usuarioId = req.usuario.id;

    const {
      tipo_evento,
      titulo,
      descripcion,
      gravedad,
      fecha_evento
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


    if (!tipo_evento || !titulo) {
      return res.status(400).json({
        ok: false,
        message: "Tipo de evento y título son obligatorios"
      });
    }


    const tipoNormalizado =
      tipo_evento.trim().toLowerCase();

    const tiposPermitidos = [
      "revision",
      "sintoma",
      "diagnostico",
      "enfermedad",
      "accidente",
      "otro"
    ];


    if (!tiposPermitidos.includes(tipoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: "Tipo de evento de salud inválido"
      });
    }


    let gravedadNormalizada = null;

    if (gravedad) {

      gravedadNormalizada =
        gravedad.trim().toLowerCase();

      const gravedadesPermitidas = [
        "leve",
        "moderada",
        "grave"
      ];

      if (
        !gravedadesPermitidas.includes(
          gravedadNormalizada
        )
      ) {
        return res.status(400).json({
          ok: false,
          message: "Gravedad inválida"
        });
      }

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


    const tituloLimpio = titulo.trim();

    const descripcionLimpia =
      descripcion?.trim() || null;


    const resultado = await pool.query(
      `
        INSERT INTO eventos_salud
        (
          animal_id,
          tipo_evento,
          titulo,
          descripcion,
          gravedad,
          fecha_evento,
          registrado_por
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          COALESCE($6::date, CURRENT_DATE),
          $7
        )

        RETURNING
          id,
          animal_id,
          tipo_evento,
          titulo,
          descripcion,
          gravedad,
          fecha_evento,
          estado,
          registrado_por,
          fecha_creacion
      `,
      [
        animalId,
        tipoNormalizado,
        tituloLimpio,
        descripcionLimpia,
        gravedadNormalizada,
        fecha_evento || null,
        usuarioId
      ]
    );


    res.status(201).json({
      ok: true,
      message: "Evento de salud registrado correctamente",

      animal: animalResultado.rows[0],

      evento: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "La fecha del evento no es válida"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al registrar el evento de salud"
    });

  }
};

/** Listar eventos de salud */
export const listarEventosSalud = async (req, res) => {
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
          sexo,
          raza,
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


   const eventosResultado = await pool.query(
  `
    SELECT
      e.id,
      e.tipo_evento,
      e.titulo,
      e.descripcion,
      e.gravedad,
      e.fecha_evento,
      e.estado,
      e.fecha_creacion,

      e.cerrado_por,
      e.fecha_cierre,
      e.motivo_cierre,

      registrador.id AS registrado_por_id,
      registrador.nombre AS registrado_por_nombre,
      registrador.apellido AS registrado_por_apellido,

      cerrador.id AS cerrado_por_id,
      cerrador.nombre AS cerrado_por_nombre,
      cerrador.apellido AS cerrado_por_apellido

    FROM eventos_salud e

    LEFT JOIN usuarios registrador
      ON e.registrado_por = registrador.id

    LEFT JOIN usuarios cerrador
      ON e.cerrado_por = cerrador.id

    WHERE e.animal_id = $1

    ORDER BY
      e.fecha_evento DESC,
      e.id DESC
  `,
  [animalId]
);


    res.status(200).json({
      ok: true,

      animal: animalResultado.rows[0],

      total: eventosResultado.rows.length,

      eventos: eventosResultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener el historial de salud"
    });

  }
};

/** Cambiar estado de evento de salud */

export const cambiarEstadoEventoSalud = async (req, res) => {
  try {

    const animalId = Number(req.params.animalId);
    const eventoId = Number(req.params.eventoId);

    const fincaId = req.usuario.finca_id;
    const usuarioId = req.usuario.id;

    const {
      estado,
      motivo_cierre
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


    if (!estado) {
      return res.status(400).json({
        ok: false,
        message: "El estado es obligatorio"
      });
    }


    const estadoNormalizado =
      estado.trim().toLowerCase();


    const estadosPermitidos = [
      "abierto",
      "cerrado"
    ];


    if (!estadosPermitidos.includes(estadoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: "El estado debe ser abierto o cerrado"
      });
    }


    const animalResultado = await pool.query(
      `
        SELECT id
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


    const evento = eventoResultado.rows[0];


    if (evento.estado === estadoNormalizado) {
      return res.status(400).json({
        ok: false,
        message: `El evento ya se encuentra ${estadoNormalizado}`
      });
    }


    let resultado;


    if (estadoNormalizado === "cerrado") {

      if (!motivo_cierre || !motivo_cierre.trim()) {
        return res.status(400).json({
          ok: false,
          message: "El motivo de cierre es obligatorio"
        });
      }


      resultado = await pool.query(
        `
          UPDATE eventos_salud

          SET
            estado = 'cerrado',
            cerrado_por = $1,
            fecha_cierre = CURRENT_TIMESTAMP,
            motivo_cierre = $2

          WHERE id = $3
            AND animal_id = $4

          RETURNING
            id,
            animal_id,
            tipo_evento,
            titulo,
            descripcion,
            gravedad,
            fecha_evento,
            estado,
            registrado_por,
            cerrado_por,
            fecha_cierre,
            motivo_cierre,
            fecha_creacion
        `,
        [
          usuarioId,
          motivo_cierre.trim(),
          eventoId,
          animalId
        ]
      );

    } else {

      resultado = await pool.query(
        `
          UPDATE eventos_salud

          SET
            estado = 'abierto',
            cerrado_por = NULL,
            fecha_cierre = NULL,
            motivo_cierre = NULL

          WHERE id = $1
            AND animal_id = $2

          RETURNING
            id,
            animal_id,
            tipo_evento,
            titulo,
            descripcion,
            gravedad,
            fecha_evento,
            estado,
            registrado_por,
            cerrado_por,
            fecha_cierre,
            motivo_cierre,
            fecha_creacion
        `,
        [
          eventoId,
          animalId
        ]
      );

    }


    res.status(200).json({
      ok: true,
      message:
        estadoNormalizado === "cerrado"
          ? "Evento de salud cerrado correctamente"
          : "Evento de salud reabierto correctamente",

      evento: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al cambiar el estado del evento de salud"
    });

  }
};