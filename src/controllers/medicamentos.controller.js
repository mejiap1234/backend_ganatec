import pool from "../config/db.js";


export const agregarMedicamentoTratamiento = async (req, res) => {
  try {

    const animalId = Number(req.params.animalId);
    const eventoId = Number(req.params.eventoId);
    const tratamientoId = Number(req.params.tratamientoId);

    const fincaId = req.usuario.finca_id;
    const usuarioId = req.usuario.id;

    const {
      medicamento,
      dosis,
      frecuencia,
      via_administracion,
      duracion_dias,
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


    if (!medicamento || !medicamento.trim()) {
      return res.status(400).json({
        ok: false,
        message: "El medicamento es obligatorio"
      });
    }


    let duracionDiasNumero = null;

    if (duracion_dias !== undefined && duracion_dias !== null) {

      duracionDiasNumero = Number(duracion_dias);

      if (
        !Number.isInteger(duracionDiasNumero) ||
        duracionDiasNumero <= 0
      ) {
        return res.status(400).json({
          ok: false,
          message: "La duración debe ser un número entero mayor que cero"
        });
      }

    }


    const verificacion = await pool.query(
      `
        SELECT
          t.id AS tratamiento_id,
          t.estado AS tratamiento_estado,

          e.id AS evento_id,

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
      `,
      [
        tratamientoId,
        eventoId,
        animalId,
        fincaId
      ]
    );


    if (verificacion.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Tratamiento no encontrado"
      });
    }


    const tratamiento = verificacion.rows[0];


    if (tratamiento.tratamiento_estado !== "activo") {
      return res.status(400).json({
        ok: false,
        message: "Solo se pueden agregar medicamentos a un tratamiento activo"
      });
    }


    const medicamentoLimpio = medicamento.trim();

    const dosisLimpia =
      dosis?.trim() || null;

    const frecuenciaLimpia =
      frecuencia?.trim() || null;

    const viaLimpia =
      via_administracion?.trim() || null;

    const observacionLimpia =
      observacion?.trim() || null;


    const resultado = await pool.query(
      `
        INSERT INTO medicamentos_tratamiento
        (
          tratamiento_id,
          medicamento,
          dosis,
          frecuencia,
          via_administracion,
          duracion_dias,
          observacion,
          registrado_por
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )

        RETURNING
          id,
          tratamiento_id,
          medicamento,
          dosis,
          frecuencia,
          via_administracion,
          duracion_dias,
          observacion,
          registrado_por,
          fecha_creacion
      `,
      [
        tratamientoId,
        medicamentoLimpio,
        dosisLimpia,
        frecuenciaLimpia,
        viaLimpia,
        duracionDiasNumero,
        observacionLimpia,
        usuarioId
      ]
    );


    res.status(201).json({
      ok: true,
      message: "Medicamento agregado correctamente",

      animal: {
        id: tratamiento.animal_id,
        identificacion: tratamiento.identificacion,
        nombre: tratamiento.nombre
      },

      medicamento: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al agregar el medicamento"
    });

  }
};