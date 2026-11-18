import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { permitirRoles } from "../middleware/roles.middleware.js";
import { obtenerReporte, listarFincasReportes } from "../controllers/reportes.controller.js";

const router = Router();
router.get("/fincas", verificarToken, permitirRoles("superadministrador"), listarFincasReportes);
router.get("/:tipo", verificarToken, permitirRoles("administrador","trabajador","superadministrador"), obtenerReporte);
export default router;
