-- =====================================================================
-- Paso 3: las cuentas
-- Reemplaza a Power Query y a las medidas DAX. Son todas VISTAS:
-- consultas guardadas que se recalculan solas cada vez que las mirás.
-- No guardan datos, así que se pueden borrar y volver a crear sin
-- perder nada.
-- Se pega entero en Supabase → SQL Editor → New query → Run.
-- Se puede correr más de una vez (cada vista se reemplaza).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. "Hoy" en Argentina
--    La base vive en otro huso horario. Sin esto, a las 22 h de acá
--    para la base ya sería mañana.
-- ---------------------------------------------------------------------

create or replace function hoy() returns date
language sql stable as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;


-- ---------------------------------------------------------------------
-- 1. Ciclos con su fin
--    fecha_fin: el día anterior al próximo cobro (vacía en el ciclo en curso).
--    fin_calculo: la que se usa para las cuentas. En el ciclo en curso es
--    un mes después de empezar, así una cuota que arranca el mes que viene
--    no se suma a este ciclo (en Power Query pasaba, por el 31/12/9999).
-- ---------------------------------------------------------------------

create or replace view ciclos_con_fin with (security_invoker = true) as
select
  nombre,
  fecha_inicio,
  (lead(fecha_inicio) over (order by fecha_inicio) - 1) as fecha_fin,
  cotizacion,
  lead(fecha_inicio) over (order by fecha_inicio) is null as en_curso,
  coalesce(lead(fecha_inicio) over (order by fecha_inicio) - 1,
           (fecha_inicio + interval '1 month' - interval '1 day')::date) as fin_calculo
from ciclos;


-- ---------------------------------------------------------------------
-- 2. Movimientos por ciclo (tu paso 3 y 4 de Power Query)
--    Cada movimiento aparece una vez por cada ciclo que toca:
--    un variable en uno solo, un fijo en todos los ciclos en que está vigente.
--    Además:
--    - monto: el vigente en ese ciclo (si un fijo cambió de precio, el
--      ciclo ve el monto que correspondía en ese momento).
--    - monto_ars: en pesos, con la cotización DE ESE ciclo.
--    - dia_ciclo y semana: para el pozo semanal (el día de cobro es el día 1).
-- ---------------------------------------------------------------------

create or replace view movimientos_por_ciclo with (security_invoker = true) as
select
  c.nombre        as ciclo,
  c.fecha_inicio  as ciclo_inicio,
  m.id,
  m.marca_temporal,
  m.detalle,
  m.categoria,
  cat.tiene_presupuesto,
  m.tipo,
  m.fijo_variable,
  m.modalidad,
  m.metodo_pago,
  m.divisa,
  m.fecha_inicio,
  m.fecha_fin,
  m.esencial,
  coalesce(cm.monto, m.monto) as monto,
  coalesce(cm.monto, m.monto) * case when m.divisa = 'USD' then c.cotizacion else 1 end as monto_ars,
  (m.fecha_inicio - c.fecha_inicio + 1) as dia_ciclo,
  case
    when m.fecha_inicio - c.fecha_inicio + 1 <= 8  then 1
    when m.fecha_inicio - c.fecha_inicio + 1 <= 15 then 2
    when m.fecha_inicio - c.fecha_inicio + 1 <= 22 then 3
    when m.fecha_inicio - c.fecha_inicio + 1 <= 30 then 4
    else 5
  end as semana
from movimientos m
join ciclos_con_fin c
  on m.fecha_inicio <= c.fin_calculo
 and coalesce(m.fecha_fin, 'infinity'::date) >= c.fecha_inicio
join categorias cat on cat.nombre = m.categoria
left join lateral (
  -- el último cambio de monto que ya regía al terminar el ciclo
  select x.monto from cambios_monto x
  where x.movimiento_id = m.id and x.desde <= c.fin_calculo
  order by x.desde desc
  limit 1
) cm on true;


-- ---------------------------------------------------------------------
-- 3. Resumen del ciclo (tus medidas de los grupos 1 y 2)
--    Una fila por ciclo. Si un ciclo no tiene presupuesto cargado,
--    presupuesto, sí o sí y libre para gastar quedan vacíos (= "sin datos").
-- ---------------------------------------------------------------------

create or replace view resumen_ciclo with (security_invoker = true) as
with tot as (
  select
    ciclo,
    coalesce(sum(monto_ars) filter (where tipo = 'Ingreso'), 0) as ingresos,
    coalesce(sum(monto_ars) filter (where tipo = 'Gasto' and fijo_variable = 'Fijo'), 0) as gastos_fijos,
    coalesce(sum(monto_ars) filter (where tipo = 'Gasto' and fijo_variable = 'Variable'), 0) as gastos_variables
  from movimientos_por_ciclo
  group by ciclo
),
pres as (
  select ciclo, sum(monto) as presupuesto_categorias
  from presupuestos group by ciclo
)
select
  c.nombre as ciclo,
  c.fecha_inicio,
  c.fecha_fin,
  c.en_curso,
  c.cotizacion,
  coalesce(t.ingresos, 0)                                   as ingresos,
  coalesce(t.gastos_fijos, 0)                               as gastos_fijos,
  coalesce(t.gastos_variables, 0)                           as gastos_variables,
  coalesce(t.gastos_fijos, 0) + coalesce(t.gastos_variables, 0) as gastado,
  coalesce(t.ingresos, 0) - coalesce(t.gastos_fijos, 0) - coalesce(t.gastos_variables, 0) as me_queda,
  p.presupuesto_categorias,
  coalesce(t.gastos_fijos, 0) + p.presupuesto_categorias    as presupuesto_si_o_si,
  coalesce(t.ingresos, 0) - (coalesce(t.gastos_fijos, 0) + p.presupuesto_categorias) as libre_para_gastar
from ciclos_con_fin c
left join tot  t on t.ciclo = c.nombre
left join pres p on p.ciclo = c.nombre;


-- ---------------------------------------------------------------------
-- 4. Las 8 categorías por ciclo (tu grupo 3)
--    Gastado = solo VARIABLES de esa categoría: los fijos ya están en el
--    sí o sí y no se cuentan dos veces.
--    Estado: si no hay gastos o no hay presupuesto, dice "Sin datos",
--    nunca "Vengo bien".
-- ---------------------------------------------------------------------

create or replace view categorias_ciclo with (security_invoker = true) as
select
  c.nombre    as ciclo,
  cat.nombre  as categoria,
  p.monto     as presupuesto,
  coalesce(g.gastado, 0) as gastado,
  coalesce(g.gastado, 0) / nullif(p.monto, 0) as porcentaje,
  case
    when p.monto is null or coalesce(g.gastado, 0) = 0 then 'Sin datos'
    when coalesce(g.gastado, 0) <= p.monto then 'Vengo bien'
    else 'Me pasé'
  end as estado
from ciclos_con_fin c
cross join categorias cat
left join presupuestos p on p.ciclo = c.nombre and p.categoria = cat.nombre
left join (
  select ciclo, categoria, sum(monto_ars) as gastado
  from movimientos_por_ciclo
  where tipo = 'Gasto' and fijo_variable = 'Variable'
  group by ciclo, categoria
) g on g.ciclo = c.nombre and g.categoria = cat.nombre
where cat.tiene_presupuesto;


-- ---------------------------------------------------------------------
-- 5. Pozo semanal (tu grupo 4)
--    Límite = libre para gastar ÷ 5 (igual todas las semanas).
--    Gastado = variables de las categorías SIN presupuesto propio.
--    Semáforo: verde < 75 %, amarillo 75–100 %, rojo > 100 %.
--    No tiene fila de total, a propósito.
-- ---------------------------------------------------------------------

create or replace view semanal with (security_invoker = true) as
select
  r.ciclo,
  s.semana,
  r.libre_para_gastar / 5 as limite,
  coalesce(g.gastado, 0) as gastado,
  r.libre_para_gastar / 5 - coalesce(g.gastado, 0) as disponible,
  coalesce(g.gastado, 0) / nullif(r.libre_para_gastar / 5, 0) as porcentaje,
  case
    when r.libre_para_gastar is null then 'Sin datos'
    when r.libre_para_gastar <= 0 then 'Rojo'
    when coalesce(g.gastado, 0) / (r.libre_para_gastar / 5) < 0.75 then 'Verde'
    when coalesce(g.gastado, 0) / (r.libre_para_gastar / 5) <= 1 then 'Amarillo'
    else 'Rojo'
  end as semaforo
from resumen_ciclo r
cross join generate_series(1, 5) as s(semana)
left join (
  select ciclo, semana, sum(monto_ars) as gastado
  from movimientos_por_ciclo
  where tipo = 'Gasto' and fijo_variable = 'Variable' and not tiene_presupuesto
  group by ciclo, semana
) g on g.ciclo = r.ciclo and g.semana = s.semana;


-- ---------------------------------------------------------------------
-- 6. Cuotas vigentes (tu consulta Cuotas)
--    Sale de la tabla movimientos original, NO de la expandida por ciclo,
--    así cada cuota aparece una sola vez (adiós celu mamá × 3).
--    meses_restantes cuenta desde este mes (o desde que arranca, si todavía
--    no empezó) hasta el mes del último pago, los dos incluidos.
--    Las cuotas en dólares se pasan a pesos con la cotización del ciclo en curso.
-- ---------------------------------------------------------------------

create or replace view cuotas_vigentes with (security_invoker = true) as
with actual as (
  select cotizacion from ciclos_con_fin where en_curso
),
base as (
  select
    m.id, m.detalle, m.categoria, m.divisa, m.fecha_inicio, m.fecha_fin,
    coalesce((select x.monto from cambios_monto x
              where x.movimiento_id = m.id and x.desde <= hoy()
              order by x.desde desc limit 1), m.monto) as monto,
    greatest(m.fecha_inicio, hoy()) as desde
  from movimientos m
  where m.modalidad = 'Cuota' and m.fecha_fin >= hoy()
)
select
  b.id, b.detalle, b.categoria, b.divisa, b.monto, b.fecha_inicio, b.fecha_fin,
  b.monto * case when b.divisa = 'USD' then (select cotizacion from actual) else 1 end as monto_ars,
  (extract(year from b.fecha_fin) * 12 + extract(month from b.fecha_fin))
  - (extract(year from b.desde) * 12 + extract(month from b.desde)) + 1 as meses_restantes,
  b.monto * case when b.divisa = 'USD' then (select cotizacion from actual) else 1 end
  * ((extract(year from b.fecha_fin) * 12 + extract(month from b.fecha_fin))
     - (extract(year from b.desde) * 12 + extract(month from b.desde)) + 1) as total_restante
from base b;


-- ---------------------------------------------------------------------
-- 7. Proyección de cuotas (tu consulta Proyección Cuotas)
--    Una fila por cuota y por mes que le queda.
-- ---------------------------------------------------------------------

create or replace view proyeccion_cuotas with (security_invoker = true) as
select
  (date_trunc('month', greatest(q.fecha_inicio, hoy())) + make_interval(months => n))::date as mes,
  q.detalle,
  q.categoria,
  q.monto_ars
from cuotas_vigentes q
cross join lateral generate_series(0, q.meses_restantes::int - 1) as n;


-- ---------------------------------------------------------------------
-- 8. Resumen de cuotas y margen para cuotas nuevas (tu grupo 5)
--    margen = libre para gastar del ciclo en curso × el % de ajustes (20 %).
--    Semáforo: rojo si el margen es ≤ 0, amarillo hasta el corte de
--    ajustes (50.000), verde arriba de eso.
-- ---------------------------------------------------------------------

create or replace view resumen_cuotas with (security_invoker = true) as
with a as (
  select
    (select valor from ajustes where clave = 'margen_cuotas_pct') as pct,
    (select valor from ajustes where clave = 'semaforo_cuotas_amarillo') as corte
),
m as (
  select r.libre_para_gastar * a.pct as margen, a.corte
  from resumen_ciclo r, a
  where r.en_curso
)
select
  (select coalesce(sum(total_restante), 0) from cuotas_vigentes) as total_comprometido,
  (select coalesce(sum(monto_ars), 0) from proyeccion_cuotas
    where mes = date_trunc('month', hoy())::date) as cuota_este_mes,
  m.margen,
  case
    when m.margen is null then 'Sin datos'
    when m.margen <= 0 then 'Rojo'
    when m.margen <= m.corte then 'Amarillo'
    else 'Verde'
  end as semaforo
from m;


-- ---------------------------------------------------------------------
-- 9. Gastos por categoría (para la página de Análisis)
--    Fijos, variables y total por categoría y ciclo.
-- ---------------------------------------------------------------------

create or replace view gastos_por_categoria with (security_invoker = true) as
select
  ciclo,
  categoria,
  coalesce(sum(monto_ars) filter (where fijo_variable = 'Fijo'), 0)     as fijos,
  coalesce(sum(monto_ars) filter (where fijo_variable = 'Variable'), 0) as variables,
  sum(monto_ars) as total
from movimientos_por_ciclo
where tipo = 'Gasto'
group by ciclo, categoria;


-- ---------------------------------------------------------------------
-- 10. Último registro (tu grupo 6)
--     Por marca temporal (cuándo lo cargaste), sin importar el ciclo.
-- ---------------------------------------------------------------------

create or replace view ultimo_registro with (security_invoker = true) as
select detalle, monto, divisa, marca_temporal
from movimientos
order by marca_temporal desc, id desc
limit 1;
