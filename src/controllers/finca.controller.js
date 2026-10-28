import pool from "../config/db.js";


export const obtenerFinca = async (req, res) => {
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
          nombre,
          fecha_creacion
        FROM fincas
        WHERE id = $1
      `,
      [fincaId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Finca no encontrada"
      });
    }

    res.status(200).json({
      ok: true,
      finca: resultado.rows[0]
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener la finca"
    });

  }
};


export const actualizarFinca = async (req, res) => {
  try {

    const fincaId = req.usuario.finca_id;

    const {
      nombre
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
        message: "El nombre de la finca es obligatorio"
      });
    }


    const nombreLimpio = nombre.trim();


    const resultado = await pool.query(
      `
        UPDATE fincas

        SET nombre = $1

        WHERE id = $2

        RETURNING
          id,
          nombre,
          fecha_creacion
      `,
      [
        nombreLimpio,
        fincaId
      ]
    );


    if (resultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Finca no encontrada"
      });
    }


    res.status(200).json({
      ok: true,
      message: "Finca actualizada correctamente",
      finca: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al actualizar la finca"
    });

  }
};