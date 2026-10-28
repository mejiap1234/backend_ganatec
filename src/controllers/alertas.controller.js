import pool from "../config/db.js";

import {
  sincronizarAlertasFinca
} from "../services/alertas.service.js";


// ==========================================
// LISTAR ALERTAS
// ==========================================

export const listarAlertas = async (req, res) => {

  const fincaId =
    req.usuario.finca_id;

  const {
    estado = "pendiente",
    tipo,
    prioridad
  } = req.query;


  try {

    // Antes de responder actualizamos
    // automáticamente las reglas.
    await sincronizarAlertasFinca(
      fincaId
    );


    const valores = [fincaId];

    const condiciones = [
      "a.finca_id = $1"
    ];


    if (estado) {

      if (
        ![
          "pendiente",
          "resuelta"
        ].includes(estado)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Estado de alerta inválido"
        });
      }


      valores.push(estado);

      condiciones.push(
        `a.estado = $${valores.length}`
      );
    }


    if (tipo) {

      valores.push(tipo);

      condiciones.push(
        `a.tipo = $${valores.length}`
      );
    }


    if (prioridad) {

      valores.push(prioridad);

      condiciones.push(
        `a.prioridad = $${valores.length}`
      );
    }


    const resultado =
      await pool.query(
        `
          SELECT
            a.id,
            a.tipo,
            a.prioridad,
            a.titulo,
            a.mensaje,

            a.entidad_tipo,
            a.entidad_id,

            a.estado,
            a.datos,

            a.fecha_detectada,
            a.fecha_actualizacion,
            a.fecha_resuelta

          FROM alertas a

          WHERE
            ${condiciones.join(" AND ")}

          ORDER BY

            CASE a.prioridad

              WHEN 'critica'
                THEN 1

              WHEN 'alta'
                THEN 2

              WHEN 'media'
                THEN 3

              ELSE 4

            END,

            a.fecha_detectada DESC
        `,
        valores
      );


    const criticas =
      resultado.rows.filter(
        alerta =>
          alerta.prioridad ===
          "critica"
      ).length;


    const altas =
      resultado.rows.filter(
        alerta =>
          alerta.prioridad ===
          "alta"
      ).length;


    return res.status(200).json({

      ok: true,

      resumen: {
        total:
          resultado.rows.length,

        criticas,

        altas
      },

      alertas:
        resultado.rows

    });


  } catch (error) {

    console.error(
      "ERROR ALERTAS:",
      error
    );


    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar las alertas"
    });

  }

};