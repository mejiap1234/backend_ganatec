import pool from "../config/db.js";

export const registrarParto = async (req, res) => {

  const animalId = Number(req.params.animalId);
  const gestacionId = Number(req.params.gestacionId);

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    fecha_parto,
    tipo_parto,
    complicaciones,
    observacion,
    crias
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


  if (!Number.isInteger(gestacionId) || gestacionId <= 0) {
    return res.status(400).json({
      ok: false,
      message: "ID de gestación inválido"
    });
  }


  if (!fincaId) {
    return res.status(400).json({
      ok: false,
      message: "El usuario no tiene una finca asociada"
    });
  }


  const tipoPartoNormalizado =
    tipo_parto?.trim().toLowerCase() || "normal";


  const tiposPartoPermitidos = [
    "normal",
    "asistido",
    "cesarea",
    "otro"
  ];


  if (!tiposPartoPermitidos.includes(tipoPartoNormalizado)) {
    return res.status(400).json({
      ok: false,
      message: "Tipo de parto inválido"
    });
  }


  // Un parto debe registrar por lo menos una cría.
  if (!Array.isArray(crias) || crias.length === 0) {
    return res.status(400).json({
      ok: false,
      message: "Debes registrar al menos una cría"
    });
  }


  // -----------------------------------------
  // VALIDAR CADA CRÍA
  // -----------------------------------------

  const sexosPermitidos = [
    "macho",
    "hembra",
    "desconocido"
  ];

  const estadosNacimientoPermitidos = [
    "viva",
    "muerta"
  ];


  for (const cria of crias) {

    const sexo =
      cria.sexo?.trim().toLowerCase();


    if (!sexosPermitidos.includes(sexo)) {
      return res.status(400).json({
        ok: false,
        message: "Alguna cría tiene un sexo inválido"
      });
    }


    const estadoNacimiento =
      cria.estado_nacimiento?.trim().toLowerCase() || "viva";


    if (!estadosNacimientoPermitidos.includes(estadoNacimiento)) {
      return res.status(400).json({
        ok: false,
        message: "Alguna cría tiene un estado de nacimiento inválido"
      });
    }


    if (
      cria.peso_nacimiento_kg !== undefined &&
      cria.peso_nacimiento_kg !== null &&
      (
        !Number.isFinite(Number(cria.peso_nacimiento_kg)) ||
        Number(cria.peso_nacimiento_kg) <= 0
      )
    ) {
      return res.status(400).json({
        ok: false,
        message: "El peso de nacimiento debe ser mayor que cero"
      });
    }

  }


  // Usaremos una transacción porque parto, gestación,
  // crías y lactancia deben quedar sincronizados.
  const client = await pool.connect();


  try {

    await client.query("BEGIN");


    // -----------------------------------------
    // VERIFICAR GESTACIÓN
    // -----------------------------------------
    // Comprobamos toda la cadena:
    // finca -> animal -> servicio -> gestación.
    const gestacionResultado = await client.query(
      `
        SELECT
        g.id,
        g.estado,
        g.fecha_inicio_estimada,
        g.fecha_probable_parto,

        -- Padre potencial proveniente del servicio reproductivo
        sr.reproductor_id,
        sr.reproductor_externo,

        a.id AS animal_id,
        a.identificacion,
        a.nombre,
        a.sexo

        FROM gestaciones g

        INNER JOIN servicios_reproductivos sr
          ON g.servicio_reproductivo_id = sr.id

        INNER JOIN animales a
          ON sr.animal_id = a.id

        WHERE g.id = $1
          AND a.id = $2
          AND a.finca_id = $3

        FOR UPDATE
      `,
      [
        gestacionId,
        animalId,
        fincaId
      ]
    );


    if (gestacionResultado.rows.length === 0) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Gestación no encontrada"
      });
    }


    const gestacion =
      gestacionResultado.rows[0];


    if (gestacion.estado !== "activa") {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: "Solo se puede registrar un parto para una gestación activa"
      });
    }


    // -----------------------------------------
    // REGISTRAR EL PARTO
    // -----------------------------------------

    const partoResultado = await client.query(
      `
        INSERT INTO partos
        (
          gestacion_id,
          fecha_parto,
          tipo_parto,
          complicaciones,
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

        RETURNING *
      `,
      [
        gestacionId,
        fecha_parto || null,
        tipoPartoNormalizado,
        complicaciones?.trim() || null,
        observacion?.trim() || null,
        usuarioId
      ]
    );


    const parto =
      partoResultado.rows[0];


    // -----------------------------------------
    // REGISTRAR LAS CRÍAS
    // -----------------------------------------

    const criasRegistradas = [];

// Cada cría nacida viva se convierte
// automáticamente en un animal de la finca.
for (let i = 0; i < crias.length; i++) {

  const cria = crias[i];

  const sexoCria =
    cria.sexo.trim().toLowerCase();

  const estadoNacimiento =
    cria.estado_nacimiento?.trim().toLowerCase() || "viva";


  let animalCria = null;


  // -----------------------------------------
  // SI LA CRÍA NACIÓ VIVA
  // -----------------------------------------
  // La registramos automáticamente también
  // en la tabla animales.
  if (estadoNacimiento === "viva") {

    // Para crear un animal necesitamos conocer
    // si es macho o hembra.
    if (!["macho", "hembra"].includes(sexoCria)) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message: "Una cría viva debe indicar si es macho o hembra"
      });

    }


    // Si el usuario no indicó identificación,
    // Ganatec genera una temporal automáticamente.
    const identificacionCria =
      cria.identificacion_temporal?.trim()
      || `CRIA-P${parto.id}-${i + 1}`;


    const animalCriaResultado = await client.query(
      `
        INSERT INTO animales
        (
          finca_id,
          identificacion,
          nombre,
          sexo,
          fecha_nacimiento,
          raza,
          estado,
          notas,
          creado_por,

          madre_id,
          padre_id,
          padre_externo
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::timestamp::date,
          $6,
          'activo',
          $7,
          $8,

          $9,
          $10,
          $11
        )

        RETURNING
          id,
          finca_id,
          identificacion,
          nombre,
          sexo,
          fecha_nacimiento,
          raza,
          estado,
          madre_id,
          padre_id,
          padre_externo
      `,
      [
        fincaId,

        identificacionCria,

        cria.nombre?.trim() || null,

        sexoCria,

        parto.fecha_parto,

        cria.raza?.trim() || null,

        `Registrado automáticamente desde el parto #${parto.id}`,

        usuarioId,

        // La madre es el animal que tuvo el parto.
        animalId,

        // El padre puede ser un animal de la finca...
        gestacion.reproductor_id || null,

        // ...o un reproductor externo.
        gestacion.reproductor_externo || null
      ]
    );


    animalCria =
      animalCriaResultado.rows[0];

  }


  // -----------------------------------------
  // REGISTRAR EL NACIMIENTO
  // -----------------------------------------
  // Aunque la cría haya nacido muerta, el nacimiento
  // queda guardado como parte del historial del parto.
  const criaResultado = await client.query(
    `
      INSERT INTO crias_parto
      (
        parto_id,
        sexo,
        estado_nacimiento,
        peso_nacimiento_kg,
        identificacion_temporal,
        observacion,
        animal_id
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7
      )

      RETURNING *
    `,
    [
      parto.id,
      sexoCria,
      estadoNacimiento,
      cria.peso_nacimiento_kg || null,

      animalCria?.identificacion
        || cria.identificacion_temporal?.trim()
        || null,

      cria.observacion?.trim() || null,

      // Aquí queda vinculada la cría con su ficha de animal.
      animalCria?.id || null
    ]
  );


  criasRegistradas.push({
    ...criaResultado.rows[0],

    // También devolvemos la ficha del animal creado.
    animal: animalCria
  });

}


    // -----------------------------------------
    // CERRAR LA GESTACIÓN AUTOMÁTICAMENTE
    // -----------------------------------------

    await client.query(
      `
        UPDATE gestaciones

        SET
          estado = 'finalizada',
          fecha_fin = $1::timestamp::date,
          resultado_final = 'parto'

        WHERE id = $2
      `,
      [
        parto.fecha_parto,
        gestacionId
      ]
    );


    // -----------------------------------------
    // CREAR LA NUEVA LACTANCIA
    // -----------------------------------------
    // El parto inicia automáticamente una nueva
    // lactancia para la madre.
    const lactanciaResultado = await client.query(
      `
        INSERT INTO lactancias
        (
          animal_id,
          parto_id,
          fecha_inicio,
          registrado_por
        )

        VALUES (
          $1,
          $2,
          $3::timestamp::date,
          $4
        )

        RETURNING *
      `,
      [
        animalId,
        parto.id,
        parto.fecha_parto,
        usuarioId
      ]
    );


    await client.query("COMMIT");


    res.status(201).json({
      ok: true,
      message: "Parto registrado correctamente",

      animal: {
        id: gestacion.animal_id,
        identificacion: gestacion.identificacion,
        nombre: gestacion.nombre
      },

      parto,

      total_crias: criasRegistradas.length,

      crias: criasRegistradas,

      lactancia: lactanciaResultado.rows[0]
    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message: "La fecha del parto no es válida"
      });
    }


    if (error.code === "23505") {
      return res.status(400).json({
        ok: false,
        message: "Esta gestación ya tiene un parto o el animal ya posee una lactancia activa"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al registrar el parto"
    });


  } finally {

    client.release();

  }

};


export const listarPartos = async (req, res) => {
  try {

    const animalId = Number(req.params.id);
    const fincaId = req.usuario.finca_id;


    // -----------------------------------------
    // VALIDACIONES BÁSICAS
    // -----------------------------------------

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


    // -----------------------------------------
    // VERIFICAR QUE EL ANIMAL PERTENECE
    // A LA FINCA DEL USUARIO
    // -----------------------------------------

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


    if (animal.sexo !== "hembra") {
      return res.status(400).json({
        ok: false,
        message: "Los partos solo pueden consultarse para una hembra"
      });
    }


    // -----------------------------------------
    // CONSULTAR PARTOS
    // -----------------------------------------
    // Obtenemos también las crías asociadas a
    // cada parto y la lactancia que inició.
    const partosResultado = await pool.query(
      `
        SELECT
          p.id,
          p.fecha_parto,
          p.tipo_parto,
          p.complicaciones,
          p.observacion,
          p.fecha_creacion,

          g.id AS gestacion_id,
          g.fecha_inicio_estimada,
          g.fecha_probable_parto,

          u.id AS registrado_por_id,
          u.nombre AS registrado_por_nombre,
          u.apellido AS registrado_por_apellido,

          -- Lactancia que comenzó con este parto
          l.id AS lactancia_id,
          l.fecha_inicio AS lactancia_fecha_inicio,
          l.fecha_fin AS lactancia_fecha_fin,
          l.estado AS lactancia_estado,
          l.motivo_fin AS lactancia_motivo_fin,

          -- Agrupamos todas las crías del parto
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', cp.id,
                  'sexo', cp.sexo,
                  'estado_nacimiento', cp.estado_nacimiento,
                  'peso_nacimiento_kg', cp.peso_nacimiento_kg,
                  'identificacion_temporal', cp.identificacion_temporal,
                  'animal_id', cp.animal_id,
                  'observacion', cp.observacion
                )
                ORDER BY cp.id ASC
              )

              FROM crias_parto cp

              WHERE cp.parto_id = p.id
            ),
            '[]'::jsonb
          ) AS crias

        FROM partos p

        INNER JOIN gestaciones g
          ON p.gestacion_id = g.id

        INNER JOIN servicios_reproductivos sr
          ON g.servicio_reproductivo_id = sr.id

        LEFT JOIN lactancias l
          ON l.parto_id = p.id

        LEFT JOIN usuarios u
          ON p.registrado_por = u.id

        WHERE sr.animal_id = $1

        ORDER BY
          p.fecha_parto DESC,
          p.id DESC
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

      total_partos: partosResultado.rows.length,

      partos: partosResultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener el historial de partos"
    });

  }
};