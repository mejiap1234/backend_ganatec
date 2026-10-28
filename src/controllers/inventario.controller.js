import pool from "../config/db.js";


// ==========================================
// CREAR PRODUCTO DE INVENTARIO
// ==========================================

export const crearProductoInventario = async (req, res) => {

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    nombre,
    categoria,
    unidad,
    stock_minimo,
    descripcion
  } = req.body;


  if (!nombre || !nombre.trim()) {
    return res.status(400).json({
      ok: false,
      message: "El nombre del producto es obligatorio"
    });
  }


  const categoriasPermitidas = [
    "alimento",
    "medicamento",
    "insumo",
    "veterinario",
    "otro"
  ];


  if (!categoriasPermitidas.includes(categoria)) {
    return res.status(400).json({
      ok: false,
      message: "Categoría de inventario inválida"
    });
  }


  const unidadesPermitidas = [
    "kg",
    "g",
    "litro",
    "ml",
    "unidad"
  ];


  if (!unidadesPermitidas.includes(unidad)) {
    return res.status(400).json({
      ok: false,
      message: "Unidad de medida inválida"
    });
  }


  const stockMinimoFinal =
    stock_minimo !== undefined &&
    stock_minimo !== null
      ? Number(stock_minimo)
      : 0;


  if (
    Number.isNaN(stockMinimoFinal) ||
    stockMinimoFinal < 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "El stock mínimo no puede ser negativo"
    });
  }


  try {

    const resultado = await pool.query(
      `
        INSERT INTO productos_inventario (
          finca_id,
          nombre,
          categoria,
          unidad,
          stock_minimo,
          descripcion,
          creado_por
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
        fincaId,
        nombre.trim(),
        categoria,
        unidad,
        stockMinimoFinal,
        descripcion?.trim() || null,
        usuarioId
      ]
    );


    return res.status(201).json({
      ok: true,
      message:
        "Producto de inventario creado correctamente",
      producto: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "Ya existe un producto con ese nombre en la finca"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al crear el producto de inventario"
    });

  }

};

// ==========================================
// LISTAR INVENTARIO
// ==========================================

export const listarInventario = async (req, res) => {

  const fincaId = req.usuario.finca_id;


  try {

    const resultado = await pool.query(
      `
        SELECT
          pi.id,
          pi.nombre,
          pi.categoria,
          pi.unidad,
          pi.stock_minimo,
          pi.descripcion,
          pi.activo,

          COALESCE(
            SUM(
              CASE

                WHEN mi.tipo = 'entrada'
                  THEN mi.cantidad

                WHEN mi.tipo = 'salida'
                  THEN -mi.cantidad

                ELSE 0

              END
            ),
            0
          )::numeric(12,2)
          AS stock_actual

        FROM productos_inventario pi

        LEFT JOIN movimientos_inventario mi
          ON mi.producto_id = pi.id

        WHERE pi.finca_id = $1

        GROUP BY pi.id

        ORDER BY pi.nombre ASC
      `,
      [fincaId]
    );


    const productos = resultado.rows.map(
      producto => {

        const stockActual =
          Number(producto.stock_actual);

        const stockMinimo =
          Number(producto.stock_minimo);


        return {
          ...producto,

          stock_bajo:
            stockActual <= stockMinimo
        };

      }
    );


    return res.status(200).json({
      ok: true,
      total: productos.length,
      productos
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar el inventario"
    });

  }

};


// ==========================================
// REGISTRAR MOVIMIENTO DE INVENTARIO
// ==========================================

export const registrarMovimientoInventario = async (
  req,
  res
) => {

  const productoId =
    Number(req.params.productoId);

  const fincaId =
    req.usuario.finca_id;

  const usuarioId =
    req.usuario.id;

  const {
    tipo,
    cantidad,
    motivo,
    observacion,
    fecha_movimiento
  } = req.body;


  if (
    !Number.isInteger(productoId) ||
    productoId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "ID de producto inválido"
    });
  }


  if (
    !["entrada", "salida"].includes(tipo)
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "El tipo debe ser entrada o salida"
    });
  }


  const cantidadFinal =
    Number(cantidad);


  if (
    Number.isNaN(cantidadFinal) ||
    cantidadFinal <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "La cantidad debe ser mayor que cero"
    });
  }


  const motivosPermitidos = [
    "compra",
    "alimentacion",
    "tratamiento",
    "vacunacion",
    "ajuste",
    "consumo",
    "venta",
    "otro"
  ];


  if (
    !motivosPermitidos.includes(motivo)
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "Motivo de movimiento inválido"
    });
  }


  const client =
    await pool.connect();


  try {

    await client.query("BEGIN");


    // Bloqueamos el producto para evitar
    // salidas simultáneas inconsistentes.
    const productoResultado =
      await client.query(
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

          FOR UPDATE
        `,
        [
          productoId,
          fincaId
        ]
      );


    if (
      productoResultado.rows.length === 0
    ) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message:
          "Producto de inventario no encontrado"
      });

    }


    const producto =
      productoResultado.rows[0];


    if (!producto.activo) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message:
          "El producto se encuentra inactivo"
      });

    }


    // Calcular existencia actual.
    const stockResultado =
      await client.query(
        `
          SELECT
            COALESCE(
              SUM(
                CASE

                  WHEN tipo = 'entrada'
                    THEN cantidad

                  WHEN tipo = 'salida'
                    THEN -cantidad

                  ELSE 0

                END
              ),
              0
            )::numeric(12,2)
            AS stock_actual

          FROM movimientos_inventario

          WHERE producto_id = $1
        `,
        [productoId]
      );


    const stockActual =
      Number(
        stockResultado.rows[0].stock_actual
      );


    // No permitir inventario negativo.
    if (
      tipo === "salida" &&
      cantidadFinal > stockActual
    ) {

      await client.query("ROLLBACK");

      return res.status(409).json({

        ok: false,

        message:
          "No hay existencias suficientes para realizar la salida",

        stock_actual:
          stockActual,

        cantidad_solicitada:
          cantidadFinal,

        unidad:
          producto.unidad

      });

    }


    const resultado =
      await client.query(
        `
          INSERT INTO movimientos_inventario (
            producto_id,
            tipo,
            cantidad,
            motivo,
            observacion,
            fecha_movimiento,
            registrado_por
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            COALESCE(
              $6::timestamp,
              CURRENT_TIMESTAMP
            ),
            $7
          )

          RETURNING *
        `,
        [
          productoId,
          tipo,
          cantidadFinal,
          motivo,
          observacion?.trim() || null,
          fecha_movimiento || null,
          usuarioId
        ]
      );


    const nuevoStock =
      tipo === "entrada"
        ? stockActual + cantidadFinal
        : stockActual - cantidadFinal;


    await client.query("COMMIT");


    return res.status(201).json({

      ok: true,

      message:
        "Movimiento de inventario registrado correctamente",

      producto: {
        id: producto.id,
        nombre: producto.nombre,
        unidad: producto.unidad
      },

      movimiento:
        resultado.rows[0],

      stock_anterior:
        Number(stockActual.toFixed(2)),

      stock_actual:
        Number(nuevoStock.toFixed(2))

    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message:
          "La fecha del movimiento no es válida"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al registrar el movimiento de inventario"
    });


  } finally {

    client.release();

  }

};


// ==========================================
// HISTORIAL DEL PRODUCTO
// ==========================================

export const listarMovimientosInventario = async (
  req,
  res
) => {

  const productoId =
    Number(req.params.productoId);

  const fincaId =
    req.usuario.finca_id;


  if (
    !Number.isInteger(productoId) ||
    productoId <= 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "ID de producto inválido"
    });
  }


  try {

    const productoResultado =
      await pool.query(
        `
          SELECT
            id,
            nombre,
            categoria,
            unidad

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
          "Producto no encontrado"
      });
    }


    const resultado =
      await pool.query(
        `
          SELECT
            mi.id,
            mi.tipo,
            mi.cantidad,
            mi.motivo,
            mi.referencia_tipo,
            mi.referencia_id,
            mi.observacion,
            mi.fecha_movimiento,

            u.id AS registrado_por,
            u.nombre AS registrado_por_nombre

          FROM movimientos_inventario mi

          LEFT JOIN usuarios u
            ON u.id = mi.registrado_por

          WHERE mi.producto_id = $1

          ORDER BY
            mi.fecha_movimiento DESC
        `,
        [productoId]
      );


    return res.status(200).json({

      ok: true,

      producto:
        productoResultado.rows[0],

      total_movimientos:
        resultado.rows.length,

      movimientos:
        resultado.rows

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar los movimientos"
    });

  }

};


// ==========================================
// PRODUCTOS CON STOCK BAJO
// ==========================================

export const listarStockBajo = async (req, res) => {

  const fincaId = req.usuario.finca_id;

  try {

    const resultado = await pool.query(
      `
        SELECT
          pi.id,
          pi.nombre,
          pi.categoria,
          pi.unidad,
          pi.stock_minimo,

          COALESCE(
            SUM(
              CASE

                WHEN mi.tipo = 'entrada'
                  THEN mi.cantidad

                WHEN mi.tipo = 'salida'
                  THEN -mi.cantidad

                ELSE 0

              END
            ),
            0
          )::numeric(12,2)
          AS stock_actual

        FROM productos_inventario pi

        LEFT JOIN movimientos_inventario mi
          ON mi.producto_id = pi.id

        WHERE pi.finca_id = $1
          AND pi.activo = TRUE

        GROUP BY pi.id

        HAVING
          COALESCE(
            SUM(
              CASE
                WHEN mi.tipo = 'entrada'
                  THEN mi.cantidad
                WHEN mi.tipo = 'salida'
                  THEN -mi.cantidad
                ELSE 0
              END
            ),
            0
          ) <= pi.stock_minimo

        ORDER BY stock_actual ASC
      `,
      [fincaId]
    );


    const productos = resultado.rows.map(
      producto => {

        const stockActual =
          Number(producto.stock_actual);

        const stockMinimo =
          Number(producto.stock_minimo);


        let nivel = "bajo";


        if (stockActual <= 0) {
          nivel = "agotado";
        }


        return {
          ...producto,

          nivel,

          cantidad_faltante:
            Number(
              Math.max(
                stockMinimo - stockActual,
                0
              ).toFixed(2)
            )
        };

      }
    );


    return res.status(200).json({

      ok: true,

      total_alertas:
        productos.length,

      productos

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar productos con stock bajo"
    });

  }

};


// ==========================================
// EDITAR PRODUCTO DE INVENTARIO
// ==========================================

export const editarProductoInventario = async (
  req,
  res
) => {

  const productoId =
    Number(req.params.productoId);

  const fincaId =
    req.usuario.finca_id;


  const {
    nombre,
    categoria,
    unidad,
    stock_minimo,
    descripcion
  } = req.body;


  /* =========================================================
     VALIDAR ID
  ========================================================= */

  if (
    !Number.isInteger(productoId)
    ||
    productoId <= 0
  ) {

    return res.status(400).json({
      ok: false,
      message:
        "ID de producto inválido"
    });

  }


  /* =========================================================
     VALIDAR DATOS
  ========================================================= */

  if (
    !nombre
    ||
    !nombre.trim()
  ) {

    return res.status(400).json({
      ok: false,
      message:
        "El nombre del producto es obligatorio"
    });

  }


  const categoriasPermitidas = [
    "alimento",
    "medicamento",
    "insumo",
    "veterinario",
    "otro"
  ];


  if (
    !categoriasPermitidas.includes(
      categoria
    )
  ) {

    return res.status(400).json({
      ok: false,
      message:
        "Categoría de inventario inválida"
    });

  }


  const unidadesPermitidas = [
    "kg",
    "g",
    "litro",
    "ml",
    "unidad"
  ];


  if (
    !unidadesPermitidas.includes(
      unidad
    )
  ) {

    return res.status(400).json({
      ok: false,
      message:
        "Unidad de medida inválida"
    });

  }


  const stockMinimoFinal =
    Number(
      stock_minimo ?? 0
    );


  if (
    Number.isNaN(
      stockMinimoFinal
    )
    ||
    stockMinimoFinal < 0
  ) {

    return res.status(400).json({
      ok: false,
      message:
        "El stock mínimo no puede ser negativo"
    });

  }


  try {

    /* =======================================================
       CONSULTAR PRODUCTO ACTUAL
    ======================================================= */

    const actualResultado =
      await pool.query(
        `
          SELECT
            id,
            nombre,
            unidad

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
      actualResultado.rows.length === 0
    ) {

      return res.status(404).json({
        ok: false,
        message:
          "Producto de inventario no encontrado"
      });

    }


    const productoActual =
      actualResultado.rows[0];


    /* =======================================================
       PROTEGER LA UNIDAD SI YA HAY MOVIMIENTOS

       Ejemplo:
       Si existen movimientos en kg, no debemos convertir
       después el producto a litros porque el historial
       perdería coherencia.
    ======================================================= */

    if (
      productoActual.unidad !== unidad
    ) {

      const movimientosResultado =
        await pool.query(
          `
            SELECT COUNT(*)::int AS total

            FROM movimientos_inventario

            WHERE producto_id = $1
          `,
          [productoId]
        );


      if (
        movimientosResultado
          .rows[0]
          .total > 0
      ) {

        return res.status(409).json({
          ok: false,
          message:
            "No se puede cambiar la unidad porque el producto ya tiene movimientos registrados"
        });

      }

    }


    /* =======================================================
       ACTUALIZAR PRODUCTO
    ======================================================= */

    const resultado =
      await pool.query(
        `
          UPDATE productos_inventario

          SET
            nombre = $1,
            categoria = $2,
            unidad = $3,
            stock_minimo = $4,
            descripcion = $5

          WHERE id = $6
            AND finca_id = $7

          RETURNING *
        `,
        [
          nombre.trim(),
          categoria,
          unidad,
          stockMinimoFinal,
          descripcion?.trim() || null,
          productoId,
          fincaId
        ]
      );


    return res.status(200).json({

      ok: true,

      message:
        "Producto actualizado correctamente",

      producto:
        resultado.rows[0]

    });


  } catch (error) {

    console.error(error);


    if (
      error.code === "23505"
    ) {

      return res.status(409).json({
        ok: false,
        message:
          "Ya existe un producto con ese nombre en la finca"
      });

    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al actualizar el producto"
    });

  }

};



// ==========================================
// ACTIVAR / DESACTIVAR PRODUCTO
// ==========================================

export const cambiarEstadoProductoInventario =
  async (
    req,
    res
  ) => {

    const productoId =
      Number(req.params.productoId);

    const fincaId =
      req.usuario.finca_id;


    const {
      activo
    } = req.body;


    if (
      !Number.isInteger(productoId)
      ||
      productoId <= 0
    ) {

      return res.status(400).json({
        ok: false,
        message:
          "ID de producto inválido"
      });

    }


    if (
      typeof activo !== "boolean"
    ) {

      return res.status(400).json({
        ok: false,
        message:
          "Debes indicar si el producto estará activo o inactivo"
      });

    }


    try {

      const resultado =
        await pool.query(
          `
            UPDATE productos_inventario

            SET activo = $1

            WHERE id = $2
              AND finca_id = $3

            RETURNING *
          `,
          [
            activo,
            productoId,
            fincaId
          ]
        );


      if (
        resultado.rows.length === 0
      ) {

        return res.status(404).json({
          ok: false,
          message:
            "Producto de inventario no encontrado"
        });

      }


      return res.status(200).json({

        ok: true,

        message:
          activo
            ? "Producto reactivado correctamente"
            : "Producto desactivado correctamente",

        producto:
          resultado.rows[0]

      });


    } catch (error) {

      console.error(error);


      return res.status(500).json({
        ok: false,
        message:
          "Error al cambiar el estado del producto"
      });

    }

  };