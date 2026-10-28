import express from "express";


import {
  pruebaAuth,
  registrarUsuario,
  loginUsuario,
  obtenerPerfil,
  pruebaAdministrador,
  pruebaSuperadministrador
} from "../controllers/auth.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import { permitirRoles } from "../middleware/roles.middleware.js";

const router = express.Router();

router.get("/prueba", pruebaAuth);

router.post("/register", registrarUsuario);

router.post("/login", loginUsuario);

router.get(
  "/perfil",
  verificarToken,
  obtenerPerfil
);

router.get(
  "/admin",
  verificarToken,
  permitirRoles("administrador"),
  pruebaAdministrador
);


router.get(
  "/superadmin",
  verificarToken,
  permitirRoles("superadministrador"),
  pruebaSuperadministrador
);

export default router;

