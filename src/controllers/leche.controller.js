import pool from "../config/db.js";

export const registrarOrdenio = async (req, res) => {
  try {
    const animalId = Number(req.params.id);

    const fincaId = req.usuario.finca_id;
    const usuarioId = req.usuario.id;

    const { litros, turno, fecha_ordenio, observacion } = req.body;

    // -----------------------------------------
    // VALIDACIONES BÁSICAS
    // -----------------------------------------

    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido",
      });
    }

    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada",
      });
    }

    // Los litros deben ser un número mayor que cero.
    const litrosNumero = Number(litros);

    if (!Number.isFinite(litrosNumero) || litrosNumero <= 0) {
      return res.status(400).json({
        ok: false,
        message: "La cantidad de litros debe ser mayor que cero",
      });
    }

    if (!turno) {
      return res.status(400).json({
        ok: false,
        message: "El turno de ordeño es obligatorio",
      });
    }

    const turnoNormalizado = turno.trim().toLowerCase();

    const turnosPermitidos = ["manana", "tarde", "noche", "otro"];

    if (!turnosPermitidos.includes(turnoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: "Turno de ordeño inválido",
      });
    }

    // -----------------------------------------
    // BUSCAR LA LACTANCIA ACTIVA
    // -----------------------------------------
    // El frontend NO necesita enviar lactancia_id.
    //
    // Ganatec busca automáticamente cuál es la
    // lactancia activa del animal.
    const lactanciaResultado = await pool.query(
      `
        SELECT
          l.id AS lactancia_id,
          l.fecha_inicio,
          l.estado,

          a.id AS animal_id,
          a.identificacion,
          a.nombre,
          a.sexo,
          a.estado AS animal_estado

        FROM lactancias l

        INNER JOIN animales a
          ON l.animal_id = a.id

        WHERE a.id = $1
          AND a.finca_id = $2
          AND l.estado = 'activa'
      `,
      [animalId, fincaId],
    );

    if (lactanciaResultado.rows.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "El animal no tiene una lactancia activa",
      });
    }

    const lactancia = lactanciaResultado.rows[0];

    // Protección adicional:
    // la producción láctea solo corresponde a hembras.
    if (lactancia.sexo !== "hembra") {
      return res.status(400).json({
        ok: false,
        message: "Solo se puede registrar producción de leche para una hembra",
      });
    }

    // -----------------------------------------
    // VALIDAR FECHA DEL ORDEÑO
    // -----------------------------------------
    // Si se especificó una fecha, no puede ser
    // anterior al inicio de la lactancia.
    if (fecha_ordenio) {
      const fechaOrdenio = new Date(fecha_ordenio);

      const fechaInicio = new Date(lactancia.fecha_inicio);

      if (Number.isNaN(fechaOrdenio.getTime())) {
        return res.status(400).json({
          ok: false,
          message: "La fecha del ordeño no es válida",
        });
      }

      if (fechaOrdenio < fechaInicio) {
        return res.status(400).json({
          ok: false,
          message: "El ordeño no puede ser anterior al inicio de la lactancia",
        });
      }
    }

        // -----------------------------------------
    // EVITAR MEZCLAR MODOS DE REGISTRO
    // -----------------------------------------
    // Si para esta fecha ya se registró
    // una producción total de la finca,
    // no permitimos registrar ordeños
    // individuales para evitar duplicar litros.

    const produccionTotalResultado =
      await pool.query(
        `
          SELECT id

          FROM produccion_leche_diaria

          WHERE finca_id = $1

            AND fecha_produccion =
                COALESCE(
                  $2::timestamp,
                  CURRENT_TIMESTAMP
                )::date

          LIMIT 1
        `,
        [
          fincaId,
          fecha_ordenio || null
        ]
      );


    if (
      produccionTotalResultado.rows.length > 0
    ) {

      return res.status(409).json({
        ok: false,
        message:
          "Ese día ya tiene una producción total registrada. No puedes registrar también ordeños individuales."
      });

    }

    // -----------------------------------------
    // EVITAR ORDEÑOS DUPLICADOS
    // -----------------------------------------
    // Para los turnos normales solo permitimos
    // un registro por fecha y por lactancia.
    if (["manana", "tarde", "noche"].includes(turnoNormalizado)) {
      const duplicadoResultado = await pool.query(
        `
      SELECT id

      FROM registros_leche

      WHERE lactancia_id = $1

        AND fecha_ordenio::date =
            COALESCE(
              $2::timestamp,
              CURRENT_TIMESTAMP
            )::date

        AND turno = $3

      LIMIT 1
    `,
        [lactancia.lactancia_id, fecha_ordenio || null, turnoNormalizado],
      );

      if (duplicadoResultado.rows.length > 0) {
        return res.status(409).json({
          ok: false,
          message:
            "Ya existe un ordeño registrado para este animal, fecha y turno",
        });
      }
    }
    // -----------------------------------------
    // REGISTRAR EL ORDEÑO
    // -----------------------------------------

    const resultado = await pool.query(
      `
        INSERT INTO registros_leche
        (
          lactancia_id,
          fecha_ordenio,
          turno,
          litros,
          observacion,
          registrado_por
        )

        VALUES (
          $1,
          COALESCE($2::timestamp, CURRENT_TIMESTAMP),
          $3,
          $4,
          $5,
          $6
        )

        RETURNING
          id,
          lactancia_id,
          fecha_ordenio,
          turno,
          litros,
          observacion,
          registrado_por,
          fecha_creacion
      `,
      [
        lactancia.lactancia_id,
        fecha_ordenio || null,
        turnoNormalizado,
        litrosNumero,
        observacion?.trim() || null,
        usuarioId,
      ],
    );

    res.status(201).json({
      ok: true,
      message: "Ordeño registrado correctamente",

      animal: {
        id: lactancia.animal_id,
        identificacion: lactancia.identificacion,
        nombre: lactancia.nombre,
      },

      lactancia: {
        id: lactancia.lactancia_id,
        fecha_inicio: lactancia.fecha_inicio,
        estado: lactancia.estado,
      },

      registro_leche: resultado.rows[0],
    });
  } catch (error) {
    console.error(error);

    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "La fecha del ordeño no es válida",
      });
    }

    if (error.code === "23514") {
      return res.status(400).json({
        ok: false,
        message: "Los datos del ordeño no son válidos",
      });
    }

    // La base de datos también protege contra
    // registros duplicados.
    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "Ya existe un ordeño registrado para este animal, fecha y turno",
      });
    }

    res.status(500).json({
      ok: false,
      message: "Error al registrar el ordeño",
    });
  }
};

/* =========================================================
   REGISTRAR PRODUCCIÓN TOTAL DIARIA

   Permite registrar rápidamente la producción
   total de leche de toda la finca sin tener que
   registrar cada vaca individualmente.

   IMPORTANTE:
   No permite usar el modo rápido si ese día
   ya existen ordeños individuales.
========================================================= */

export const registrarProduccionDiaria =
  async (req, res) => {

    const fincaId =
      req.usuario.finca_id;

    const usuarioId =
      req.usuario.id;


    const {
      fecha_produccion,
      vacas_ordenadas,
      litros_totales,
      numero_ordenios,
      observacion
    } = req.body;


    /* =====================================================
       VALIDACIONES GENERALES
    ===================================================== */

    if (!fincaId) {

      return res.status(400).json({

        ok: false,

        message:
          "El usuario no tiene una finca asociada"

      });

    }


    const vacasNumero =
      Number(vacas_ordenadas);


    const litrosNumero =
      Number(litros_totales);


    const ordeniosNumero =
      Number(numero_ordenios);


    /* Vacas ordeñadas */

    if (
      !Number.isInteger(vacasNumero)
      ||
      vacasNumero <= 0
    ) {

      return res.status(400).json({

        ok: false,

        message:
          "La cantidad de vacas ordeñadas debe ser mayor que cero"

      });

    }


    /* Litros producidos */

    if (
      !Number.isFinite(litrosNumero)
      ||
      litrosNumero <= 0
    ) {

      return res.status(400).json({

        ok: false,

        message:
          "Los litros totales deben ser mayores que cero"

      });

    }


    /* Número de ordeños */

    if (
      !Number.isInteger(ordeniosNumero)
      ||
      ordeniosNumero <= 0
    ) {

      return res.status(400).json({

        ok: false,

        message:
          "El número de ordeños debe ser mayor que cero"

      });

    }


    try {

      /* =====================================================
         COMPROBAR SI YA EXISTEN ORDEÑOS DETALLADOS

         Si ya se registró producción vaca por vaca
         para esa fecha, no permitimos guardar un
         total general porque duplicaría los litros.
      ===================================================== */

      const registrosDetallados =
        await pool.query(

          `
            SELECT
              COUNT(*)::int
                AS cantidad

            FROM registros_leche rl

            INNER JOIN lactancias l
              ON l.id = rl.lactancia_id

            INNER JOIN animales a
              ON a.id = l.animal_id

            WHERE a.finca_id = $1

              AND rl.fecha_ordenio::date =
                  COALESCE(
                    $2::date,
                    CURRENT_DATE
                  )
          `,

          [
            fincaId,
            fecha_produccion || null
          ]

        );


      const cantidadDetallados =
        Number(
          registrosDetallados
            .rows[0]
            .cantidad
          ||
          0
        );


      if (cantidadDetallados > 0) {

        return res.status(409).json({

          ok: false,

          message:
            "Ese día ya tiene ordeños individuales registrados. No puedes registrar también una producción total diaria."

        });

      }


      /* =====================================================
         19.2.3 COMPROBAR SI YA EXISTE UN TOTAL DEL DÍA
      ===================================================== */

      const existente =
        await pool.query(

          `
            SELECT
              id

            FROM produccion_leche_diaria

            WHERE finca_id = $1

              AND fecha_produccion =
                  COALESCE(
                    $2::date,
                    CURRENT_DATE
                  )

            LIMIT 1
          `,

          [
            fincaId,
            fecha_produccion || null
          ]

        );


      if (
        existente.rows.length > 0
      ) {

        return res.status(409).json({

          ok: false,

          message:
            "Ya existe un registro de producción total para esa fecha"

        });

      }


      /* =====================================================
         REGISTRAR PRODUCCIÓN TOTAL
      ===================================================== */

      const resultado =
        await pool.query(

          `
            INSERT INTO produccion_leche_diaria
            (
              finca_id,
              fecha_produccion,
              vacas_ordenadas,
              litros_totales,
              numero_ordenios,
              observacion,
              registrado_por
            )

            VALUES
            (
              $1,

              COALESCE(
                $2::date,
                CURRENT_DATE
              ),

              $3,
              $4,
              $5,
              $6,
              $7
            )

            RETURNING
              id,
              finca_id,
              fecha_produccion,
              vacas_ordenadas,
              litros_totales::float8
                AS litros_totales,
              numero_ordenios,
              observacion,
              registrado_por,
              fecha_creacion,
              fecha_actualizacion
          `,

          [
            fincaId,

            fecha_produccion || null,

            vacasNumero,

            litrosNumero,

            ordeniosNumero,

            observacion?.trim()
            ||
            null,

            usuarioId
          ]

        );


      /* =====================================================
         RESPUESTA
      ===================================================== */

      return res.status(201).json({

        ok: true,

        message:
          "Producción total diaria registrada correctamente",

        produccion:
          resultado.rows[0]

      });


    } catch (error) {

      console.error(
        "ERROR PRODUCCIÓN DIARIA:",
        error
      );


      /* Fecha inválida */

      if (
        error.code === "22007"
      ) {

        return res.status(400).json({

          ok: false,

          message:
            "La fecha de producción no es válida"

        });

      }


      /* Registro duplicado protegido también
         directamente desde PostgreSQL */

      if (
        error.code === "23505"
      ) {

        return res.status(409).json({

          ok: false,

          message:
            "Ya existe producción total registrada para esa fecha"

        });

      }


      return res.status(500).json({

        ok: false,

        message:
          "Error al registrar la producción total diaria"

      });

    }

  };

/**listarProduccionLeche */

export const listarProduccionLeche = async (req, res) => {
  try {
    const animalId = Number(req.params.id);
    const fincaId = req.usuario.finca_id;

    // La fecha es opcional.
    // Sirve como referencia para calcular día, semana,
    // mes y año. Si no viene, usamos la fecha actual.
    const fechaReferencia = req.query.fecha || null;

    // -----------------------------------------
    // VALIDACIONES BÁSICAS
    // -----------------------------------------

    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido",
      });
    }

    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El usuario no tiene una finca asociada",
      });
    }

    // -----------------------------------------
    // BUSCAR ANIMAL + LACTANCIA ACTIVA
    // -----------------------------------------

    const lactanciaResultado = await pool.query(
      `
        SELECT
          l.id AS lactancia_id,
          l.fecha_inicio,
          l.fecha_fin,
          l.estado,

          a.id AS animal_id,
          a.identificacion,
          a.nombre,
          a.sexo,
          a.raza

        FROM lactancias l

        INNER JOIN animales a
          ON l.animal_id = a.id

        WHERE a.id = $1
          AND a.finca_id = $2
          AND l.estado = 'activa'
      `,
      [animalId, fincaId],
    );

    if (lactanciaResultado.rows.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "El animal no tiene una lactancia activa",
      });
    }

    const lactancia = lactanciaResultado.rows[0];

    // -----------------------------------------
    // RESUMEN DE PRODUCCIÓN
    // -----------------------------------------
    // Calculamos todos los totales desde los
    // registros reales de ordeño.
    const resumenResultado = await pool.query(
      `
        WITH referencia AS (
          SELECT COALESCE(
            $2::date,
            CURRENT_DATE
          ) AS fecha
        )

        SELECT

          -- Producción exactamente en el día consultado
          COALESCE(
            SUM(rl.litros)
            FILTER (
              WHERE rl.fecha_ordenio::date =
                    referencia.fecha
            ),
            0
          )::float8 AS total_dia,


          -- Semana de lunes a domingo
          COALESCE(
            SUM(rl.litros)
            FILTER (
              WHERE rl.fecha_ordenio::date >=
                    date_trunc(
                      'week',
                      referencia.fecha
                    )::date

                AND rl.fecha_ordenio::date <
                    (
                      date_trunc(
                        'week',
                        referencia.fecha
                      ) + INTERVAL '7 days'
                    )::date
            ),
            0
          )::float8 AS total_semana,


          -- Producción del mes de referencia
          COALESCE(
            SUM(rl.litros)
            FILTER (
              WHERE date_trunc(
                      'month',
                      rl.fecha_ordenio
                    ) =
                    date_trunc(
                      'month',
                      referencia.fecha
                    )
            ),
            0
          )::float8 AS total_mes,


          -- Producción del año de referencia
          COALESCE(
            SUM(rl.litros)
            FILTER (
              WHERE EXTRACT(
                      YEAR FROM rl.fecha_ordenio
                    ) =
                    EXTRACT(
                      YEAR FROM referencia.fecha
                    )
            ),
            0
          )::float8 AS total_anio,


          -- Toda la producción de la lactancia actual
          COALESCE(
            SUM(rl.litros),
            0
          )::float8 AS total_lactancia,


          -- Cantidad de días diferentes con producción
          COUNT(
            DISTINCT rl.fecha_ordenio::date
          )::int AS dias_con_registro,


          -- Promedio diario real.
          --  Solo cuenta días que tienen registros.
          COALESCE(
            (
              SUM(rl.litros)
              /
              NULLIF(
                COUNT(
                  DISTINCT rl.fecha_ordenio::date
                ),
                0
              )
            ),
            0
          )::float8 AS promedio_diario

        FROM registros_leche rl

        CROSS JOIN referencia

        WHERE rl.lactancia_id = $1
      `,
      [lactancia.lactancia_id, fechaReferencia],
    );

    // -----------------------------------------
    // PRODUCCIÓN AGRUPADA POR DÍA
    // -----------------------------------------
    // Esto nos permitirá construir gráficos
    // y detectar tendencias posteriormente.
    const produccionDiariaResultado = await pool.query(
      `
        SELECT
          fecha_ordenio::date AS fecha,

          SUM(litros)::float8 AS total_litros,

          COUNT(*)::int AS cantidad_ordenios

        FROM registros_leche

        WHERE lactancia_id = $1

        GROUP BY fecha_ordenio::date

        ORDER BY fecha DESC
      `,
      [lactancia.lactancia_id],
    );

    // -----------------------------------------
    // REGISTROS INDIVIDUALES DE ORDEÑO
    // -----------------------------------------

    const registrosResultado = await pool.query(
      `
        SELECT
          rl.id,
          rl.fecha_ordenio,
          rl.turno,
          rl.litros::float8 AS litros,
          rl.observacion,
          rl.fecha_creacion,

          u.id AS registrado_por_id,
          u.nombre AS registrado_por_nombre,
          u.apellido AS registrado_por_apellido

        FROM registros_leche rl

        LEFT JOIN usuarios u
          ON rl.registrado_por = u.id

        WHERE rl.lactancia_id = $1

        ORDER BY
          rl.fecha_ordenio DESC,
          rl.id DESC
      `,
      [lactancia.lactancia_id],
    );

    const resumen = resumenResultado.rows[0];

    // -----------------------------------------
    // COMPARAR LOS ÚLTIMOS 7 DÍAS
    // -----------------------------------------
    // Comparamos dos periodos del mismo tamaño:
    //
    // Periodo actual:
    // fecha de referencia y los 6 días anteriores.
    //
    // Periodo anterior:
    // los 7 días inmediatamente anteriores.
    //
    // Esto permite detectar si la producción
    // está aumentando o disminuyendo.
    const comparacionResultado = await pool.query(
      `
    WITH referencia AS (
      SELECT COALESCE(
        $2::date,
        CURRENT_DATE
      ) AS fecha
    ),

    periodos AS (
      SELECT

        -- Últimos 7 días
        fecha - INTERVAL '6 days'
          AS inicio_actual,

        fecha + INTERVAL '1 day'
          AS fin_actual,

        -- 7 días anteriores
        fecha - INTERVAL '13 days'
          AS inicio_anterior,

        fecha - INTERVAL '6 days'
          AS fin_anterior

      FROM referencia
    )

    SELECT

      -- Producción de los últimos 7 días
      COALESCE(
        SUM(rl.litros)
        FILTER (
          WHERE rl.fecha_ordenio::date >=
                periodos.inicio_actual::date

            AND rl.fecha_ordenio::date <
                periodos.fin_actual::date
        ),
        0
      )::float8 AS periodo_actual,


      -- Producción de los 7 días anteriores
      COALESCE(
        SUM(rl.litros)
        FILTER (
          WHERE rl.fecha_ordenio::date >=
                periodos.inicio_anterior::date

            AND rl.fecha_ordenio::date <
                periodos.fin_anterior::date
        ),
        0
      )::float8 AS periodo_anterior,


      -- También contamos cuántos días tienen
      -- información para saber si la comparación
      -- tiene suficientes registros.
      COUNT(
        DISTINCT rl.fecha_ordenio::date
      )
      FILTER (
        WHERE rl.fecha_ordenio::date >=
              periodos.inicio_actual::date

          AND rl.fecha_ordenio::date <
              periodos.fin_actual::date
      )::int AS dias_registrados_actual,


      COUNT(
        DISTINCT rl.fecha_ordenio::date
      )
      FILTER (
        WHERE rl.fecha_ordenio::date >=
              periodos.inicio_anterior::date

          AND rl.fecha_ordenio::date <
              periodos.fin_anterior::date
      )::int AS dias_registrados_anterior


    FROM registros_leche rl

    CROSS JOIN periodos

    WHERE rl.lactancia_id = $1
  `,
      [lactancia.lactancia_id, fechaReferencia],
    );

    const comparacion = comparacionResultado.rows[0];

    const produccionActual = Number(comparacion.periodo_actual);

    const produccionAnterior = Number(comparacion.periodo_anterior);

    // -----------------------------------------
    // CALCULAR VARIACIÓN PORCENTUAL
    // -----------------------------------------

    let variacionPorcentaje = null;

    // Solo podemos calcular porcentaje si
    // el periodo anterior tuvo producción.
    if (produccionAnterior > 0) {
      variacionPorcentaje =
        ((produccionActual - produccionAnterior) / produccionAnterior) * 100;

      variacionPorcentaje = Number(variacionPorcentaje.toFixed(2));
    }

    // -----------------------------------------
    // CLASIFICAR LA TENDENCIA DE PRODUCCIÓN
    // -----------------------------------------
    // Usamos un margen inicial del 5 %.
    //
    // Si cambia menos de 5 %, consideramos
    // que la producción está relativamente estable.
    const UMBRAL_TENDENCIA = 5;

    let tendencia = "sin_datos";

    if (produccionActual === 0 && produccionAnterior === 0) {
      tendencia = "sin_datos";
    } else if (produccionAnterior === 0) {
      // Hay producción actual, pero todavía no existe
      // un periodo anterior útil para comparar.
      tendencia = "sin_comparacion";
    } else if (variacionPorcentaje >= UMBRAL_TENDENCIA) {
      tendencia = "subiendo";
    } else if (variacionPorcentaje <= -UMBRAL_TENDENCIA) {
      tendencia = "bajando";
    } else {
      tendencia = "estable";
    }
    res.status(200).json({
      ok: true,

      animal: {
        id: lactancia.animal_id,
        identificacion: lactancia.identificacion,
        nombre: lactancia.nombre,
        sexo: lactancia.sexo,
        raza: lactancia.raza,
      },

      lactancia: {
        id: lactancia.lactancia_id,
        fecha_inicio: lactancia.fecha_inicio,
        fecha_fin: lactancia.fecha_fin,
        estado: lactancia.estado,
      },

      // Fecha sobre la cual se calcularon
      // día, semana, mes y año.
      fecha_referencia: fechaReferencia || "hoy",

      resumen: {
        total_dia: resumen.total_dia,
        total_semana: resumen.total_semana,
        total_mes: resumen.total_mes,
        total_anio: resumen.total_anio,
        total_lactancia: resumen.total_lactancia,
        dias_con_registro: resumen.dias_con_registro,
        promedio_diario: Number(resumen.promedio_diario.toFixed(2)),
      },

      // Comparación de los últimos 7 días
      // frente a los 7 días anteriores.
      comparacion_7_dias: {
        periodo_actual: produccionActual,

        periodo_anterior: produccionAnterior,

        variacion_porcentaje: variacionPorcentaje,

        tendencia,

        dias_registrados_actual: comparacion.dias_registrados_actual,

        dias_registrados_anterior: comparacion.dias_registrados_anterior,
      },

      produccion_diaria: produccionDiariaResultado.rows,

      registros: registrosResultado.rows,
    });
  } catch (error) {
    console.error(error);

    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "La fecha de consulta no es válida",
      });
    }

    res.status(500).json({
      ok: false,
      message: "Error al obtener la producción de leche",
    });
  }
};

/* =========================================================
   CONSULTAR ORDEÑOS DE UNA LACTANCIA ESPECÍFICA
========================================================= */

export const listarProduccionLechePorLactancia =
  async (req, res) => {

    const animalId =
      Number(req.params.animalId);

    const lactanciaId =
      Number(req.params.lactanciaId);

    const fincaId =
      req.usuario.finca_id;


    /* -----------------------------------------------------
       VALIDACIONES
    ----------------------------------------------------- */

    if (
      !Number.isInteger(animalId) ||
      animalId <= 0
    ) {

      return res.status(400).json({
        ok: false,
        message: "ID de animal inválido"
      });

    }


    if (
      !Number.isInteger(lactanciaId) ||
      lactanciaId <= 0
    ) {

      return res.status(400).json({
        ok: false,
        message: "ID de lactancia inválido"
      });

    }


    if (!fincaId) {

      return res.status(400).json({
        ok: false,
        message:
          "El usuario no tiene una finca asociada"
      });

    }


    try {

      /* -----------------------------------------------------
         VERIFICAR LACTANCIA + ANIMAL + FINCA

         Importante:
         aquí NO filtramos por estado='activa'.

         Así podremos consultar tanto lactancias
         activas como lactancias finalizadas.
      ----------------------------------------------------- */

      const lactanciaResultado =
        await pool.query(
          `
            SELECT
              l.id,
              l.animal_id,
              l.parto_id,
              l.fecha_inicio,
              l.fecha_fin,
              l.estado,
              l.motivo_fin,
              l.observacion,

              a.identificacion,
              a.nombre,
              a.sexo,
              a.raza

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


      if (
        lactanciaResultado.rows.length === 0
      ) {

        return res.status(404).json({
          ok: false,
          message: "Lactancia no encontrada"
        });

      }


      const lactancia =
        lactanciaResultado.rows[0];


      /* -----------------------------------------------------
         RESUMEN DE ESA LACTANCIA
      ----------------------------------------------------- */

      const resumenResultado =
        await pool.query(
          `
            SELECT

              COUNT(*)::int
                AS total_ordenios,

              COALESCE(
                SUM(litros),
                0
              )::float8
                AS litros_totales,

              COALESCE(
                AVG(litros),
                0
              )::float8
                AS promedio_por_ordenio,

              COUNT(
                DISTINCT fecha_ordenio::date
              )::int
                AS dias_con_registro,

              COALESCE(
                SUM(litros)
                /
                NULLIF(
                  COUNT(
                    DISTINCT fecha_ordenio::date
                  ),
                  0
                ),
                0
              )::float8
                AS promedio_diario

            FROM registros_leche

            WHERE lactancia_id = $1
          `,
          [
            lactanciaId
          ]
        );


      /* -----------------------------------------------------
         REGISTROS INDIVIDUALES
      ----------------------------------------------------- */

      const registrosResultado =
        await pool.query(
          `
            SELECT
              rl.id,
              rl.fecha_ordenio,
              rl.turno,
              rl.litros::float8
                AS litros,
              rl.observacion,
              rl.fecha_creacion,

              u.id
                AS registrado_por_id,

              u.nombre
                AS registrado_por_nombre,

              u.apellido
                AS registrado_por_apellido

            FROM registros_leche rl

            LEFT JOIN usuarios u
              ON rl.registrado_por = u.id

            WHERE rl.lactancia_id = $1

            ORDER BY
              rl.fecha_ordenio DESC,
              rl.id DESC
          `,
          [
            lactanciaId
          ]
        );


      const resumen =
        resumenResultado.rows[0];


      res.status(200).json({

        ok: true,

        animal: {
          id: lactancia.animal_id,
          identificacion:
            lactancia.identificacion,
          nombre:
            lactancia.nombre,
          sexo:
            lactancia.sexo,
          raza:
            lactancia.raza
        },

        lactancia: {
          id:
            lactancia.id,

          parto_id:
            lactancia.parto_id,

          fecha_inicio:
            lactancia.fecha_inicio,

          fecha_fin:
            lactancia.fecha_fin,

          estado:
            lactancia.estado,

          motivo_fin:
            lactancia.motivo_fin,

          observacion:
            lactancia.observacion
        },

        resumen: {
          total_ordenios:
            resumen.total_ordenios,

          litros_totales:
            resumen.litros_totales,

          promedio_por_ordenio:
            Number(
              resumen.promedio_por_ordenio || 0
            ),

          dias_con_registro:
            resumen.dias_con_registro,

          promedio_diario:
            Number(
              resumen.promedio_diario || 0
            )
        },

        registros:
          registrosResultado.rows

      });


    } catch (error) {

      console.error(error);


      res.status(500).json({
        ok: false,
        message:
          "Error al consultar los ordeños de la lactancia"
      });

    }

  };

/**corregir registro de leche
 */

export const corregirRegistroLeche = async (req, res) => {
  const animalId = Number(req.params.animalId);

  const registroId = Number(req.params.registroId);

  const fincaId = req.usuario.finca_id;

  const usuarioId = req.usuario.id;

  const { litros, turno, fecha_ordenio, observacion, motivo_correccion } =
    req.body;

  // -----------------------------------------
  // VALIDACIONES BÁSICAS
  // -----------------------------------------

  if (!Number.isInteger(animalId) || animalId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de animal inválido",
    });
  }

  if (!Number.isInteger(registroId) || registroId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de registro inválido",
    });
  }

  if (!fincaId) {
    return res.status(400).json({
      ok: false,
      message: "El usuario no tiene una finca asociada",
    });
  }

  // Toda modificación debe tener una explicación.
  if (!motivo_correccion || !motivo_correccion.trim()) {
    return res.status(400).json({
      ok: false,
      message: "El motivo de la corrección es obligatorio",
    });
  }

  // Debe enviarse por lo menos un campo
  // que realmente queramos modificar.
  const hayCambios =
    litros !== undefined ||
    turno !== undefined ||
    fecha_ordenio !== undefined ||
    observacion !== undefined;

  if (!hayCambios) {
    return res.status(400).json({
      ok: false,
      message: "Debes indicar al menos un dato para corregir",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // -----------------------------------------
    // BUSCAR EL REGISTRO ORIGINAL
    // -----------------------------------------
    // Verificamos además que realmente pertenezca
    // al animal y a la finca del usuario.
    const registroResultado = await client.query(
      `
        SELECT
          rl.id,
          rl.lactancia_id,
          rl.fecha_ordenio,
          rl.turno,
          rl.litros,
          rl.observacion,

          l.fecha_inicio AS lactancia_fecha_inicio,
          l.fecha_fin AS lactancia_fecha_fin,

          a.id AS animal_id,
          a.identificacion,
          a.nombre

        FROM registros_leche rl

        INNER JOIN lactancias l
          ON rl.lactancia_id = l.id

        INNER JOIN animales a
          ON l.animal_id = a.id

        WHERE rl.id = $1
          AND a.id = $2
          AND a.finca_id = $3

        FOR UPDATE
      `,
      [registroId, animalId, fincaId],
    );

    if (registroResultado.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Registro de ordeño no encontrado",
      });
    }

    const registroOriginal = registroResultado.rows[0];

    // -----------------------------------------
    // PREPARAR LOS NUEVOS VALORES
    // -----------------------------------------

    let nuevosLitros = Number(registroOriginal.litros);

    if (litros !== undefined) {
      nuevosLitros = Number(litros);

      if (!Number.isFinite(nuevosLitros) || nuevosLitros <= 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          message: "La cantidad de litros debe ser mayor que cero",
        });
      }
    }

    let nuevoTurno = registroOriginal.turno;

    if (turno !== undefined) {
      nuevoTurno = turno.trim().toLowerCase();

      const turnosPermitidos = ["manana", "tarde", "noche", "otro"];

      if (!turnosPermitidos.includes(nuevoTurno)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          message: "Turno de ordeño inválido",
        });
      }
    }

    const nuevaFecha =
      fecha_ordenio !== undefined
        ? fecha_ordenio
        : registroOriginal.fecha_ordenio;

    const fechaNuevaObjeto = new Date(nuevaFecha);

    if (Number.isNaN(fechaNuevaObjeto.getTime())) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: "La fecha del ordeño no es válida",
      });
    }

    const inicioLactancia = new Date(registroOriginal.lactancia_fecha_inicio);

    // No permitimos mover un ordeño antes
    // del inicio de la lactancia.
    if (fechaNuevaObjeto < inicioLactancia) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: "El ordeño no puede ser anterior al inicio de la lactancia",
      });
    }

    // Si la lactancia ya terminó, tampoco
    // permitimos mover el ordeño después de su fin.
    if (registroOriginal.lactancia_fecha_fin) {
      const finLactancia = new Date(registroOriginal.lactancia_fecha_fin);

      if (fechaNuevaObjeto > finLactancia) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          message: "El ordeño no puede ser posterior al final de la lactancia",
        });
      }
    }

    const nuevaObservacion =
      observacion !== undefined
        ? observacion === null
          ? null
          : observacion.trim() || null
        : registroOriginal.observacion;

    // -----------------------------------------
    // EVITAR DUPLICADO AL CORREGIR
    // -----------------------------------------
    // Por ejemplo, no dejamos mover un ordeño
    // de la tarde hacia una mañana que ya existe.
    if (["manana", "tarde", "noche"].includes(nuevoTurno)) {
      const duplicadoResultado = await client.query(
        `
            SELECT id

            FROM registros_leche

            WHERE lactancia_id = $1
              AND id <> $2

              AND fecha_ordenio::date =
                  $3::timestamp::date

              AND turno = $4

            LIMIT 1
          `,
        [registroOriginal.lactancia_id, registroId, nuevaFecha, nuevoTurno],
      );

      if (duplicadoResultado.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          ok: false,
          message: "Ya existe otro ordeño para esa fecha y turno",
        });
      }
    }

    // -----------------------------------------
    // ACTUALIZAR EL REGISTRO
    // -----------------------------------------

    const actualizadoResultado = await client.query(
      `
          UPDATE registros_leche

          SET
            litros = $1,
            turno = $2,
            fecha_ordenio = $3::timestamp,
            observacion = $4

          WHERE id = $5

          RETURNING
            id,
            lactancia_id,
            fecha_ordenio,
            turno,
            litros,
            observacion,
            registrado_por,
            fecha_creacion
        `,
      [nuevosLitros, nuevoTurno, nuevaFecha, nuevaObservacion, registroId],
    );

    const registroActualizado = actualizadoResultado.rows[0];

    // -----------------------------------------
    // GUARDAR LA AUDITORÍA
    // -----------------------------------------
    // Conservamos tanto los datos anteriores
    // como los nuevos.
    const historialResultado = await client.query(
      `
          INSERT INTO historial_correcciones_leche
          (
            registro_leche_id,

            litros_anterior,
            litros_nuevo,

            turno_anterior,
            turno_nuevo,

            fecha_ordenio_anterior,
            fecha_ordenio_nueva,

            observacion_anterior,
            observacion_nueva,

            motivo_correccion,

            corregido_por
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11
          )

          RETURNING *
        `,
      [
        registroId,

        registroOriginal.litros,
        registroActualizado.litros,

        registroOriginal.turno,
        registroActualizado.turno,

        registroOriginal.fecha_ordenio,
        registroActualizado.fecha_ordenio,

        registroOriginal.observacion,
        registroActualizado.observacion,

        motivo_correccion.trim(),

        usuarioId,
      ],
    );

    // Solo confirmamos cuando actualización
    // e historial quedaron guardados.
    await client.query("COMMIT");

    res.status(200).json({
      ok: true,

      message: "Registro de ordeño corregido correctamente",

      animal: {
        id: registroOriginal.animal_id,
        identificacion: registroOriginal.identificacion,
        nombre: registroOriginal.nombre,
      },

      registro: registroActualizado,

      correccion: historialResultado.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "Ya existe un ordeño para esa fecha y turno",
      });
    }

    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "La fecha del ordeño no es válida",
      });
    }

    res.status(500).json({
      ok: false,
      message: "Error al corregir el registro de ordeño",
    });
  } finally {
    client.release();
  }
};


/* =========================================================
   RESUMEN GENERAL DE PRODUCCIÓN DE LA FINCA
========================================================= */

export const obtenerResumenProduccionFinca =
  async (req, res) => {

    const fincaId =
      req.usuario.finca_id;


    if (!fincaId) {

      return res.status(400).json({
        ok: false,
        message:
          "El usuario no tiene una finca asociada"
      });

    }


    try {

      const resultado =
        await pool.query(
          `
            WITH fecha_actual AS (

              SELECT
                (
                  CURRENT_TIMESTAMP
                  AT TIME ZONE 'America/Bogota'
                )::date AS hoy

            ),


            produccion_detallada AS (

              SELECT

                rl.fecha_ordenio::date
                  AS fecha,

                COALESCE(
                  SUM(rl.litros),
                  0
                )::numeric(12,2)
                  AS litros,

                COUNT(
                  DISTINCT a.id
                )::int
                  AS vacas_ordenadas,

                COUNT(
                  DISTINCT rl.turno
                )::int
                  AS numero_ordenios

              FROM registros_leche rl

              INNER JOIN lactancias l
                ON l.id = rl.lactancia_id

              INNER JOIN animales a
                ON a.id = l.animal_id

              WHERE a.finca_id = $1

              GROUP BY
                rl.fecha_ordenio::date

            ),


            produccion_rapida AS (

              SELECT

                fecha_produccion
                  AS fecha,

                litros_totales
                  AS litros,

                vacas_ordenadas,

                numero_ordenios

              FROM produccion_leche_diaria

              WHERE finca_id = $1

            ),


            produccion_unificada AS (

              SELECT *
              FROM produccion_detallada

              UNION ALL

              SELECT *
              FROM produccion_rapida

            )


            SELECT

              COALESCE(
                SUM(p.litros)
                FILTER (
                  WHERE
                    p.fecha = f.hoy
                ),
                0
              )::numeric(12,2)
                AS total_dia,


              COALESCE(
                SUM(p.litros)
                FILTER (
                  WHERE
                    p.fecha >=
                      DATE_TRUNC(
                        'week',
                        f.hoy
                      )::date

                    AND

                    p.fecha <
                      (
                        DATE_TRUNC(
                          'week',
                          f.hoy
                        )::date
                        + 7
                      )
                ),
                0
              )::numeric(12,2)
                AS total_semana,


              COALESCE(
                SUM(p.litros)
                FILTER (
                  WHERE
                    DATE_TRUNC(
                      'month',
                      p.fecha
                    )
                    =
                    DATE_TRUNC(
                      'month',
                      f.hoy
                    )
                ),
                0
              )::numeric(12,2)
                AS total_mes,


              COALESCE(
                MAX(p.vacas_ordenadas)
                FILTER (
                  WHERE
                    p.fecha = f.hoy
                ),
                0
              )::int
                AS vacas_ordenadas_hoy,


              COALESCE(
                MAX(p.numero_ordenios)
                FILTER (
                  WHERE
                    p.fecha = f.hoy
                ),
                0
              )::int
                AS numero_ordenios_hoy


            FROM produccion_unificada p

            CROSS JOIN fecha_actual f

            GROUP BY
              f.hoy
          `,
          [
            fincaId
          ]
        );


      const resumen =
        resultado.rows[0]
        || {
          total_dia: 0,
          total_semana: 0,
          total_mes: 0,
          vacas_ordenadas_hoy: 0,
          numero_ordenios_hoy: 0
        };


      return res.status(200).json({

        ok: true,

        resumen

      });


    } catch (error) {

      console.error(
        "Error consultando resumen general de leche:",
        error
      );


      return res.status(500).json({
        ok: false,
        message:
          "Error al consultar el resumen general de producción de leche"
      });

    }

  };


  /* =========================================================
   LISTAR PRODUCCIONES TOTALES DIARIAS
========================================================= */

export const listarProduccionesDiarias =
  async (req, res) => {

    const fincaId =
      req.usuario.finca_id;


    if (!fincaId) {

      return res.status(400).json({
        ok: false,
        message:
          "El usuario no tiene una finca asociada"
      });

    }


    try {

      const resultado =
        await pool.query(
          `
            SELECT
              id,
              fecha_produccion,
              vacas_ordenadas,
              litros_totales,
              numero_ordenios,
              observacion,
              fecha_creacion

            FROM produccion_leche_diaria

            WHERE finca_id = $1

            ORDER BY
              fecha_produccion DESC,
              id DESC

            LIMIT 100
          `,
          [
            fincaId
          ]
        );


      return res.status(200).json({

        ok: true,

        total:
          resultado.rows.length,

        producciones:
          resultado.rows

      });


    } catch (error) {

      console.error(
        "Error consultando producciones diarias:",
        error
      );


      return res.status(500).json({
        ok: false,
        message:
          "Error al consultar el historial de producción diaria"
      });

    }

  };

  /* =========================================================
   EDITAR PRODUCCIÓN TOTAL DIARIA
========================================================= */

export const editarProduccionDiaria =
  async (req, res) => {

    const produccionId =
      Number(req.params.id);

    const fincaId =
      req.usuario.finca_id;

    const {
      fecha_produccion,
      vacas_ordenadas,
      litros_totales,
      numero_ordenios,
      observacion
    } = req.body;


    if (
      !Number.isInteger(produccionId)
      ||
      produccionId <= 0
    ) {

      return res.status(400).json({
        ok: false,
        message:
          "ID de producción inválido"
      });

    }


    const vacasNumero =
      Number(vacas_ordenadas);

    const litrosNumero =
      Number(litros_totales);

    const ordeniosNumero =
      Number(numero_ordenios);


    if (
      !Number.isInteger(vacasNumero)
      ||
      vacasNumero <= 0
    ) {

      return res.status(400).json({
        ok: false,
        message:
          "La cantidad de vacas ordeñadas debe ser mayor que cero"
      });

    }


    if (
      !Number.isFinite(litrosNumero)
      ||
      litrosNumero <= 0
    ) {

      return res.status(400).json({
        ok: false,
        message:
          "Los litros totales deben ser mayores que cero"
      });

    }


    if (
      !Number.isInteger(ordeniosNumero)
      ||
      ordeniosNumero <= 0
    ) {

      return res.status(400).json({
        ok: false,
        message:
          "El número de ordeños debe ser mayor que cero"
      });

    }


    try {

      const produccionResultado =
        await pool.query(
          `
            SELECT
              id,
              fecha_produccion

            FROM produccion_leche_diaria

            WHERE id = $1
              AND finca_id = $2
          `,
          [
            produccionId,
            fincaId
          ]
        );


      if (
        produccionResultado.rows.length === 0
      ) {

        return res.status(404).json({
          ok: false,
          message:
            "Registro de producción no encontrado"
        });

      }


      const fechaFinal =
        fecha_produccion
        ||
        produccionResultado
          .rows[0]
          .fecha_produccion;


      const ordeñosDetalladosResultado =
        await pool.query(
          `
            SELECT
              COUNT(*)::int
                AS cantidad

            FROM registros_leche rl

            INNER JOIN lactancias l
              ON l.id = rl.lactancia_id

            INNER JOIN animales a
              ON a.id = l.animal_id

            WHERE a.finca_id = $1

              AND rl.fecha_ordenio::date =
                  $2::date
          `,
          [
            fincaId,
            fechaFinal
          ]
        );


      if (
        Number(
          ordeñosDetalladosResultado
            .rows[0]
            .cantidad
        ) > 0
      ) {

        return res.status(409).json({
          ok: false,
          message:
            "Esa fecha ya tiene ordeños individuales registrados"
        });

      }


      const duplicadoResultado =
        await pool.query(
          `
            SELECT id

            FROM produccion_leche_diaria

            WHERE finca_id = $1

              AND fecha_produccion =
                  $2::date

              AND id <> $3

            LIMIT 1
          `,
          [
            fincaId,
            fechaFinal,
            produccionId
          ]
        );


      if (
        duplicadoResultado.rows.length > 0
      ) {

        return res.status(409).json({
          ok: false,
          message:
            "Ya existe una producción total registrada para esa fecha"
        });

      }


      const resultado =
        await pool.query(
          `
            UPDATE produccion_leche_diaria

            SET
              fecha_produccion = $1::date,
              vacas_ordenadas = $2,
              litros_totales = $3,
              numero_ordenios = $4,
              observacion = $5,
              fecha_actualizacion =
                CURRENT_TIMESTAMP

            WHERE id = $6
              AND finca_id = $7

            RETURNING *
          `,
          [
            fechaFinal,
            vacasNumero,
            litrosNumero,
            ordeniosNumero,
            observacion?.trim()
              || null,
            produccionId,
            fincaId
          ]
        );


      return res.status(200).json({

        ok: true,

        message:
          "Producción total actualizada correctamente",

        produccion:
          resultado.rows[0]

      });


    } catch (error) {

      console.error(
        "Error editando producción total:",
        error
      );


      if (
        error.code === "22007"
      ) {

        return res.status(400).json({
          ok: false,
          message:
            "La fecha de producción no es válida"
        });

      }


      return res.status(500).json({
        ok: false,
        message:
          "Error al actualizar la producción total"
      });

    }

  };
