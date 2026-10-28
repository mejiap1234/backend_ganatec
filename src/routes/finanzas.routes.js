import { Router } from "express";

import {
  registrarGasto,
  listarMovimientosFinancieros,
  registrarVentaLeche,
  listarVentasLeche,
   registrarVentaAnimal,
  listarVentasAnimales,
   resumenFinanciero
} from "../controllers/finanzas.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import {
  permitirRoles
} from "../middleware/roles.middleware.js";


const router = Router();


// Registrar gasto general
router.post(
  "/gastos",
  verificarToken,
  permitirRoles("administrador"),
  registrarGasto
);


// Consultar movimientos financieros
router.get(
  "/movimientos",
  verificarToken,
  permitirRoles("administrador"),
  listarMovimientosFinancieros
);


router.post(
  "/ventas-leche",
  verificarToken,
  permitirRoles("administrador"),
  registrarVentaLeche
);


router.get(
  "/ventas-leche",
  verificarToken,
  permitirRoles("administrador"),
  listarVentasLeche
);

router.post(
  "/ventas-animales/:animalId",
  verificarToken,
  permitirRoles("administrador"),
  registrarVentaAnimal
);


router.get(
  "/ventas-animales",
  verificarToken,
  permitirRoles("administrador"),
  listarVentasAnimales
);

router.get(
  "/resumen",
  verificarToken,
  permitirRoles("administrador"),
  resumenFinanciero
);

export default router;