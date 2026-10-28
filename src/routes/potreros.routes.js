import { Router } from "express";

import {
  crearPotrero,
  listarPotreros,
  moverLotePotrero,
  historialPotrerosLote,
  listarDescansosPotrero,
  finalizarDescansoPotrero,
  listarLotesPotrero
} from "../controllers/potreros.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import {
  permitirRoles
} from "../middleware/roles.middleware.js";


const router = Router();


// Consultar potreros
router.get(
  "/",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarPotreros
);


// Crear potrero
router.post(
  "/",
  verificarToken,
  permitirRoles("administrador"),
  crearPotrero
);


// Mover un lote a un potrero
router.patch(
  "/lotes/:loteId/mover",
  verificarToken,
  permitirRoles("administrador"),
  moverLotePotrero
);


// Historial de potreros de un lote
router.get(
  "/lotes/:loteId/historial",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  historialPotrerosLote
);

// Lotes actualmente ubicados en un potrero
router.get(
  "/:potreroId/lotes",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarLotesPotrero
);

// Historial de descansos
router.get(
  "/:potreroId/descansos",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarDescansosPotrero
);


// Finalizar descanso
router.patch(
  "/:potreroId/descansos/finalizar",
  verificarToken,
  permitirRoles("administrador"),
  finalizarDescansoPotrero
);




export default router;