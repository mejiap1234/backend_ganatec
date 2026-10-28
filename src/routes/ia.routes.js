import { Router } from "express";

import {
  contextoAnimalIA,
  contextoFincaIA,
  preguntarIA
} from "../controllers/ia.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import {
  permitirRoles
} from "../middleware/roles.middleware.js";


const router = Router();


// Contexto completo de un animal
router.get(
  "/contexto/animal/:termino",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  contextoAnimalIA
);


// Contexto general de la finca
router.get(
  "/contexto/finca",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  contextoFincaIA
);


router.post(
  "/preguntar",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  preguntarIA
);


export default router;