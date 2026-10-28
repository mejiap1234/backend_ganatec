import { Router } from "express";

import {
  crearAlimento,
  listarAlimentos,
  registrarAlimentacion,
  listarRegistrosAlimentacion,
  vincularAlimentoInventario,
  
} from "../controllers/alimentacion.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import {
  permitirRoles
} from "../middleware/roles.middleware.js";


const router = Router();


// Catálogo de alimentos
router.get(
  "/alimentos",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarAlimentos
);


// Crear alimento
router.post(
  "/alimentos",
  verificarToken,
  permitirRoles("administrador"),
  crearAlimento
);


// Registrar suministro
router.post(
  "/registros",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  registrarAlimentacion
);


// Historial
router.get(
  "/registros",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarRegistrosAlimentacion
);

router.patch(
  "/alimentos/:alimentoId/inventario",
  verificarToken,
  permitirRoles("administrador"),
  vincularAlimentoInventario
);



export default router;