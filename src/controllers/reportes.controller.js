import pool from "../config/db.js";

const ALLOWED = new Set(["operativo","leche","reproduccion","salud","finanzas"]);
const ZONA = "America/Bogota";
const toNumber = (v) => Number(v ?? 0);
const kpi = (nombre, valor, moneda=false) => ({nombre,valor:toNumber(valor),moneda});

const dateOK = (v) => {
  if(typeof v!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d=new Date(v+"T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v;
};
function options(req) {
  const partes=new Intl.DateTimeFormat("en-US", {
    year:"numeric",month:"2-digit",day:"2-digit",timeZone:ZONA,
  }).formatToParts(new Date());
  const fecha = Object.fromEntries(partes.map(({type,value})=>[type,value]));
  const ahora = fecha.year + "-" + fecha.month + "-" + fecha.day;
  const desde=req.query.desde || ahora.slice(0,4)+"-01-01";
  const hasta=req.query.hasta || ahora;
  const page=req.query.page===undefined ? 1 : Number(req.query.page);
  const pageSize=req.query.pageSize===undefined ? 25 : Number(req.query.pageSize);
  const vista=req.query.vista || "animales";
  if(!dateOK(desde)||!dateOK(hasta)||desde>hasta) throw new Error("Rango de fechas inválido.");
  if(Date.parse(hasta)-Date.parse(desde)>3660*86400000) throw new Error("El intervalo máximo es diez años.");
  if(!Number.isInteger(page)||page<1||page>100000) throw new Error("Página inválida.");
  if(![10,25,50,100].includes(pageSize)) throw new Error("El tamaño debe ser 10, 25, 50 o 100.");
  if(!["animales","inventario","potreros"].includes(vista)) throw new Error("Vista operativa inválida.");
  return {desde,hasta,page,pageSize,vista};
}
async function sql(t, params){return (await pool.query(t,params)).rows;}
const count = async (base,group,params) => {
  const query = group
    ? "SELECT COUNT(*)::int AS total FROM (SELECT 1 "+base+group+") cuenta"
    : "SELECT COUNT(*)::int AS total "+base;
  // pg exige tantos valores como parámetros SQL presentes.
  const ids=[...query.matchAll(/\$(\d+)/g)].map(x=>Number(x[1]));
  const usados=ids.length?Math.max(...ids):0;
  return toNumber((await sql(query,params.slice(0,usados)))[0]?.total);
};
const columns = (...pairs)=>pairs.map(([key,label])=>({key,label}));

async function operativo(f,desde,hasta,limit,offset,vista){
  const animales=(await sql(`SELECT COUNT(*)::int total,
    COUNT(*) FILTER(WHERE estado='activo')::int activos,
    COUNT(*) FILTER(WHERE sexo='hembra' AND estado='activo')::int hembras,
    COUNT(*) FILTER(WHERE sexo='macho' AND estado='activo')::int machos
    FROM animales WHERE finca_id=$1`,[f]))[0];
  const stock=(await sql(`WITH existencias AS (
    SELECT pi.id,pi.stock_minimo,COALESCE(SUM(
      CASE WHEN mi.tipo='entrada' THEN mi.cantidad WHEN mi.tipo='salida' THEN -mi.cantidad ELSE 0 END),0) actual
    FROM productos_inventario pi LEFT JOIN movimientos_inventario mi ON mi.producto_id=pi.id
    WHERE pi.finca_id=$1 AND pi.activo=true GROUP BY pi.id,pi.stock_minimo
  ) SELECT COUNT(*)::int productos,
  COUNT(*) FILTER(WHERE actual<=0)::int agotados,
  COUNT(*) FILTER(WHERE actual>0 AND stock_minimo IS NOT NULL AND actual<=stock_minimo)::int bajos,
  COUNT(*) FILTER(WHERE stock_minimo IS NULL)::int sin_minimo FROM existencias`,[f]))[0];
  const terrenos=(await sql(`SELECT
   (SELECT COUNT(*)::int FROM potreros WHERE finca_id=$1) potreros,
   (SELECT COUNT(*)::int FROM lotes WHERE finca_id=$1) lotes`,[f]))[0];
  let base,group="",select,order,col;
  const args=[f,desde,hasta];
  if(vista==="animales"){
    base=`FROM animales a LEFT JOIN LATERAL (
      SELECT peso_kg,fecha_pesaje FROM pesajes
      WHERE animal_id=a.id AND fecha_pesaje BETWEEN $2::date AND $3::date
      ORDER BY fecha_pesaje DESC,id DESC LIMIT 1
    ) p ON true WHERE a.finca_id=$1`;
    select=`a.identificacion,COALESCE(a.nombre,'Sin nombre') nombre,a.sexo,
      COALESCE(a.raza,'Sin raza') raza,a.estado,p.peso_kg ultimo_peso_kg,p.fecha_pesaje`;
    order="a.identificacion,a.id";
    col=columns(["identificacion","Identificación"],["nombre","Animal"],["sexo","Sexo"],
      ["raza","Raza"],["estado","Estado"],["ultimo_peso_kg","Último peso (kg)"],["fecha_pesaje","Fecha del peso"]);
  } else if(vista==="inventario"){
    base=`FROM productos_inventario pi
      LEFT JOIN movimientos_inventario mi ON mi.producto_id=pi.id
      WHERE pi.finca_id=$1`;
    group=" GROUP BY pi.id";
    select=`pi.nombre,pi.categoria,pi.unidad,pi.stock_minimo,pi.activo,
      COALESCE(SUM(CASE WHEN mi.tipo='entrada' THEN mi.cantidad
        WHEN mi.tipo='salida' THEN -mi.cantidad ELSE 0 END),0)::numeric(12,2) stock_actual`;
    order="pi.nombre,pi.id";
    col=columns(["nombre","Producto"],["categoria","Categoría"],["unidad","Unidad"],
      ["stock_actual","Stock actual"],["stock_minimo","Stock mínimo"],["activo","Activo"]);
  }else{
    base="FROM potreros p WHERE p.finca_id=$1";
    select="p.nombre,p.estado,p.area_hectareas,p.capacidad_animales,p.tipo_pasto";
    order="p.nombre,p.id";
    col=columns(["nombre","Potrero"],["estado","Estado"],["area_hectareas","Hectáreas"],
      ["capacidad_animales","Capacidad"],["tipo_pasto","Pasto"]);
  }
  const total=await count(base,group,args);
  // PostgreSQL requiere parámetros consecutivos; inventario y potreros
  // no usan las fechas del listado de animales.
  const usaFechas = vista === "animales";
  const sqlPagina = "SELECT " + select + " " + base + group + " ORDER BY " + order +
    (usaFechas ? " LIMIT $4 OFFSET $5" : " LIMIT $2 OFFSET $3");
  const argumentosPagina = usaFechas
    ? [...args,limit,offset]
    : [f,limit,offset];
  const rows=await sql(sqlPagina,argumentosPagina);
  return {rows,total,columns:col,kpis:[
    kpi("Animales",animales.total),kpi("Activos",animales.activos),
    kpi("Hembras activas",animales.hembras),kpi("Productos activos",stock.productos),
    kpi("Stock bajo",stock.bajos),kpi("Agotados",stock.agotados),
    kpi("Potreros",terrenos.potreros),kpi("Lotes",terrenos.lotes)
  ],chart:[{label:"Hembras activas",value:toNumber(animales.hembras)},
    {label:"Machos activos",value:toNumber(animales.machos)}],
  notes:["Estados e inventario reflejan la situación actual, no una reconstrucción histórica.",
    ...(toNumber(stock.sin_minimo)>0?["Hay productos sin mínimo de existencias configurado."]:[])]};
}

async function leche(f,desde,hasta,limit,offset){
  const args=[f,desde,hasta];
  // El total diario rápido, cuando exista, tiene prioridad para una fecha.
  const common=`WITH detalles AS (
    SELECT rl.fecha_ordenio::date fecha,SUM(rl.litros) litros
    FROM registros_leche rl JOIN lactancias l ON l.id=rl.lactancia_id
    JOIN animales a ON a.id=l.animal_id
    WHERE a.finca_id=$1 AND rl.fecha_ordenio >= $2::date
      AND rl.fecha_ordenio < ($3::date+INTERVAL '1 day')
      AND NOT EXISTS (SELECT 1 FROM produccion_leche_diaria pd
       WHERE pd.finca_id=$1 AND pd.fecha_produccion=rl.fecha_ordenio::date)
    GROUP BY rl.fecha_ordenio::date
  ), rapida AS (
    SELECT fecha_produccion fecha,SUM(litros_totales) litros
    FROM produccion_leche_diaria WHERE finca_id=$1
      AND fecha_produccion BETWEEN $2::date AND $3::date
    GROUP BY fecha_produccion
  ), produccion AS (SELECT * FROM detalles UNION ALL SELECT * FROM rapida)`;
  const totals=(await sql(common+` SELECT COALESCE(SUM(litros),0) litros,
    COUNT(*)::int dias,COALESCE(ROUND(AVG(litros),2),0) promedio FROM produccion`,args))[0];
  const ranking=`FROM registros_leche rl JOIN lactancias l ON l.id=rl.lactancia_id
    JOIN animales a ON a.id=l.animal_id
    WHERE a.finca_id=$1 AND rl.fecha_ordenio >= $2::date
      AND rl.fecha_ordenio < ($3::date+INTERVAL '1 day')
      AND NOT EXISTS(SELECT 1 FROM produccion_leche_diaria pd
        WHERE pd.finca_id=$1 AND pd.fecha_produccion=rl.fecha_ordenio::date)`;
  const group=" GROUP BY a.id";
  const total=await count(ranking,group,args);
  const rows=await sql(`SELECT a.identificacion,COALESCE(a.nombre,'Sin nombre') nombre,
      SUM(rl.litros)::numeric(14,2) litros,COUNT(*)::int ordenios,
      COUNT(DISTINCT rl.fecha_ordenio::date)::int dias,
      ROUND(SUM(rl.litros)/NULLIF(COUNT(DISTINCT rl.fecha_ordenio::date),0),2) promedio
    `+ranking+group+` ORDER BY litros DESC,a.identificacion,a.id LIMIT $4 OFFSET $5`,
    [...args,limit,offset]);
  const chart=await sql(common+` SELECT TO_CHAR(fecha,'YYYY-MM') label,
    SUM(litros)::numeric(14,2) value FROM produccion
    GROUP BY TO_CHAR(fecha,'YYYY-MM') ORDER BY label`,args);
  const conflictos=(await sql(`SELECT COUNT(DISTINCT pd.fecha_produccion)::int total
    FROM produccion_leche_diaria pd WHERE pd.finca_id=$1
    AND pd.fecha_produccion BETWEEN $2::date AND $3::date
    AND EXISTS (SELECT 1 FROM registros_leche rl
      JOIN lactancias l ON l.id=rl.lactancia_id JOIN animales a ON a.id=l.animal_id
      WHERE a.finca_id=$1 AND rl.fecha_ordenio::date=pd.fecha_produccion)`,args))[0];
  return {rows,total,columns:columns(["identificacion","Identificación"],["nombre","Vaca"],
    ["litros","Litros registrados"],["ordenios","Ordeños"],["dias","Días"],["promedio","L/día registrado"]),
    chart,kpis:[kpi("Litros totales",totals.litros),kpi("Días con producción",totals.dias),
      kpi("Promedio por día registrado",totals.promedio),kpi("Vacas con datos individuales",total)],
    notes:["El ranking por vaca solamente usa ordeños individuales; no atribuye la producción diaria total a vacas específicas.",
      ...(toNumber(conflictos.total)>0?["Hay fechas con ambos métodos; para el total se priorizó la producción diaria rápida."]:[])]};
}

async function reproduccion(f,desde,hasta,limit,offset){
  const args=[f,desde,hasta];
  const base=`FROM servicios_reproductivos sr
    JOIN animales a ON a.id=sr.animal_id
    WHERE a.finca_id=$1 AND sr.fecha_servicio >= $2::date
      AND sr.fecha_servicio < ($3::date+INTERVAL '1 day')`;
  const total=await count(base,"",args);
  const rows=await sql(`SELECT a.identificacion,COALESCE(a.nombre,'Sin nombre') animal,
    sr.fecha_servicio::date fecha_servicio,sr.tipo_servicio,sr.responsable,
    (SELECT d.resultado FROM diagnosticos_gestacion d
      WHERE d.servicio_reproductivo_id=sr.id
      ORDER BY d.fecha_diagnostico DESC,d.id DESC LIMIT 1) diagnostico,
    (SELECT g.estado FROM gestaciones g WHERE g.servicio_reproductivo_id=sr.id
      ORDER BY g.id DESC LIMIT 1) gestacion
    `+base+` ORDER BY sr.fecha_servicio DESC,sr.id DESC LIMIT $4 OFFSET $5`,
    [...args,limit,offset]);
  const agg=(await sql(`SELECT
    (SELECT COUNT(*)::int FROM gestaciones g
      JOIN servicios_reproductivos sr ON sr.id=g.servicio_reproductivo_id
      JOIN animales a ON a.id=sr.animal_id
      WHERE a.finca_id=$1 AND g.fecha_inicio_estimada BETWEEN $2::date AND $3::date) gestaciones,
    (SELECT COUNT(*)::int FROM partos p
      JOIN gestaciones g ON g.id=p.gestacion_id
      JOIN servicios_reproductivos sr ON sr.id=g.servicio_reproductivo_id
      JOIN animales a ON a.id=sr.animal_id
      WHERE a.finca_id=$1 AND p.fecha_parto >= $2::date
        AND p.fecha_parto < ($3::date+INTERVAL '1 day')) partos,
    (SELECT COUNT(*)::int FROM crias_parto cp
      JOIN partos p ON p.id=cp.parto_id JOIN gestaciones g ON g.id=p.gestacion_id
      JOIN servicios_reproductivos sr ON sr.id=g.servicio_reproductivo_id
      JOIN animales a ON a.id=sr.animal_id WHERE a.finca_id=$1
      AND p.fecha_parto >= $2::date AND p.fecha_parto < ($3::date+INTERVAL '1 day')) crias`,args))[0];
  const chart=await sql(`SELECT sr.tipo_servicio label,COUNT(*)::int value `+base+
    " GROUP BY sr.tipo_servicio ORDER BY value DESC",args);
  return {rows,total,columns:columns(["identificacion","Identificación"],["animal","Animal"],
    ["fecha_servicio","Fecha"],["tipo_servicio","Servicio"],["responsable","Responsable"],
    ["diagnostico","Diagnóstico reciente"],["gestacion","Gestación"]),
    chart,kpis:[kpi("Servicios",total),kpi("Gestaciones iniciadas",agg.gestaciones),
      kpi("Partos",agg.partos),kpi("Crías",agg.crias)],
    notes:["Cada indicador se filtra por su fecha correspondiente; sus diferencias no representan una tasa de fertilidad."]};
}

async function salud(f,desde,hasta,limit,offset){
  const args=[f,desde,hasta];
  const base=`FROM eventos_salud e JOIN animales a ON a.id=e.animal_id
    WHERE a.finca_id=$1 AND e.fecha_evento BETWEEN $2::date AND $3::date`;
  const agg=(await sql(`SELECT COUNT(*)::int total,
    COUNT(*) FILTER(WHERE e.estado='abierto')::int abiertos,
    COUNT(DISTINCT e.animal_id)::int afectados `+base,args))[0];
  const adicionales=(await sql(`SELECT
    (SELECT COUNT(*)::int FROM tratamientos t JOIN eventos_salud e ON e.id=t.evento_salud_id
      JOIN animales a ON a.id=e.animal_id WHERE a.finca_id=$1
      AND t.fecha_inicio BETWEEN $2::date AND $3::date) tratamientos,
    (SELECT COUNT(*)::int FROM vacunaciones v JOIN animales a ON a.id=v.animal_id
      WHERE a.finca_id=$1 AND v.fecha_aplicacion BETWEEN $2::date AND $3::date) vacunas`,args))[0];
  const rows=await sql(`SELECT a.identificacion,COALESCE(a.nombre,'Sin nombre') animal,
    e.fecha_evento,e.tipo_evento,e.titulo,e.gravedad,e.estado,
    (SELECT COUNT(*)::int FROM tratamientos t WHERE t.evento_salud_id=e.id) tratamientos
    `+base+` ORDER BY e.fecha_evento DESC,e.id DESC LIMIT $4 OFFSET $5`,
    [...args,limit,offset]);
  const chart=await sql(`SELECT e.tipo_evento label,COUNT(*)::int value `+base+
    " GROUP BY e.tipo_evento ORDER BY value DESC",args);
  return {rows,total:toNumber(agg.total),columns:columns(["identificacion","Identificación"],
    ["animal","Animal"],["fecha_evento","Fecha"],["tipo_evento","Tipo"],["titulo","Evento"],
    ["gravedad","Gravedad"],["estado","Estado"],["tratamientos","Tratamientos"]),
    chart,kpis:[kpi("Eventos",agg.total),kpi("Eventos aún abiertos",agg.abiertos),
      kpi("Animales afectados",agg.afectados),kpi("Tratamientos iniciados",adicionales.tratamientos),
      kpi("Vacunaciones",adicionales.vacunas)],
    notes:["Eventos, tratamientos y vacunas se filtran por sus fechas propias. Un evento puede contener varios tratamientos."]};
}

async function finanzas(f,desde,hasta,limit,offset){
  const args=[f,desde,hasta];
  const base=`FROM movimientos_financieros mf WHERE mf.finca_id=$1
    AND mf.fecha_movimiento >= $2::date
    AND mf.fecha_movimiento < ($3::date+INTERVAL '1 day')`;
  const agg=(await sql(`SELECT COUNT(*)::int total,
    COALESCE(SUM(mf.monto) FILTER(WHERE mf.tipo='ingreso'),0) ingresos,
    COALESCE(SUM(mf.monto) FILTER(WHERE mf.tipo='gasto'),0) gastos `+base,args))[0];
  const rows=await sql(`SELECT mf.fecha_movimiento::date fecha,mf.tipo,mf.categoria,mf.monto,
    mf.descripcion,mf.referencia_tipo
    `+base+` ORDER BY mf.fecha_movimiento DESC,mf.id DESC LIMIT $4 OFFSET $5`,
    [...args,limit,offset]);
  const chart=await sql(`SELECT mf.categoria label,
    SUM(CASE WHEN mf.tipo='gasto' THEN mf.monto ELSE 0 END)::numeric(14,2) value
    `+base+` GROUP BY mf.categoria HAVING SUM(CASE WHEN mf.tipo='gasto' THEN mf.monto ELSE 0 END)>0
    ORDER BY value DESC LIMIT 10`,args);
  const ingresos=toNumber(agg.ingresos), gastos=toNumber(agg.gastos);
  return {rows,total:toNumber(agg.total),
    columns:columns(["fecha","Fecha"],["tipo","Tipo"],["categoria","Categoría"],["monto","Monto"],
      ["descripcion","Descripción"],["referencia_tipo","Origen"]),
    chart,kpis:[kpi("Ingresos",ingresos,true),kpi("Gastos",gastos,true),
      kpi("Balance registrado",ingresos-gastos,true),kpi("Movimientos",agg.total)],
    notes:["El balance corresponde a movimientos registrados, no es utilidad neta contable. Las ventas no se vuelven a sumar porque ya crean movimientos financieros."]};
}

export async function obtenerReporte(req,res){
  const tipo=req.params.tipo;
  if(!ALLOWED.has(tipo)) return res.status(404).json({ok:false,message:"Reporte inexistente."});
  if(tipo==="finanzas" && req.usuario.rol!=="administrador")
    return res.status(403).json({ok:false,message:"Acceso a finanzas restringido."});
  const finca=req.usuario.finca_id;
  if(!finca) return res.status(400).json({ok:false,message:"Falta finca asociada."});
  let o;
  try{o=options(req)}catch(e){return res.status(400).json({ok:false,message:e.message})}
  try{
    let result;
    const args=[finca,o.desde,o.hasta,o.pageSize,(o.page-1)*o.pageSize];
    if(tipo==="operativo") result=await operativo(...args,o.vista);
    else if(tipo==="leche") result=await leche(...args);
    else if(tipo==="reproduccion") result=await reproduccion(...args);
    else if(tipo==="salud") result=await salud(...args);
    else result=await finanzas(...args);
    return res.json({ok:true,tipo,vista:tipo==="operativo"?o.vista:null,
      periodo:{desde:o.desde,hasta:o.hasta},resumen:result.kpis,
      grafica:result.chart.map(p=>({nombre:p.label||p.nombre,valor:toNumber(p.value??p.valor)})),
      columnas:result.columns,filas:result.rows,avisos:result.notes,
      paginacion:{page:o.page,pageSize:o.pageSize,totalItems:result.total,
        totalPages:Math.ceil(result.total/o.pageSize)},
      generadoEn:new Date().toISOString(),zonaHoraria:ZONA});
  }catch(err){
    console.error("[Ganatec reportes]",{tipo,error:err.message});
    return res.status(500).json({ok:false,message:"No fue posible generar el reporte."});
  }
}
