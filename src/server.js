import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import trabajadoresRoutes from "./routes/trabajadores.routes.js";
import fincaRoutes from "./routes/finca.routes.js";
import animalesRoutes from "./routes/animales.routes.js";
import potrerosRoutes from "./routes/potreros.routes.js";
import lotesRoutes from "./routes/lotes.routes.js";
import alimentacionRoutes from "./routes/alimentacion.routes.js";
import inventarioRoutes from "./routes/inventario.routes.js";
import comprasRoutes from "./routes/compras.routes.js";
import finanzasRoutes from "./routes/finanzas.routes.js";
import produccionLecheRoutes from "./routes/produccionLeche.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import alertasRoutes from "./routes/alertas.routes.js";
import iaRoutes from "./routes/ia.routes.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3001;

// Permite solicitudes desde el frontend autorizado.
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
);
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/trabajadores", trabajadoresRoutes);
app.use("/api/finca", fincaRoutes);
app.use("/api/animales", animalesRoutes);
app.use("/api/potreros",potrerosRoutes);
app.use( "/api/lotes",lotesRoutes);
app.use( "/api/alimentacion", alimentacionRoutes);
app.use("/api/inventario", inventarioRoutes);
app.use( "/api/compras", comprasRoutes);
app.use( "/api/finanzas", finanzasRoutes);
app.use( "/api/produccion-leche", produccionLecheRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use( "/api/alertas", alertasRoutes);
app.use( "/api/ia", iaRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "API funcionando correctamente"
  });
});

app.get("/api/database", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT NOW() AS fecha_servidor
    `);

    res.json({
      ok: true,
      message: "Conexión con Neon correcta",
      fecha: result.rows[0].fecha_servidor
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error conectando con PostgreSQL"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});