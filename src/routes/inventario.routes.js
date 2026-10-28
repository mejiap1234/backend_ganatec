import { Router } from "express";

import {
  crearProductoInventario,
  listarInventario,
  registrarMovimientoInventario,
  listarMovimientosInventario,
  listarStockBajo,
  editarProductoInventario,
  cambiarEstadoProductoInventario
} from "../controllers/inventario.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import {
  permitirRoles
} from "../middleware/roles.middleware.js";


const router = Router();


router.get(
  "/",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarInventario
);


router.post(
  "/",
  verificarToken,
  permitirRoles("administrador"),
  crearProductoInventario
);

// Editar producto
router.patch(
  "/:productoId",
  verificarToken,
  permitirRoles("administrador"),
  editarProductoInventario
);


// Activar / desactivar producto
router.patch(
  "/:productoId/estado",
  verificarToken,
  permitirRoles("administrador"),
  cambiarEstadoProductoInventario
);


router.post(
  "/:productoId/movimientos",
  verificarToken,
  permitirRoles("administrador"),
  registrarMovimientoInventario
);


router.get(
  "/:productoId/movimientos",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarMovimientosInventario
);

router.get(
  "/alertas/stock-bajo",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarStockBajo
);

export default router;