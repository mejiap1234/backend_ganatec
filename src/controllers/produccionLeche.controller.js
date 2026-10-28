import pool from "../config/db.js";


/* =========================================================
   CALENDARIO MENSUAL DE PRODUCCIÓN DE LECHE
========================================================= */

export const calendarioProduccionLeche = async (
  req,
  res
) => {

  const fincaId =
    req.usuario.finca_id;

  const { mes } =
    req.query;


  if (
    !mes ||
    !/^\d{4}-\d{2}$/.test(mes)
  ) {

    return res.status(400).json({
      ok: false,
      message:
        "Debe indicar el mes en formato YYYY-MM"
    });

  }


  try {

    const resultado =
      await pool.query(
        `
          WITH produccion_detallada AS (

            SELECT

              rl.fecha_ordenio::date
                AS fecha,

              SUM(
                rl.litros
              )::numeric(12,2)
                AS litros,

              COUNT(
                rl.id
              )::int
                AS total_ordenios,

              COUNT(
                DISTINCT l.animal_id
              )::int
                AS animales_con_registro

            FROM registros_leche rl

            INNER JOIN lactancias l
              ON l.id = rl.lactancia_id

            INNER JOIN animales a
              ON a.id = l.animal_id

            WHERE a.finca_id = $1

              AND TO_CHAR(
                rl.fecha_ordenio,
                'YYYY-MM'
              ) = $2

              AND NOT EXISTS (

                SELECT 1

                FROM produccion_leche_diaria pld

                WHERE pld.finca_id = $1

                  AND pld.fecha_produccion =
                      rl.fecha_ordenio::date

              )

            GROUP BY
              rl.fecha_ordenio::date

          ),


          produccion_rapida AS (

            SELECT

              fecha_produccion::date
                AS fecha,

              litros_totales::numeric(12,2)
                AS litros,

              numero_ordenios::int
                AS total_ordenios,

              vacas_ordenadas::int
                AS animales_con_registro

            FROM produccion_leche_diaria

            WHERE finca_id = $1

              AND TO_CHAR(
                fecha_produccion,
                'YYYY-MM'
              ) = $2

          ),


          produccion_unificada AS (

            SELECT *
            FROM produccion_detallada

            UNION ALL

            SELECT *
            FROM produccion_rapida

          )


          SELECT

            fecha,

            SUM(
              litros
            )::numeric(12,2)
              AS litros,

            SUM(
              total_ordenios
            )::int
              AS total_ordenios,

            SUM(
              animales_con_registro
            )::int
              AS animales_con_registro

          FROM produccion_unificada

          GROUP BY fecha

          ORDER BY fecha ASC
        `,
        [
          fincaId,
          mes
        ]
      );


    const dias =
      resultado.rows;


    const totalLitros =
      dias.reduce(
        (total, dia) =>
          total +
          Number(
            dia.litros
          ),
        0
      );


    const promedioDiario =
      dias.length > 0
        ? totalLitros / dias.length
        : 0;


    let mayorProduccion =
      null;

    let menorProduccion =
      null;


    if (
      dias.length > 0
    ) {

      mayorProduccion =
        dias.reduce(
          (mayor, dia) =>
            Number(
              dia.litros
            )
            >
            Number(
              mayor.litros
            )
              ? dia
              : mayor
        );


      menorProduccion =
        dias.reduce(
          (menor, dia) =>
            Number(
              dia.litros
            )
            <
            Number(
              menor.litros
            )
              ? dia
              : menor
        );

    }


    return res.status(200).json({

      ok: true,

      mes,

      resumen: {

        litros_totales:
          Number(
            totalLitros.toFixed(2)
          ),

        dias_con_produccion:
          dias.length,

        promedio_diario:
          Number(
            promedioDiario.toFixed(2)
          ),

        mayor_produccion:
          mayorProduccion,

        menor_produccion:
          menorProduccion

      },

      dias

    });


  } catch (error) {

    console.error(
      "Error calendario producción:",
      error
    );


    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar el calendario de producción"
    });

  }

};


/* =========================================================
   RESUMEN ANUAL DE PRODUCCIÓN DE LECHE
========================================================= */

export const resumenAnualLeche = async (
  req,
  res
) => {

  const fincaId =
    req.usuario.finca_id;

  const anio =
    Number(
      req.query.anio
    );


  if (
    !Number.isInteger(anio) ||
    anio < 2000
  ) {

    return res.status(400).json({
      ok: false,
      message:
        "Debe indicar un año válido"
    });

  }


  try {

    const resultado =
      await pool.query(
        `
          WITH produccion_detallada AS (

            SELECT

              rl.fecha_ordenio::date
                AS fecha,

              SUM(
                rl.litros
              )::numeric(12,2)
                AS litros

            FROM registros_leche rl

            INNER JOIN lactancias l
              ON l.id = rl.lactancia_id

            INNER JOIN animales a
              ON a.id = l.animal_id

            WHERE a.finca_id = $1

              AND EXTRACT(
                YEAR FROM rl.fecha_ordenio
              ) = $2

              AND NOT EXISTS (

                SELECT 1

                FROM produccion_leche_diaria pld

                WHERE pld.finca_id = $1

                  AND pld.fecha_produccion =
                      rl.fecha_ordenio::date

              )

            GROUP BY
              rl.fecha_ordenio::date

          ),


          produccion_rapida AS (

            SELECT

              fecha_produccion::date
                AS fecha,

              litros_totales::numeric(12,2)
                AS litros

            FROM produccion_leche_diaria

            WHERE finca_id = $1

              AND EXTRACT(
                YEAR FROM fecha_produccion
              ) = $2

          ),


          produccion_unificada AS (

            SELECT *
            FROM produccion_detallada

            UNION ALL

            SELECT *
            FROM produccion_rapida

          )


          SELECT

            EXTRACT(
              MONTH FROM fecha
            )::int
              AS mes,

            SUM(
              litros
            )::numeric(12,2)
              AS litros,

            COUNT(
              DISTINCT fecha
            )::int
              AS dias_con_produccion

          FROM produccion_unificada

          GROUP BY
            EXTRACT(
              MONTH FROM fecha
            )

          ORDER BY mes ASC
        `,
        [
          fincaId,
          anio
        ]
      );


    const totalAnual =
      resultado.rows.reduce(
        (total, mes) =>
          total +
          Number(
            mes.litros
          ),
        0
      );


    return res.status(200).json({

      ok: true,

      anio,

      litros_totales:
        Number(
          totalAnual.toFixed(2)
        ),

      meses:
        resultado.rows

    });


  } catch (error) {

    console.error(
      "Error resumen anual de leche:",
      error
    );


    return res.status(500).json({
      ok: false,
      message:
        "Error al consultar la producción anual"
    });

  }

};