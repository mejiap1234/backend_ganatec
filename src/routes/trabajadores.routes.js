import express from "express";

import {
  crearTrabajador,
  listarTrabajadores,
  cambiarEstadoTrabajador,
  actualizarTrabajador
} from "../controllers/trabajadores.controller.js";

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
  listarTrabajadores
);

router.post(
  "/",
  verificarToken,
  permitirRoles("administrador"),
  crearTrabajador
);
router.patch(
  "/:id/estado",
  verificarToken,
  permitirRoles("administrador"),
  cambiarEstadoTrabajador
);

router.patch(
  "/:id",
  verificarToken,
  permitirRoles("administrador"),
  actualizarTrabajador
);

export default router;