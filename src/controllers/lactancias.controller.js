import pool from "../config/db.js";


export const finalizarLactancia = async (req, res) => {

  const animalId =
    Number(req.params.animalId);

  const lactanciaId =
    Number(req.params.lactanciaId);

  const fincaId =
    req.usuario.finca_id;

  const {
    fecha_fin,
    motivo_fin,
    observacion
  } = req.body;


  // -----------------------------------------
  // VALIDACIONES BÁSICAS
  // -----------------------------------------

  if (!Number.isInteger(animalId) || animalId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de animal inválido"
    });
  }


  if (!Number.isInteger(lactanciaId) || lactanciaId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de lactancia inválido"
    });
  }


  if (!fincaId) {
    return res.status(400).json({
      ok: false,
      message: "El usuario no tiene una finca asociada"
    });
  }


  if (!motivo_fin) {
    return res.status(400).json({
      ok: false,
      message: "El motivo de finalización es obligatorio"
    });
  }


  const motivoNormalizado =
    motivo_fin.trim().toLowerCase();


  const motivosPermitidos = [
    "secado",
    "venta",
    "muerte",
    "otro"
  ];


  if (!motivosPermitidos.includes(motivoNormalizado)) {
    return res.status(400).json({
      ok: false,
      message: "Motivo de finalización inválido"
    });
  }


  try {

    // -----------------------------------------
    // BUSCAR LA LACTANCIA
    // -----------------------------------------
    // Comprobamos que pertenece al animal
    // y que ese animal pertenece a la finca.
    const lactanciaResultado = await pool.query(
      `
        SELECT
          l.id,
          l.fecha_inicio,
          l.fecha_fin,
          l.estado,

          a.id AS animal_id,
          a.identificacion,
          a.nombre

        FROM lactancias l

        INNER JOIN animales a
          ON l.animal_id = a.id

        WHERE l.id = $1
          AND a.id = $2
          AND a.finca_id = $3
      `,
      [
        lactanciaId,
        animalId,
        fincaId
      ]
    );


    if (lactanciaResultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Lactancia no encontrada"
      });
    }


    const lactancia =
      lactanciaResultado.rows[0];


    if (lactancia.estado !== "activa") {
      return res.status(400).json({
        ok: false,
        message: "La lactancia ya se encuentra finalizada"
      });
    }


    // -----------------------------------------
    // VALIDAR FECHA DE FINALIZACIÓN
    // -----------------------------------------

    const fechaFinFinal =
      fecha_fin || new Date().toISOString().slice(0, 10);


    const fechaInicio =
      new Date(lactancia.fecha_inicio);

    const fechaFin =
      new Date(fechaFinFinal);


    if (Number.isNaN(fechaFin.getTime())) {
      return res.status(400).json({
        ok: false,
        message: "La fecha de finalización no es válida"
      });
    }


    if (fechaFin < fechaInicio) {
      return res.status(400).json({
        ok: false,
        message:
          "La fecha de finalización no puede ser anterior al inicio de la lactancia"
      });
    }


    // -----------------------------------------
    // FINALIZAR LA LACTANCIA
    // -----------------------------------------

    const resultado = await pool.query(
      `
        UPDATE lactancias

        SET
          estado = 'finalizada',
          fecha_fin = $1::date,
          motivo_fin = $2,
          observacion = $3

        WHERE id = $4

        RETURNING
          id,
          animal_id,
          parto_id,
          fecha_inicio,
          fecha_fin,
          estado,
          motivo_fin,
          observacion,
          fecha_creacion
      `,
      [
        fechaFinFinal,
        motivoNormalizado,
        observacion?.trim() || null,
        lactanciaId
      ]
    );


    res.status(200).json({
      ok: true,
      message: "Lactancia finalizada correctamente",

      animal: {
        id: lactancia.animal_id,
        identificacion: lactancia.identificacion,
        nombre: lactancia.nombre
      },

      lactancia: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "La fecha de finalización no es válida"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al finalizar la lactancia"
    });

  }

};




/**listar lactancias */

export const listarLactancias = async (req, res) => {

  const animalId = Number(req.params.animalId);
  const fincaId = req.usuario.finca_id;


  if (!Number.isInteger(animalId) || animalId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de animal inválido"
    });
  }


  try {

    // Verificar que el animal pertenece a la finca del usuario.
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
      [animalId, fincaId]
    );


    if (animalResultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Animal no encontrado"
      });
    }


    const animal = animalResultado.rows[0];


    // Consultar todas las lactancias del animal.
    const resultado = await pool.query(
      `
        SELECT
          l.id,
          l.parto_id,
          l.fecha_inicio,
          l.fecha_fin,
          l.estado,
          l.motivo_fin,
          l.observacion,

          COUNT(rl.id)::int AS total_ordenios,

          COALESCE(
            SUM(rl.litros),
            0
          )::numeric(10,2) AS litros_totales,

          COALESCE(
            AVG(rl.litros),
            0
          )::numeric(10,2) AS promedio_por_ordenio,

          COUNT(
            DISTINCT rl.fecha_ordenio::date
          )::int AS dias_con_registro,

          CASE

            WHEN COUNT(
              DISTINCT rl.fecha_ordenio::date
            ) > 0

            THEN (
              SUM(rl.litros)
              /
              COUNT(
                DISTINCT rl.fecha_ordenio::date
              )
            )::numeric(10,2)

            ELSE 0

          END AS promedio_diario,

          (
            COALESCE(
              l.fecha_fin,
              CURRENT_DATE
            )::date
            -
            l.fecha_inicio::date
          ) + 1 AS duracion_dias

        FROM lactancias l

        LEFT JOIN registros_leche rl
          ON rl.lactancia_id = l.id

        WHERE l.animal_id = $1

        GROUP BY
          l.id,
          l.parto_id,
          l.fecha_inicio,
          l.fecha_fin,
          l.estado,
          l.motivo_fin,
          l.observacion

        ORDER BY l.fecha_inicio DESC
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

      total_lactancias: resultado.rows.length,

      lactancias: resultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al consultar el historial de lactancias"
    });

  }

};


/**compararLactancias */

export const compararLactancias = async (req, res) => {

  const animalId = Number(req.params.animalId);
  const fincaId = req.usuario.finca_id;

  if (!Number.isInteger(animalId) || animalId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de animal inválido"
    });
  }

  try {

    // Verificar que el animal pertenece a la finca.
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
      [animalId, fincaId]
    );


    if (animalResultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Animal no encontrado"
      });
    }


    const animal = animalResultado.rows[0];


    // Obtener las dos lactancias más recientes.
    const resultado = await pool.query(
      `
        SELECT
          l.id,
          l.parto_id,
          l.fecha_inicio,
          l.fecha_fin,
          l.estado,
          l.motivo_fin,

          COUNT(rl.id)::int
            AS total_ordenios,

          COALESCE(
            SUM(rl.litros),
            0
          )::numeric(10,2)
            AS litros_totales,

          COUNT(
            DISTINCT rl.fecha_ordenio::date
          )::int
            AS dias_con_registro,

          CASE

            WHEN COUNT(
              DISTINCT rl.fecha_ordenio::date
            ) > 0

            THEN (
              SUM(rl.litros)
              /
              COUNT(
                DISTINCT rl.fecha_ordenio::date
              )
            )::numeric(10,2)

            ELSE 0

          END AS promedio_diario,

          CASE

            WHEN COUNT(rl.id) > 0

            THEN AVG(
              rl.litros
            )::numeric(10,2)

            ELSE 0

          END AS promedio_por_ordenio,

          (
            COALESCE(
              l.fecha_fin,
              CURRENT_DATE
            )::date
            -
            l.fecha_inicio::date
            + 1
          )::int AS duracion_dias

        FROM lactancias l

        LEFT JOIN registros_leche rl
          ON rl.lactancia_id = l.id

        WHERE l.animal_id = $1

        GROUP BY
          l.id,
          l.parto_id,
          l.fecha_inicio,
          l.fecha_fin,
          l.estado,
          l.motivo_fin

        ORDER BY
          l.fecha_inicio DESC

        LIMIT 2
      `,
      [animalId]
    );


    // Si todavía solo existe una lactancia,
    // no hay con qué compararla.
    if (resultado.rows.length < 2) {
      return res.status(200).json({
        ok: true,

        animal,

        comparacion_disponible: false,

        message:
          "El animal todavía no tiene dos lactancias para realizar una comparación",

        lactancia_reciente:
          resultado.rows[0] || null
      });
    }


    const reciente = resultado.rows[0];
    const anterior = resultado.rows[1];


    const promedioReciente =
      Number(reciente.promedio_diario);

    const promedioAnterior =
      Number(anterior.promedio_diario);


    let variacionPorcentual = null;
    let tendencia = "sin_comparacion";


    if (promedioAnterior > 0) {

      variacionPorcentual =
        (
          (
            promedioReciente -
            promedioAnterior
          )
          /
          promedioAnterior
        ) * 100;


      // Margen para no considerar pequeños cambios
      // como una tendencia importante.
      const UMBRAL = 5;


      if (variacionPorcentual > UMBRAL) {

        tendencia = "subiendo";

      } else if (variacionPorcentual < -UMBRAL) {

        tendencia = "bajando";

      } else {

        tendencia = "estable";

      }

    }


    res.status(200).json({

      ok: true,

      animal,

      comparacion_disponible: true,

      lactancia_reciente: reciente,

      lactancia_anterior: anterior,

      comparacion: {

        promedio_diario_reciente:
          promedioReciente,

        promedio_diario_anterior:
          promedioAnterior,

        diferencia_litros_dia:
          Number(
            (
              promedioReciente -
              promedioAnterior
            ).toFixed(2)
          ),

        variacion_porcentual:
          variacionPorcentual !== null
            ? Number(
                variacionPorcentual.toFixed(2)
              )
            : null,

        tendencia
      }

    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message:
        "Error al comparar las lactancias"
    });

  }

};