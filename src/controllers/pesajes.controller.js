import pool from "../config/db.js";


export const registrarPesaje = async (req, res) => {
  try {

    const animalId = Number(req.params.id);

    const fincaId = req.usuario.finca_id;
    const usuarioId = req.usuario.id;

    const {
      peso_kg,
      fecha_pesaje,
      observacion
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


    const pesoNumero = Number(peso_kg);


    if (!Number.isFinite(pesoNumero) || pesoNumero <= 0) {
      return res.status(400).json({
        ok: false,
        message: "El peso debe ser un número mayor que cero"
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


    const observacionLimpia =
      observacion?.trim() || null;


    const resultado = await pool.query(
      `
        INSERT INTO pesajes
        (
          animal_id,
          peso_kg,
          fecha_pesaje,
          observacion,
          registrado_por
        )

        VALUES (
          $1,
          $2,
          COALESCE($3::date, CURRENT_DATE),
          $4,
          $5
        )

        RETURNING
          id,
          animal_id,
          peso_kg,
          fecha_pesaje,
          observacion,
          registrado_por,
          fecha_creacion
      `,
      [
        animalId,
        pesoNumero,
        fecha_pesaje || null,
        observacionLimpia,
        usuarioId
      ]
    );


    res.status(201).json({
      ok: true,
      message: "Pesaje registrado correctamente",

      animal: animalResultado.rows[0],

      pesaje: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "La fecha del pesaje no es válida"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al registrar el pesaje"
    });

  }
};

/**listar pesajes */
export const listarPesajes = async (req, res) => {
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


    const pesajesResultado = await pool.query(
      `
        SELECT
          p.id,
          p.peso_kg,
          p.fecha_pesaje,
          p.observacion,
          p.fecha_creacion,

          u.id AS usuario_id,
          u.nombre AS usuario_nombre,
          u.apellido AS usuario_apellido

        FROM pesajes p

        LEFT JOIN usuarios u
          ON p.registrado_por = u.id

        WHERE p.animal_id = $1

        ORDER BY
          p.fecha_pesaje DESC,
          p.id DESC
      `,
      [animalId]
    );


    const ultimoPeso =
  pesajesResultado.rows.length > 0
    ? pesajesResultado.rows[0]
    : null;


let evolucion = null;


if (pesajesResultado.rows.length >= 2) {

  const pesoActual = pesajesResultado.rows[0];
  const pesoAnterior = pesajesResultado.rows[1];


  const pesoActualNumero =
    Number(pesoActual.peso_kg);

  const pesoAnteriorNumero =
    Number(pesoAnterior.peso_kg);


  const diferenciaPeso =
    pesoActualNumero - pesoAnteriorNumero;


  const fechaActual =
    new Date(pesoActual.fecha_pesaje);

  const fechaAnterior =
    new Date(pesoAnterior.fecha_pesaje);


  const diferenciaMilisegundos =
    fechaActual - fechaAnterior;


  const diasTranscurridos =
    Math.round(
      diferenciaMilisegundos /
      (1000 * 60 * 60 * 24)
    );


  let gananciaDiaria = null;


  if (diasTranscurridos > 0) {

    gananciaDiaria =
      diferenciaPeso / diasTranscurridos;

  }


  evolucion = {

    peso_anterior: pesoAnteriorNumero,

    peso_actual: pesoActualNumero,

    diferencia_kg: Number(
      diferenciaPeso.toFixed(2)
    ),

    dias_transcurridos: diasTranscurridos,

    ganancia_diaria_kg:
      gananciaDiaria !== null
        ? Number(gananciaDiaria.toFixed(3))
        : null

  };

}

  
    res.status(200).json({
      ok: true,

      animal: animalResultado.rows[0],

      total: pesajesResultado.rows.length,

      ultimo_peso: ultimoPeso,

      evolucion,

      pesajes: pesajesResultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener los pesajes"
    });

  }
};