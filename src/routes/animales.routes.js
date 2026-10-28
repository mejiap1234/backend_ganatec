import express from "express";

import {
  crearAnimal,
  listarAnimales,
  obtenerAnimal,
  actualizarAnimal,
  cambiarEstadoAnimal,
  listarHistorialEstados
} from "../controllers/animales.controller.js";

import {
  verificarToken
} from "../middleware/auth.middleware.js";

import {
  permitirRoles
} from "../middleware/roles.middleware.js";

import {
  registrarPesaje,
  listarPesajes
} from "../controllers/pesajes.controller.js";

import {
  registrarEventoSalud,
  listarEventosSalud,
  cambiarEstadoEventoSalud
} from "../controllers/salud.controller.js";

import {
  crearTratamiento,
  listarTratamientos,
  cambiarEstadoTratamiento
} from "../controllers/tratamientos.controller.js";

import {
  agregarMedicamentoTratamiento
} from "../controllers/medicamentos.controller.js";

import {
  registrarVacunacion,
  listarVacunaciones
} from "../controllers/vacunaciones.controller.js";

import {
  registrarServicioReproductivo,
  listarServiciosReproductivos
} from "../controllers/serviciosReproductivos.controller.js";

import {
  registrarDiagnosticoGestacion
} from "../controllers/diagnosticosGestacion.controller.js";

import {
  listarGestaciones
} from "../controllers/gestaciones.controller.js";

import {
  registrarParto,
   listarPartos
} from "../controllers/partos.controller.js";

import {
  registrarOrdenio,
   listarProduccionLeche,
   corregirRegistroLeche,
   listarProduccionLechePorLactancia
} from "../controllers/leche.controller.js";

import {
  finalizarLactancia,
  listarLactancias,
  compararLactancias
} from "../controllers/lactancias.controller.js";

const router = express.Router();

router.get(
  "/",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarAnimales
);

router.post(
  "/:id/pesajes",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  registrarPesaje
);

router.get(
  "/:id/pesajes",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarPesajes
);

router.get(
  "/:id",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  obtenerAnimal
);

router.post(
  "/",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  crearAnimal
);

router.patch(
  "/:id",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  actualizarAnimal
);

router.patch(
  "/:id/estado",
  verificarToken,
  permitirRoles("administrador"),
  cambiarEstadoAnimal
);

router.get(
  "/:id/historial-estados",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarHistorialEstados
);

router.post(
  "/:id/salud",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  registrarEventoSalud
);

router.get(
  "/:id/salud",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarEventosSalud
);

router.patch(
  "/:animalId/salud/:eventoId/estado",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  cambiarEstadoEventoSalud
);

router.post(
  "/:animalId/salud/:eventoId/tratamientos",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  crearTratamiento
);

router.post(
  "/:animalId/salud/:eventoId/tratamientos/:tratamientoId/medicamentos",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  agregarMedicamentoTratamiento
);

router.get(
  "/:animalId/salud/:eventoId/tratamientos",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarTratamientos
);

router.patch(
  "/:animalId/salud/:eventoId/tratamientos/:tratamientoId/estado",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  cambiarEstadoTratamiento
);

router.post(
  "/:id/vacunaciones",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  registrarVacunacion
);


router.get(
  "/:id/vacunaciones",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarVacunaciones
);

router.post(
  "/:id/servicios-reproductivos",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  registrarServicioReproductivo
);

router.get(
  "/:id/servicios-reproductivos",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarServiciosReproductivos
);

router.post(
  "/:animalId/servicios-reproductivos/:servicioId/diagnosticos",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  registrarDiagnosticoGestacion
);

router.get(
  "/:id/gestaciones",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarGestaciones
);

router.post(
  "/:animalId/gestaciones/:gestacionId/partos",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  registrarParto
);
router.get(
  "/:id/partos",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarPartos
);

router.post(
  "/:id/leche",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  registrarOrdenio
);

router.get(
  "/:id/leche",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarProduccionLeche
);

router.patch(
  "/:animalId/leche/:registroId",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  corregirRegistroLeche
);

router.patch(
  "/:animalId/lactancias/:lactanciaId/finalizar",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  finalizarLactancia
);

router.get(
  "/:animalId/lactancias",
  verificarToken,
  permitirRoles("administrador", "trabajador"),
  listarLactancias
);
  /* =========================================================
   HISTORIAL DE LECHE DE UNA LACTANCIA
========================================================= */

router.get(
  "/:animalId/lactancias/:lactanciaId/leche",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  listarProduccionLechePorLactancia
);


router.get(
  "/:animalId/lactancias/comparacion",
  verificarToken,
  permitirRoles(
    "administrador",
    "trabajador"
  ),
  compararLactancias
);

export default router;