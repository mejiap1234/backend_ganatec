import pool from "../config/db.js";


// ==========================================
// CREAR ALIMENTO / SUPLEMENTO
// ==========================================

export const crearAlimento = async (req, res) => {

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    nombre,
    tipo,
    unidad_base,
    descripcion
  } = req.body;


  if (!nombre || !nombre.trim()) {
    return res.status(400).json({
      ok: false,
      message: "El nombre del alimento es obligatorio"
    });
  }


  const tiposPermitidos = [
    "forraje",
    "concentrado",
    "suplemento",
    "sal_mineral",
    "otro"
  ];


  if (!tiposPermitidos.includes(tipo)) {
    return res.status(400).json({
      ok: false,
      message: "Tipo de alimento inválido"
    });
  }


  const unidadesPermitidas = [
    "kg",
    "g",
    "litro",
    "ml",
    "unidad"
  ];


  if (!unidadesPermitidas.includes(unidad_base)) {
    return res.status(400).json({
      ok: false,
      message: "Unidad de medida inválida"
    });
  }


  try {

    const resultado = await pool.query(
      `
        INSERT INTO alimentos (
          finca_id,
          nombre,
          tipo,
          unidad_base,
          descripcion,
          creado_por
        )

        VALUES ($1, $2, $3, $4, $5, $6)

        RETURNING *
      `,
      [
        fincaId,
        nombre.trim(),
        tipo,
        unidad_base,
        descripcion?.trim() || null,
        usuarioId
      ]
    );


    return res.status(201).json({
      ok: true,
      message: "Alimento registrado correctamente",
      alimento: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "Ya existe un alimento con ese nombre"
      });
    }


    return res.status(500).json({
      ok: false,
      message: "Error al registrar el alimento"
    });

  }

};



// ==========================================
// LISTAR ALIMENTOS
// ==========================================

export const listarAlimentos = async (req, res) => {

  const fincaId = req.usuario.finca_id;


  try {

    const resultado = await pool.query(
      `
        SELECT
          id,
          nombre,
          tipo,
          unidad_base,
          descripcion,
          activo,
          fecha_creacion

        FROM alimentos

        WHERE finca_id = $1
          AND activo = TRUE

        ORDER BY nombre ASC
      `,
      [fincaId]
    );


    return res.status(200).json({
      ok: true,
      total: resultado.rows.length,
      alimentos: resultado.rows
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message: "Error al consultar los alimentos"
    });

  }

};



// ==========================================
// REGISTRAR ALIMENTACIÓN
// ==========================================

export const registrarAlimentacion = async (
  req,
  res
) => {

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    alimento_id,
    animal_id,
    lote_id,
    cantidad,
    fecha_suministro,
    observacion
  } = req.body;


  const alimentoId = Number(alimento_id);

  const animalId =
    animal_id !== undefined &&
    animal_id !== null
      ? Number(animal_id)
      : null;

  const loteId =
    lote_id !== undefined &&
    lote_id !== null
      ? Number(lote_id)
      : null;


  if (
    !Number.isInteger(alimentoId) ||
    alimentoId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "Alimento inválido"
    });
  }


  if (
    !cantidad ||
    Number(cantidad) <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "La cantidad debe ser mayor que cero"
    });
  }


  // Debe escogerse exactamente un destino.
  if (
    (animalId && loteId) ||
    (!animalId && !loteId)
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "Debe indicar un animal o un lote, pero no ambos"
    });
  }


  try {

    // ---------------------------------------
    // VALIDAR ALIMENTO
    // ---------------------------------------

    const alimentoResultado =
      await pool.query(
        `
          SELECT
            id,
            nombre,
            tipo,
            unidad_base,
            activo

          FROM alimentos

          WHERE id = $1
            AND finca_id = $2
        `,
        [
          alimentoId,
          fincaId
        ]
      );


    if (
      alimentoResultado.rows.length === 0
    ) {
      return res.status(404).json({
        ok: false,
        message:
          "Alimento no encontrado"
      });
    }


    const alimento =
      alimentoResultado.rows[0];


    if (!alimento.activo) {
      return res.status(400).json({
        ok: false,
        message:
          "El alimento se encuentra inactivo"
      });
    }


    // ---------------------------------------
    // VALIDAR ANIMAL
    // ---------------------------------------

    let destino = null;


    if (animalId) {

      const animalResultado =
        await pool.query(
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


      if (
        animalResultado.rows.length === 0
      ) {
        return res.status(404).json({
          ok: false,
          message:
            "Animal no encontrado"
        });
      }


      const animal =
        animalResultado.rows[0];


      if (animal.estado !== "activo") {
        return res.status(400).json({
          ok: false,
          message:
            "No se puede registrar alimentación para un animal inactivo"
        });
      }


      destino = {
        tipo: "animal",
        ...animal
      };

    }


    // ---------------------------------------
    // VALIDAR LOTE
    // ---------------------------------------

    if (loteId) {

      const loteResultado =
        await pool.query(
          `
            SELECT
              id,
              nombre,
              estado

            FROM lotes

            WHERE id = $1
              AND finca_id = $2
          `,
          [
            loteId,
            fincaId
          ]
        );


      if (
        loteResultado.rows.length === 0
      ) {
        return res.status(404).json({
          ok: false,
          message:
            "Lote no encontrado"
        });
      }


      const lote =
        loteResultado.rows[0];


      if (lote.estado !== "activo") {
        return res.status(400).json({
          ok: false,
          message:
            "No se puede registrar alimentación para un lote inactivo"
        });
      }


      destino = {
        tipo: "lote",
        ...lote
      };

    }


    // ---------------------------------------
    // GUARDAR REGISTRO
    // ---------------------------------------

    const resultado =
      await pool.query(
        `
          INSERT INTO registros_alimentacion (
            alimento_id,
            animal_id,
            lote_id,
            cantidad,
            fecha_suministro,
            observacion,
            registrado_por
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            COALESCE($5::timestamp, CURRENT_TIMESTAMP),
            $6,
            $7
          )

          RETURNING *
        `,
        [
          alimentoId,
          animalId,
          loteId,
          cantidad,
          fecha_suministro || null,
          observacion?.trim() || null,
          usuarioId
        ]
      );


    return res.status(201).json({

      ok: true,

      message:
        "Alimentación registrada correctamente",

      alimento: {
        id: alimento.id,
        nombre: alimento.nombre,
        tipo: alimento.tipo,
        unidad:
          alimento.unidad_base
      },

      destino,

      registro:
        resultado.rows[0]

    });


  } catch (error) {

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message:
          "La fecha de suministro no es válida"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al registrar la alimentación"
    });

  }

};



// ==========================================
// HISTORIAL DE ALIMENTACIÓN
// ==========================================

export const listarRegistrosAlimentacion = async (
  req,
  res
) => {

  const fincaId = req.usuario.finca_id;


  try {

    const resultado = await pool.query(
      `
        SELECT
          ra.id,
          ra.fecha_suministro,
          ra.cantidad,
          ra.observacion,

          al.id AS alimento_id,
          al.nombre AS alimento,
          al.tipo AS tipo_alimento,
          al.unidad_base,

          a.id AS animal_id,
          a.identificacion AS animal_identificacion,
          a.nombre AS animal_nombre,

          l.id AS lote_id,
          l.nombre AS lote_nombre,

          u.id AS registrado_por,
          u.nombre AS registrado_por_nombre

        FROM registros_alimentacion ra

        INNER JOIN alimentos al
          ON al.id = ra.alimento_id

        LEFT JOIN animales a
          ON a.id = ra.animal_id

        LEFT JOIN lotes l
          ON l.id = ra.lote_id

        LEFT JOIN usuarios u
          ON u.id = ra.registrado_por

        WHERE al.finca_id = $1

        ORDER BY
          ra.fecha_suministro DESC
      `,
      [fincaId]
    );


    return res.status(200).json({
      ok: true,
      total: resultado.rows.length,
      registros: resultado.rows
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar el historial de alimentación"
    });

  }

};


// ==========================================
// VINCULAR ALIMENTO CON INVENTARIO
// ==========================================

export const vincularAlimentoInventario = async (
  req,
  res
) => {

  const alimentoId =
    Number(req.params.alimentoId);

  const productoId =
    Number(req.body.producto_inventario_id);

  const fincaId =
    req.usuario.finca_id;


  if (
    !Number.isInteger(alimentoId) ||
    alimentoId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message: "ID de alimento inválido"
    });
  }


  if (
    !Number.isInteger(productoId) ||
    productoId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "Producto de inventario inválido"
    });
  }


  try {

    // Buscar alimento.
    const alimentoResultado =
      await pool.query(
        `
          SELECT
            id,
            nombre,
            unidad_base,
            activo

          FROM alimentos

          WHERE id = $1
            AND finca_id = $2
        `,
        [
          alimentoId,
          fincaId
        ]
      );


    if (
      alimentoResultado.rows.length === 0
    ) {
      return res.status(404).json({
        ok: false,
        message:
          "Alimento no encontrado"
      });
    }


    const alimento =
      alimentoResultado.rows[0];


    // Buscar producto de inventario.
    const productoResultado =
      await pool.query(
        `
          SELECT
            id,
            nombre,
            categoria,
            unidad,
            activo

          FROM productos_inventario

          WHERE id = $1
            AND finca_id = $2
        `,
        [
          productoId,
          fincaId
        ]
      );


    if (
      productoResultado.rows.length === 0
    ) {
      return res.status(404).json({
        ok: false,
        message:
          "Producto de inventario no encontrado"
      });
    }


    const producto =
      productoResultado.rows[0];


    if (!producto.activo) {
      return res.status(400).json({
        ok: false,
        message:
          "El producto de inventario está inactivo"
      });
    }


    if (producto.categoria !== "alimento") {
      return res.status(400).json({
        ok: false,
        message:
          "Solo puede vincularse un producto de categoría alimento"
      });
    }


    // Deben utilizar la misma unidad.
    if (
      alimento.unidad_base !== producto.unidad
    ) {
      return res.status(409).json({

        ok: false,

        message:
          "La unidad del alimento no coincide con la unidad del inventario",

        unidad_alimento:
          alimento.unidad_base,

        unidad_inventario:
          producto.unidad

      });
    }


    const resultado =
      await pool.query(
        `
          UPDATE alimentos

          SET producto_inventario_id = $1

          WHERE id = $2
            AND finca_id = $3

          RETURNING *
        `,
        [
          productoId,
          alimentoId,
          fincaId
        ]
      );


    return res.status(200).json({

      ok: true,

      message:
        "Alimento vinculado al inventario correctamente",

      alimento:
        resultado.rows[0],

      producto_inventario: {
        id: producto.id,
        nombre: producto.nombre,
        unidad: producto.unidad
      }

    });


  } catch (error) {

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "Este producto de inventario ya está vinculado a otro alimento"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al vincular alimento con inventario"
    });

  }

};