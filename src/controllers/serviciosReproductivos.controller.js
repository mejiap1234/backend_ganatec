import pool from "../config/db.js";

export const registrarServicioReproductivo = async (req, res) => {
  try {

    const animalId = Number(req.params.id);

    const fincaId = req.usuario.finca_id;
    const usuarioId = req.usuario.id;

    const {
      tipo_servicio,
      fecha_servicio,
      reproductor_id,
      reproductor_externo,
      codigo_semen,
      responsable,
      observacion
    } = req.body;


    // 1. Validar ID del animal
    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido"
      });
    }


    // 2. Validar finca
    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada"
      });
    }


    // 3. Validar tipo de servicio
    if (!tipo_servicio) {
      return res.status(400).json({
        ok: false,
        message: "El tipo de servicio es obligatorio"
      });
    }


    const tipoNormalizado =
      tipo_servicio.trim().toLowerCase();


    const tiposPermitidos = [
      "inseminacion_artificial",
      "monta_natural"
    ];


    if (!tiposPermitidos.includes(tipoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: "Tipo de servicio reproductivo inválido"
      });
    }


    // 4. Buscar el animal receptor
    const animalResultado = await pool.query(
      `
        SELECT
          id,
          identificacion,
          nombre,
          sexo,
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


    const animal = animalResultado.rows[0];


    // 5. Solo una hembra puede recibir el servicio
    if (animal.sexo !== "hembra") {
      return res.status(400).json({
        ok: false,
        message: "El servicio reproductivo solo puede registrarse para una hembra"
      });
    }


    // 6. Debe ser un animal activo
    if (animal.estado !== "activo") {
      return res.status(400).json({
        ok: false,
        message: "El animal debe estar activo para registrar un servicio reproductivo"
      });
    }


    let reproductorIdFinal = null;

    const reproductorExternoLimpio =
      reproductor_externo?.trim() || null;


    // 7. No permitir reproductor interno y externo al mismo tiempo
    if (reproductor_id && reproductorExternoLimpio) {
      return res.status(400).json({
        ok: false,
        message: "Debes indicar un reproductor registrado o uno externo, pero no ambos"
      });
    }


    // 8. Debemos conocer el reproductor
    if (!reproductor_id && !reproductorExternoLimpio) {
      return res.status(400).json({
        ok: false,
        message: "Debes indicar el reproductor utilizado"
      });
    }


    // 9. Si escogieron un reproductor de Ganatec
    if (reproductor_id) {

      const reproductorIdNumero =
        Number(reproductor_id);


      if (
        !Number.isInteger(reproductorIdNumero) ||
        reproductorIdNumero <= 0
      ) {
        return res.status(400).json({
          ok: false,
          message: "ID de reproductor inválido"
        });
      }


      const reproductorResultado = await pool.query(
        `
          SELECT
            id,
            identificacion,
            nombre,
            sexo,
            estado

          FROM animales

          WHERE id = $1
            AND finca_id = $2
        `,
        [
          reproductorIdNumero,
          fincaId
        ]
      );


      if (reproductorResultado.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          message: "Reproductor no encontrado"
        });
      }


      const reproductor =
        reproductorResultado.rows[0];


      if (reproductor.sexo !== "macho") {
        return res.status(400).json({
          ok: false,
          message: "El reproductor seleccionado debe ser macho"
        });
      }


      if (reproductor.estado !== "activo") {
        return res.status(400).json({
          ok: false,
          message: "El reproductor debe estar activo"
        });
      }


      reproductorIdFinal =
        reproductorIdNumero;
    }


    // 10. Limpiar campos opcionales
    const codigoSemenLimpio =
      codigo_semen?.trim() || null;

    const responsableLimpio =
      responsable?.trim() || null;

    const observacionLimpia =
      observacion?.trim() || null;


    // 11. Registrar el servicio
    const resultado = await pool.query(
      `
        INSERT INTO servicios_reproductivos
        (
          animal_id,
          tipo_servicio,
          fecha_servicio,
          reproductor_id,
          reproductor_externo,
          codigo_semen,
          responsable,
          observacion,
          registrado_por
        )

        VALUES (
          $1,
          $2,
          COALESCE($3::timestamp, CURRENT_TIMESTAMP),
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
        )

        RETURNING
          id,
          animal_id,
          tipo_servicio,
          fecha_servicio,
          reproductor_id,
          reproductor_externo,
          codigo_semen,
          responsable,
          observacion,
          registrado_por,
          fecha_creacion
      `,
      [
        animalId,
        tipoNormalizado,
        fecha_servicio || null,
        reproductorIdFinal,
        reproductorExternoLimpio,
        codigoSemenLimpio,
        responsableLimpio,
        observacionLimpia,
        usuarioId
      ]
    );


    res.status(201).json({
      ok: true,
      message: "Servicio reproductivo registrado correctamente",

      animal: {
        id: animal.id,
        identificacion: animal.identificacion,
        nombre: animal.nombre
      },

      servicio: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "La fecha del servicio no es válida"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al registrar el servicio reproductivo"
    });

  }
};



export const listarServiciosReproductivos = async (req, res) => {
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


    // Primero verificamos que la hembra pertenece
    // a la finca del usuario
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


    const animal = animalResultado.rows[0];


    // Consultamos todos los servicios reproductivos
    const serviciosResultado = await pool.query(
      `
        SELECT
          sr.id,
          sr.tipo_servicio,
          sr.fecha_servicio,

          sr.reproductor_id,

          r.identificacion AS reproductor_identificacion,
          r.nombre AS reproductor_nombre,
          r.raza AS reproductor_raza,

          sr.reproductor_externo,
          sr.codigo_semen,

          sr.responsable,
          sr.observacion,

          sr.fecha_creacion,

          u.id AS registrado_por_id,
          u.nombre AS registrado_por_nombre,
          u.apellido AS registrado_por_apellido

        FROM servicios_reproductivos sr

        LEFT JOIN animales r
          ON sr.reproductor_id = r.id

        LEFT JOIN usuarios u
          ON sr.registrado_por = u.id

        WHERE sr.animal_id = $1

        ORDER BY
          sr.fecha_servicio DESC,
          sr.id DESC
      `,
      [animalId]
    );


    res.status(200).json({
      ok: true,

      animal: {
        id: animal.id,
        identificacion: animal.identificacion,
        nombre: animal.nombre,
        sexo: animal.sexo,
        raza: animal.raza,
        estado: animal.estado
      },

      total: serviciosResultado.rows.length,

      servicios: serviciosResultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener el historial reproductivo"
    });

  }
};