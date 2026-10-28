import express from "express";

import {
  obtenerFinca,
  actualizarFinca
} from "../controllers/finca.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import {
  permitirRoles
} from "../middleware/roles.middleware.js";

const router = express.Router();

router.get(
  "/",
  verificarToken,
  permitirRoles("administrador"),
  obtenerFinca
);

router.patch(
  "/",
  verificarToken,
  permitirRoles("administrador"),
  actualizarFinca
);

export default router;