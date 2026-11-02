import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { permitirRoles } from "../middleware/roles.middleware.js";
import { obtenerReporte } from "../controllers/reportes.controller.js";

const router = Router();
router.get("/:tipo", verificarToken, permitirRoles("administrador","trabajador"), obtenerReporte);
export default router;
