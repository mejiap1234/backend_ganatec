import jwt from "jsonwebtoken";

export const verificarToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        ok: false,
        message: "Token no proporcionado"
      });
    }

    const partes = authHeader.split(" ");

    if (partes.length !== 2 || partes[0] !== "Bearer") {
      return res.status(401).json({
        ok: false,
        message: "Formato de token inválido"
      });
    }

    const token = partes[1];

    const datosToken = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.usuario = datosToken;

    next();

  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: "Token inválido o expirado"
    });
  }
};