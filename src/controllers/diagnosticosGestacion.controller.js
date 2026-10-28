import pool from "../config/db.js";

export const registrarDiagnosticoGestacion = async (req, res) => {

  const animalId = Number(req.params.animalId);
  const servicioId = Number(req.params.servicioId);

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    fecha_diagnostico,
    resultado,
    metodo,
    responsable,
    observacion
  } = req.body;


  // -----------------------------
  // VALIDACIONES BÁSICAS
  // -----------------------------

  if (!Number.isInteger(animalId) || animalId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de animal inválido"
    });
  }


  if (!Number.isInteger(servicioId) || servicioId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de servicio reproductivo inválido"
    });
  }


  if (!fincaId) {
    return res.status(400).json({
      ok: false,
      message: "El usuario no tiene una finca asociada"
    });
  }


  if (!resultado) {
    return res.status(400).json({
      ok: false,
      message: "El resultado del diagnóstico es obligatorio"
    });
  }


  const resultadoNormalizado =
    resultado.trim().toLowerCase();


  const resultadosPermitidos = [
    "prenada",
    "vacia",
    "dudosa"
  ];


  if (!resultadosPermitidos.includes(resultadoNormalizado)) {
    return res.status(400).json({
      ok: false,
      message: "Resultado de diagnóstico inválido"
    });
  }


  // El método es opcional, pero si se envía
  // debe pertenecer a nuestra lista permitida.
  let metodoNormalizado = null;


  if (metodo) {

    metodoNormalizado =
      metodo.trim().toLowerCase();


    const metodosPermitidos = [
      "palpacion",
      "ecografia",
      "otro"
    ];


    if (!metodosPermitidos.includes(metodoNormalizado)) {
      return res.status(400).json({
        ok: false,
        message: "Método de diagnóstico inválido"
      });
    }

  }


  // Usamos una conexión individual porque realizaremos
  // varias operaciones dentro de una transacción.
  const client = await pool.connect();


  try {

    await client.query("BEGIN");


    // ------------------------------------------------
    // VERIFICAR SERVICIO + ANIMAL + FINCA
    // ------------------------------------------------
    // No confiamos solamente en los IDs enviados
    // por la URL. Comprobamos toda la relación.
    const servicioResultado = await client.query(
      `
        SELECT
          sr.id,
          sr.fecha_servicio,
          sr.tipo_servicio,

          a.id AS animal_id,
          a.identificacion,
          a.nombre,
          a.sexo,
          a.estado

        FROM servicios_reproductivos sr

        INNER JOIN animales a
          ON sr.animal_id = a.id

        WHERE sr.id = $1
          AND a.id = $2
          AND a.finca_id = $3

        FOR UPDATE
      `,
      [
        servicioId,
        animalId,
        fincaId
      ]
    );


    if (servicioResultado.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Servicio reproductivo no encontrado"
      });
    }


    const servicio =
      servicioResultado.rows[0];


    if (servicio.sexo !== "hembra") {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: "El diagnóstico de gestación solo puede registrarse para una hembra"
      });
    }


    if (servicio.estado !== "activo") {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: "El animal debe estar activo"
      });
    }


    // Evitamos registrar un diagnóstico con una fecha
    // anterior a la inseminación o monta.
    if (fecha_diagnostico) {

      const fechaDiagnostico =
        new Date(fecha_diagnostico);

      const fechaServicio =
        new Date(servicio.fecha_servicio);


      if (fechaDiagnostico < fechaServicio) {

        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          message: "El diagnóstico no puede ser anterior al servicio reproductivo"
        });
      }

    }


    // ------------------------------------------------
    // GUARDAR DIAGNÓSTICO
    // ------------------------------------------------
    const diagnosticoResultado = await client.query(
      `
        INSERT INTO diagnosticos_gestacion
        (
          servicio_reproductivo_id,
          fecha_diagnostico,
          resultado,
          metodo,
          responsable,
          observacion,
          registrado_por
        )

        VALUES (
          $1,
          COALESCE($2::date, CURRENT_DATE),
          $3,
          $4,
          $5,
          $6,
          $7
        )

        RETURNING
          id,
          servicio_reproductivo_id,
          fecha_diagnostico,
          resultado,
          metodo,
          responsable,
          observacion,
          registrado_por,
          fecha_creacion
      `,
      [
        servicioId,
        fecha_diagnostico || null,
        resultadoNormalizado,
        metodoNormalizado,
        responsable?.trim() || null,
        observacion?.trim() || null,
        usuarioId
      ]
    );


    const diagnostico =
      diagnosticoResultado.rows[0];


    let gestacion = null;


    // ------------------------------------------------
    // AUTOMATIZACIÓN DE GANATEC
    // ------------------------------------------------
    // Solo creamos una gestación cuando el diagnóstico
    // confirma que la hembra está preñada.
    if (resultadoNormalizado === "prenada") {


      // Antes comprobamos que este servicio no tenga
      // ya una gestación creada por un diagnóstico anterior.
      const gestacionExistente = await client.query(
        `
          SELECT *
          FROM gestaciones

          WHERE servicio_reproductivo_id = $1
        `,
        [servicioId]
      );


      if (gestacionExistente.rows.length > 0) {

        // Si ya existía, no duplicamos nada.
        gestacion = gestacionExistente.rows[0];

      } else {

        // Usaremos 283 días como fecha aproximada
        // para calcular el parto esperado.
        //
        // No significa que el parto ocurrirá exactamente
        // ese día; es una fecha estimada.
        const nuevaGestacion = await client.query(
          `
            INSERT INTO gestaciones
            (
              servicio_reproductivo_id,
              diagnostico_confirmacion_id,
              fecha_inicio_estimada,
              fecha_probable_parto,
              registrado_por
            )

            VALUES (
              $1,
              $2,

              -- Tomamos como inicio aproximado
              -- la fecha del servicio reproductivo.
              $3::timestamp::date,

              -- PostgreSQL calcula automáticamente
              -- una fecha probable 283 días después.
              ($3::timestamp::date + 283),

              $4
            )

            RETURNING
              id,
              servicio_reproductivo_id,
              diagnostico_confirmacion_id,
              fecha_inicio_estimada,
              fecha_probable_parto,
              estado,
              fecha_fin,
              resultado_final,
              observacion,
              registrado_por,
              fecha_creacion
          `,
          [
            servicioId,
            diagnostico.id,
            servicio.fecha_servicio,
            usuarioId
          ]
        );


        gestacion =
          nuevaGestacion.rows[0];

      }

    }


    // Solo confirmamos los cambios cuando todo
    // el proceso terminó correctamente.
    await client.query("COMMIT");


    res.status(201).json({
      ok: true,

      message:
        resultadoNormalizado === "prenada"
          ? "Diagnóstico registrado y gestación creada correctamente"
          : "Diagnóstico de gestación registrado correctamente",

      animal: {
        id: servicio.animal_id,
        identificacion: servicio.identificacion,
        nombre: servicio.nombre
      },

      servicio_reproductivo: {
        id: servicio.id,
        tipo_servicio: servicio.tipo_servicio,
        fecha_servicio: servicio.fecha_servicio
      },

      diagnostico,

      // Será null cuando el resultado sea vacía o dudosa.
      gestacion
    });


  } catch (error) {

    // Si algo falla después de BEGIN,
    // deshacemos todas las operaciones.
    await client.query("ROLLBACK");

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "Alguna de las fechas no es válida"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al registrar el diagnóstico de gestación"
    });


  } finally {

    // Siempre devolvemos la conexión al Pool.
    client.release();

  }

};