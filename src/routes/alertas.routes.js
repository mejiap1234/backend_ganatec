import { Router } from "express";

import {
  listarAlertas
} from "../controllers/alertas.controller.js";

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
  listarAlertas
);


export default router;