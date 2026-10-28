import { Router } from "express";

import {
  registrarCompra,
  listarCompras
} from "../controllers/compras.controller.js";

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
  listarCompras
);


router.post(
  "/",
  verificarToken,
  permitirRoles("administrador"),
  registrarCompra
);


export default router;