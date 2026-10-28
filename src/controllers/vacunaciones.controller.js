import pool from "../config/db.js";


export const registrarVacunacion = async (req, res) => {
  try {

    const animalId = Number(req.params.id);

    const fincaId = req.usuario.finca_id;
    const usuarioId = req.usuario.id;

    const {
      vacuna,
      fecha_aplicacion,
      proxima_dosis,
      dosis,
      via_administracion,
      lote,
      observacion
    } = req.body;


    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido"
      });
    }


    if (!vacuna || !vacuna.trim()) {
      return res.status(400).json({
        ok: false,
        message: "El nombre de la vacuna es obligatorio"
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


    const resultado = await pool.query(
      `
        INSERT INTO vacunaciones
        (
          animal_id,
          vacuna,
          fecha_aplicacion,
          proxima_dosis,
          dosis,
          via_administracion,
          lote,
          observacion,
          registrado_por
        )

        VALUES (
          $1,
          $2,
          COALESCE($3::date, CURRENT_DATE),
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
          vacuna,
          fecha_aplicacion,
          proxima_dosis,
          dosis,
          via_administracion,
          lote,
          observacion,
          registrado_por,
          fecha_creacion
      `,
      [
        animalId,
        vacuna.trim(),
        fecha_aplicacion || null,
        proxima_dosis || null,
        dosis?.trim() || null,
        via_administracion?.trim() || null,
        lote?.trim() || null,
        observacion?.trim() || null,
        usuarioId
      ]
    );


    res.status(201).json({
      ok: true,
      message: "Vacunación registrada correctamente",

      animal: animalResultado.rows[0],

      vacunacion: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "23514") {
      return res.status(400).json({
        ok: false,
        message: "La próxima dosis no puede ser anterior a la aplicación"
      });
    }


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "Alguna de las fechas no es válida"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al registrar la vacunación"
    });

  }
};


export const listarVacunaciones = async (req, res) => {
  try {

    const animalId = Number(req.params.id);
    const fincaId = req.usuario.finca_id;


    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido"
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


    const resultado = await pool.query(
      `
        SELECT
          v.id,
          v.vacuna,
          v.fecha_aplicacion,
          v.proxima_dosis,
          v.dosis,
          v.via_administracion,
          v.lote,
          v.observacion,
          v.fecha_creacion,

          u.id AS registrado_por_id,
          u.nombre AS registrado_por_nombre,
          u.apellido AS registrado_por_apellido

        FROM vacunaciones v

        LEFT JOIN usuarios u
          ON v.registrado_por = u.id

        WHERE v.animal_id = $1

        ORDER BY
          v.fecha_aplicacion DESC,
          v.id DESC
      `,
      [animalId]
    );


    res.status(200).json({
      ok: true,

      animal: animalResultado.rows[0],

      total: resultado.rows.length,

      vacunaciones: resultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener las vacunaciones"
    });

  }
};