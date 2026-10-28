import { Router } from "express";

import {
  calendarioProduccionLeche,
  resumenAnualLeche
} from "../controllers/produccionLeche.controller.js";

import {
  registrarProduccionDiaria,
  obtenerResumenProduccionFinca,
  listarProduccionesDiarias,
   editarProduccionDiaria
} from "../controllers/leche.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import {
  permitirRoles
} from "../middleware/roles.middleware.js";


const router = Router();


/* =========================================================
   REGISTRAR PRODUCCIÓN TOTAL DIARIA
========================================================= */

router.post(
  "/diaria",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  registrarProduccionDiaria
);

/* =========================================================
   HISTORIAL DE PRODUCCIÓN TOTAL DIARIA
========================================================= */

router.get(
  "/diaria",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarProduccionesDiarias
);


/* =========================================================
   EDITAR PRODUCCIÓN TOTAL DIARIA
========================================================= */

router.patch(
  "/diaria/:id",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  editarProduccionDiaria
);

/* =========================================================
   RESUMEN GENERAL DE PRODUCCIÓN
========================================================= */

router.get(
  "/resumen",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  obtenerResumenProduccionFinca
);


/* =========================================================
   CALENDARIO DE PRODUCCIÓN
========================================================= */

router.get(
  "/calendario",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  calendarioProduccionLeche
);


/* =========================================================
   RESUMEN ANUAL
========================================================= */

router.get(
  "/anual",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  resumenAnualLeche
);


export default router;