import pool from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const pruebaAuth = (req, res) => {
  res.json({
    ok: true,
    message: "Controlador de autenticación funcionando"
  });
};


export const registrarUsuario = async (req, res) => {

  const {
    nombre,
    apellido,
    email,
    password,
    nombreFinca
  } = req.body;


  if (!nombre || !apellido || !email || !password || !nombreFinca) {
    return res.status(400).json({
      ok: false,
      message: "Todos los campos son obligatorios"
    });
  }


  const nombreLimpio = nombre.trim();
  const apellidoLimpio = apellido.trim();
  const emailNormalizado = email.trim().toLowerCase();
  const nombreFincaLimpio = nombreFinca.trim();


  const client = await pool.connect();


  try {

    await client.query("BEGIN");


    const usuarioExistente = await client.query(
      `
        SELECT id
        FROM usuarios
        WHERE email = $1
      `,
      [emailNormalizado]
    );


    if (usuarioExistente.rows.length > 0) {

      await client.query("ROLLBACK");

      return res.status(409).json({
        ok: false,
        message: "El correo ya está registrado"
      });

    }


    const passwordHash = await bcrypt.hash(password, 10);


    const resultadoFinca = await client.query(
      `
        INSERT INTO fincas
        (
          nombre
        )
        VALUES ($1)
        RETURNING id, nombre
      `,
      [nombreFincaLimpio]
    );


    const finca = resultadoFinca.rows[0];


    const resultadoUsuario = await client.query(
      `
        INSERT INTO usuarios
        (
          nombre,
          apellido,
          email,
          password,
          rol,
          finca_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          nombre,
          apellido,
          email,
          rol,
          finca_id
      `,
      [
        nombreLimpio,
        apellidoLimpio,
        emailNormalizado,
        passwordHash,
        "administrador",
        finca.id
      ]
    );


    await client.query("COMMIT");


    res.status(201).json({
      ok: true,
      message: "Administrador y finca registrados correctamente",

      usuario: resultadoUsuario.rows[0],

      finca
    });


  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);


    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "El correo ya está registrado"
      });
    }


    res.status(500).json({
      ok: false,
      message: "Error al registrar el usuario"
    });


  } finally {

    client.release();

  }

};


/** LOGIN DE USUARIO */

export const loginUsuario = async (req, res) => {
  try {

    const {
      email,
      password
    } = req.body;


    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        message: "Correo y contraseña son obligatorios"
      });
    }


    const emailNormalizado = email.trim().toLowerCase();


    const resultado = await pool.query(
      `
        SELECT
          id,
          nombre,
          apellido,
          email,
          password,
          rol,
          finca_id,
          activo
        FROM usuarios
        WHERE email = $1
      `,
      [emailNormalizado]
    );


    if (resultado.rows.length === 0) {
      return res.status(401).json({
        ok: false,
        message: "Correo o contraseña incorrectos"
      });
    }


    const usuario = resultado.rows[0];

    if (!usuario.activo) {
  return res.status(403).json({
    ok: false,
    message: "Usuario deshabilitado"
  });
}


    const passwordCorrecto = await bcrypt.compare(
      password,
      usuario.password
    );


    if (!passwordCorrecto) {
      return res.status(401).json({
        ok: false,
        message: "Correo o contraseña incorrectos"
      });
    }

    const token = jwt.sign(
  {
    id: usuario.id,
    rol: usuario.rol,
    finca_id: usuario.finca_id
  },
  process.env.JWT_SECRET,
  {
    expiresIn: "8h"
  }
);


    res.status(200).json({
  ok: true,
  message: "Inicio de sesión correcto",

  usuario: {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    rol: usuario.rol,
    finca_id: usuario.finca_id
  },

  token: token
});


  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al iniciar sesión"
    });

  }
};

/**esta es la parte donde se obtiene el perfil del usuario */
export const obtenerPerfil = async (req, res) => {
  try {

    const usuarioId = req.usuario.id;

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
          fecha_creacion
        FROM usuarios
        WHERE id = $1
      `,
      [usuarioId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado"
      });
    }

    res.status(200).json({
      ok: true,
      usuario: resultado.rows[0]
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Error al obtener el perfil"
    });

  }
};



export const pruebaAdministrador = (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Tienes permisos de administrador",
    usuario: req.usuario
  });
};


export const pruebaSuperadministrador = (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Área exclusiva de superadministradores"
  });
};