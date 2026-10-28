import { Router } from "express";

import {
  obtenerDashboard
} from "../controllers/dashboard.controller.js";

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
  obtenerDashboard
);


export default router;