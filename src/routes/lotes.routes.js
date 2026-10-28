import { Router } from "express";

import {
  crearLote,
  listarLotes,
  agregarAnimalLote,
  listarAnimalesLote,
  retirarAnimalLote,
  moverAnimalLote,
  listarAnimalesDisponibles
} from "../controllers/lotes.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import {
  permitirRoles
} from "../middleware/roles.middleware.js";


const router = Router();


// Listar lotes
router.get(
  "/",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarLotes
);

// Animales activos que todavía no tienen lote
router.get(
  "/animales/disponibles",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarAnimalesDisponibles
);


// Crear lote
router.post(
  "/",
  verificarToken,
  permitirRoles("administrador"),
  crearLote
);


// Agregar animal al lote
router.post(
  "/:loteId/animales/:animalId",
  verificarToken,
  permitirRoles("administrador"),
  agregarAnimalLote
);

// Ver animales actuales del lote
router.get(
  "/:loteId/animales",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarAnimalesLote
);


// Retirar animal
router.patch(
  "/:loteId/animales/:animalId/retirar",
  verificarToken,
  permitirRoles("administrador"),
  retirarAnimalLote
);


// Mover animal a otro lote
router.patch(
  "/animales/:animalId/mover",
  verificarToken,
  permitirRoles("administrador"),
  moverAnimalLote
);

export default router;