import pool from "../config/db.js";


// ==========================================
// REGISTRAR COMPRA
// ==========================================

export const registrarCompra = async (req, res) => {

  const fincaId = req.usuario.finca_id;
  const usuarioId = req.usuario.id;

  const {
    proveedor,
    numero_documento,
    fecha_compra,
    observacion,
    productos
  } = req.body;


  // La compra debe contener productos.
  if (
    !Array.isArray(productos) ||
    productos.length === 0
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "La compra debe contener al menos un producto"
    });
  }


  // -----------------------------------------
  // VALIDAR DETALLES
  // -----------------------------------------

  const productosNormalizados = [];


  for (const item of productos) {

    const productoId =
      Number(item.producto_id);

    const cantidad =
      Number(item.cantidad);

    const precioUnitario =
      Number(item.precio_unitario);


    if (
      !Number.isInteger(productoId) ||
      productoId <= 0
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "Uno de los productos tiene un ID inválido"
      });
    }


    if (
      Number.isNaN(cantidad) ||
      cantidad <= 0
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "Las cantidades deben ser mayores que cero"
      });
    }


    if (
      Number.isNaN(precioUnitario) ||
      precioUnitario < 0
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "El precio unitario no es válido"
      });
    }


    productosNormalizados.push({
      productoId,
      cantidad,
      precioUnitario
    });

  }


  // Evitar el mismo producto dos veces
  // dentro de una sola compra.
  const idsProductos =
    productosNormalizados.map(
      item => item.productoId
    );


  if (
    new Set(idsProductos).size !==
    idsProductos.length
  ) {
    return res.status(400).json({
      ok: false,
      message:
        "Un producto no puede aparecer dos veces en la misma compra"
    });
  }


  const client =
    await pool.connect();


  try {

    await client.query("BEGIN");


    // ======================================
    // VERIFICAR PRODUCTOS
    // ======================================

    const productosResultado =
      await client.query(
        `
          SELECT
            id,
            nombre,
            categoria,
            unidad,
            activo

          FROM productos_inventario

          WHERE id = ANY($1::int[])
            AND finca_id = $2

          FOR UPDATE
        `,
        [
          idsProductos,
          fincaId
        ]
      );


    if (
      productosResultado.rows.length !==
      idsProductos.length
    ) {

      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message:
          "Uno o más productos no existen o no pertenecen a la finca"
      });

    }


    const productoInactivo =
      productosResultado.rows.find(
        producto => !producto.activo
      );


    if (productoInactivo) {

      await client.query("ROLLBACK");

      return res.status(400).json({
        ok: false,
        message:
          `El producto "${productoInactivo.nombre}" está inactivo`
      });

    }


    // ======================================
    // CREAR COMPRA
    // ======================================

    const compraResultado =
      await client.query(
        `
          INSERT INTO compras (
            finca_id,
            proveedor,
            numero_documento,
            fecha_compra,
            observacion,
            registrado_por
          )

          VALUES (
            $1,
            $2,
            $3,
            COALESCE(
              $4::timestamp,
              CURRENT_TIMESTAMP
            ),
            $5,
            $6
          )

          RETURNING *
        `,
        [
          fincaId,
          proveedor?.trim() || null,
          numero_documento?.trim() || null,
          fecha_compra || null,
          observacion?.trim() || null,
          usuarioId
        ]
      );


    const compra =
      compraResultado.rows[0];


    const detalles = [];

    let totalCompra = 0;


    // ======================================
    // DETALLES + INVENTARIO
    // ======================================

    for (
      const item of productosNormalizados
    ) {

      const producto =
        productosResultado.rows.find(
          p =>
            Number(p.id) ===
            item.productoId
        );


      const detalleResultado =
        await client.query(
          `
            INSERT INTO detalles_compra (
              compra_id,
              producto_id,
              cantidad,
              precio_unitario
            )

            VALUES (
              $1,
              $2,
              $3,
              $4
            )

            RETURNING *
          `,
          [
            compra.id,
            item.productoId,
            item.cantidad,
            item.precioUnitario
          ]
        );


      const detalle =
        detalleResultado.rows[0];


      const subtotal =
        Number(detalle.subtotal);


      totalCompra += subtotal;


      // Entrada automática al inventario.
      await client.query(
        `
          INSERT INTO movimientos_inventario (
            producto_id,
            tipo,
            cantidad,
            motivo,
            referencia_tipo,
            referencia_id,
            observacion,
            fecha_movimiento,
            registrado_por
          )

          VALUES (
            $1,
            'entrada',
            $2,
            'compra',
            'detalle_compra',
            $3,
            $4,
            $5,
            $6
          )
        `,
        [
          item.productoId,
          item.cantidad,
          detalle.id,

          `Entrada automática por compra #${compra.id}`,

          compra.fecha_compra,
          usuarioId
        ]
      );


      detalles.push({
        ...detalle,

        producto: {
          id: producto.id,
          nombre: producto.nombre,
          unidad: producto.unidad
        }
      });

    }


    // ======================================
    // REGISTRAR GASTO FINANCIERO
    // ======================================

    const financieroResultado =
      await client.query(
        `
          INSERT INTO movimientos_financieros (
            finca_id,
            tipo,
            categoria,
            monto,
            descripcion,
            referencia_tipo,
            referencia_id,
            fecha_movimiento,
            registrado_por
          )

          VALUES (
            $1,
            'gasto',
            'compra_inventario',
            $2,
            $3,
            'compra',
            $4,
            $5,
            $6
          )

          RETURNING *
        `,
        [
          fincaId,
          totalCompra,

          proveedor
            ? `Compra realizada a ${proveedor}`
            : `Compra de inventario #${compra.id}`,

          compra.id,
          compra.fecha_compra,
          usuarioId
        ]
      );


    await client.query("COMMIT");


    return res.status(201).json({

      ok: true,

      message:
        "Compra registrada correctamente",

      compra,

      productos:
        detalles,

      total:
        Number(
          totalCompra.toFixed(2)
        ),

      movimiento_financiero:
        financieroResultado.rows[0]

    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);


    if (error.code === "22007") {
      return res.status(400).json({
        ok: false,
        message:
          "La fecha de compra no es válida"
      });
    }


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message:
          "La compra contiene información duplicada"
      });
    }


    return res.status(500).json({
      ok: false,
      message:
        "Error al registrar la compra"
    });


  } finally {

    client.release();

  }

};

// ==========================================
// LISTAR COMPRAS
// ==========================================

export const listarCompras = async (req, res) => {

  const fincaId = req.usuario.finca_id;


  try {

    const resultado = await pool.query(
      `
        SELECT
          c.id,
          c.proveedor,
          c.numero_documento,
          c.fecha_compra,
          c.estado,
          c.observacion,

          COUNT(dc.id)::int
            AS total_productos,

          COALESCE(
            SUM(dc.subtotal),
            0
          )::numeric(14,2)
            AS total_compra,

          u.nombre
            AS registrado_por_nombre

        FROM compras c

        LEFT JOIN detalles_compra dc
          ON dc.compra_id = c.id

        LEFT JOIN usuarios u
          ON u.id = c.registrado_por

        WHERE c.finca_id = $1

        GROUP BY
          c.id,
          u.nombre

        ORDER BY
          c.fecha_compra DESC
      `,
      [fincaId]
    );


    return res.status(200).json({
      ok: true,
      total: resultado.rows.length,
      compras: resultado.rows
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar las compras"
    });

  }

};