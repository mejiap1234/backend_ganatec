import pool from "../config/db.js";
import bcrypt from "bcrypt";

export const crearTrabajador = async (req, res) => {
  try {

    const {
      nombre,
      apellido,
      email,
      password
    } = req.body;


    if (!nombre || !apellido || !email || !password) {
      return res.status(400).json({
        ok: false,
        message: "Todos los campos son obligatorios"
      });
    }


    const nombreLimpio = nombre.trim();
    const apellidoLimpio = apellido.trim();
    const emailNormalizado = email.trim().toLowerCase();


    const administradorId = req.usuario.id;
    const fincaId = req.usuario.finca_id;


    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El administrador no tiene una finca asociada"
      });
    }


    const usuarioExistente = await pool.query(
      `
        SELECT id
        FROM usuarios
        WHERE email = $1
      `,
      [emailNormalizado]
    );


    if (usuarioExistente.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        message: "El correo ya está registrado"
      });
    }


    const passwordHash = await bcrypt.hash(
      password,
      10
    );


    const resultado = await pool.query(
      `
        INSERT INTO usuarios
        (
          nombre,
          apellido,
          email,
          password,
          rol,
          finca_id,
          creado_por
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)

        RETURNING
          id,
          nombre,
          apellido,
          email,
          rol,
          finca_id,
          creado_por,
          activo,
          fecha_creacion
      `,
      [
        nombreLimpio,
        apellidoLimpio,
        emailNormalizado,
        passwordHash,
        "trabajador",
        fincaId,
        administradorId
      ]
    );


    res.status(201).json({
      ok: true,
      message: "Trabajador creado correctamente",
      trabajador: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);

    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "El correo ya está registrado"
      });
    }

    res.status(500).json({
      ok: false,
      message: "Error al crear el trabajador"
    });

  }
};

/**listar trabajadores */

export const listarTrabajadores = async (req, res) => {
  try {

    const fincaId = req.usuario.finca_id;

    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El administrador no tiene una finca asociada"
      });
    }


    const resultado = await pool.query(
      `
        SELECT
          id,
          nombre,
          apellido,
          email,
          rol,
          finca_id,
          activo,
          creado_por,
          fecha_creacion
        FROM usuarios
        WHERE finca_id = $1
          AND rol = 'trabajador'
        ORDER BY nombre ASC
      `,
      [fincaId]
    );


    res.status(200).json({
      ok: true,
      total: resultado.rows.length,
      trabajadores: resultado.rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener los trabajadores"
    });

  }
};

export const cambiarEstadoTrabajador = async (req, res) => {
  try {

    const trabajadorId = Number(req.params.id);
    const { activo } = req.body;

    const fincaId = req.usuario.finca_id;


    if (!Number.isInteger(trabajadorId) || trabajadorId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de trabajador inválido"
      });
    }


    if (typeof activo !== "boolean") {
      return res.status(400).json({
        ok: false,
        message: "El campo activo debe ser true o false"
      });
    }


    if (!fincaId) {
      return res.status(400).json({
        ok: false,
        message: "El administrador no tiene una finca asociada"
      });
    }


    const resultado = await pool.query(
      `
        UPDATE usuarios

        SET activo = $1

        WHERE id = $2
          AND finca_id = $3
          AND rol = 'trabajador'

        RETURNING
          id,
          nombre,
          apellido,
          email,
          rol,
          finca_id,
          activo
      `,
      [
        activo,
        trabajadorId,
        fincaId
      ]
    );


    if (resultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Trabajador no encontrado"
      });
    }


    res.status(200).json({
      ok: true,
      message: activo
        ? "Trabajador activado correctamente"
        : "Trabajador desactivado correctamente",

      trabajador: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al cambiar el estado del trabajador"
    });

  }
};

export const actualizarTrabajador = async (req, res) => {
  try {

    const trabajadorId = Number(req.params.id);

    const {
      nombre,
      apellido,
      email
    } = req.body;

    const fincaId = req.usuario.finca_id;


    if (!Number.isInteger(trabajadorId) || trabajadorId <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ID de trabajador inválido"
      });
    }


    if (!nombre || !apellido || !email) {
      return res.status(400).json({
        ok: false,
        message: "Nombre, apellido y correo son obligatorios"
      });
    }


    const nombreLimpio = nombre.trim();
    const apellidoLimpio = apellido.trim();
    const emailNormalizado = email.trim().toLowerCase();


    const correoExistente = await pool.query(
      `
        SELECT id
        FROM usuarios
        WHERE email = $1
          AND id <> $2
      `,
      [
        emailNormalizado,
        trabajadorId
      ]
    );


    if (correoExistente.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        message: "El correo ya está registrado"
      });
    }


    const resultado = await pool.query(
      `
        UPDATE usuarios

        SET
          nombre = $1,
          apellido = $2,
          email = $3

        WHERE id = $4
          AND finca_id = $5
          AND rol = 'trabajador'

        RETURNING
          id,
          nombre,
          apellido,
          email,
          rol,
          finca_id,
          activo,
          creado_por
      `,
      [
        nombreLimpio,
        apellidoLimpio,
        emailNormalizado,
        trabajadorId,
        fincaId
      ]
    );


    if (resultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Trabajador no encontrado"
      });
    }


    res.status(200).json({
      ok: true,
      message: "Trabajador actualizado correctamente",
      trabajador: resultado.rows[0]
    });


  } catch (error) {

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "El correo ya está registrado"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al actualizar el trabajador"
    });

  }
};