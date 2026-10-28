export const permitirRoles = (...rolesPermitidos) => {
  return (req, res, next) => {

    const rolUsuario = req.usuario.rol;

    if (!rolesPermitidos.includes(rolUsuario)) {
      return res.status(403).json({
        ok: false,
        message: "No tienes permisos para realizar esta acción"
      });
    }

    next();
  };
};