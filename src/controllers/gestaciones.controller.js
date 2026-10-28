import pool from "../config/db.js";


export const listarGestaciones = async (req, res) => {
  try {

    const animalId = Number(req.params.id);
    const fincaId = req.usuario.finca_id;


    // ------------------------------------
    // VALIDACIONES BÁSICAS
    // ------------------------------------

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


    // ------------------------------------
    // VERIFICAR ANIMAL
    // ------------------------------------
    // Primero comprobamos que realmente pertenece
    // a la finca del usuario.
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


    // Las gestaciones solo tienen sentido para hembras.
    if (animal.sexo !== "hembra") {
      return res.status(400).json({
        ok: false,
        message: "Las gestaciones solo pueden consultarse para una hembra"
      });
    }


    // ------------------------------------
    // CONSULTAR HISTORIAL DE GESTACIONES
    // ------------------------------------
    const gestacionesResultado = await pool.query(
      `
        SELECT
          g.id,
          g.fecha_inicio_estimada,
          g.fecha_probable_parto,
          g.estado,
          g.fecha_fin,
          g.resultado_final,
          g.observacion,
          g.fecha_creacion,

          -- Días transcurridos desde el inicio estimado
          CASE
            WHEN g.estado = 'activa'
              THEN CURRENT_DATE - g.fecha_inicio_estimada

            ELSE
              COALESCE(g.fecha_fin, CURRENT_DATE)
              - g.fecha_inicio_estimada
          END AS dias_gestacion,

          -- Solo tiene sentido mientras la gestación está activa
          CASE
            WHEN g.estado = 'activa'
              THEN g.fecha_probable_parto - CURRENT_DATE
            ELSE NULL
          END AS dias_para_parto,

          -- Servicio reproductivo que originó la gestación
          sr.id AS servicio_id,
          sr.tipo_servicio,
          sr.fecha_servicio,
          sr.reproductor_id,
          sr.reproductor_externo,
          sr.codigo_semen,

          -- Si el reproductor pertenece a la finca
          r.identificacion AS reproductor_identificacion,
          r.nombre AS reproductor_nombre,
          r.raza AS reproductor_raza,

          -- Diagnóstico que confirmó la preñez
          dg.id AS diagnostico_id,
          dg.fecha_diagnostico,
          dg.resultado AS diagnostico_resultado,
          dg.metodo AS diagnostico_metodo,
          dg.responsable AS diagnostico_responsable,

          -- Usuario que registró la gestación
          u.id AS registrado_por_id,
          u.nombre AS registrado_por_nombre,
          u.apellido AS registrado_por_apellido

        FROM gestaciones g

        INNER JOIN servicios_reproductivos sr
          ON g.servicio_reproductivo_id = sr.id

        INNER JOIN diagnosticos_gestacion dg
          ON g.diagnostico_confirmacion_id = dg.id

        INNER JOIN animales a
          ON sr.animal_id = a.id

        LEFT JOIN animales r
          ON sr.reproductor_id = r.id

        LEFT JOIN usuarios u
          ON g.registrado_por = u.id

        WHERE a.id = $1
          AND a.finca_id = $2

        ORDER BY
          g.fecha_inicio_estimada DESC,
          g.id DESC
      `,
      [
        animalId,
        fincaId
      ]
    );


    // Buscamos si actualmente existe una gestación activa.
    const gestacionActiva =
      gestacionesResultado.rows.find(
        (gestacion) => gestacion.estado === "activa"
      ) || null;


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

      total: gestacionesResultado.rows.length,

      // Esto será muy útil para el frontend y para la IA:
      // no tendrá que recorrer todo el historial para saber
      // si actualmente está gestante.
      gestacion_activa: gestacionActiva,

      gestaciones: gestacionesResultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener las gestaciones"
    });

  }
};