-- =====================================================================
-- Versión 2, ronda 2: cambios de monto de los fijos
-- Un cambio de monto ahora se aplica a los ciclos que EMPIEZAN en su
-- fecha "desde" o después. Así la app puede guardar un monto nuevo
-- "desde el próximo ciclo" sin tocar el ciclo en curso ni los viejos.
-- Solo cambia una línea de la vista movimientos_por_ciclo (paso 3).
-- Se puede correr más de una vez sin problema.
-- =====================================================================

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
  -- el último cambio de monto que ya regía cuando empezó el ciclo
  -- (un cambio "desde el próximo ciclo" no toca el ciclo en curso)
  select x.monto from cambios_monto x
  where x.movimiento_id = m.id and x.desde <= c.fecha_inicio
  order by x.desde desc
  limit 1
) cm on true;

-- Verificar: tiene que devolver 0 (todavía no hay cambios de monto cargados)
select count(*) as cambios_cargados from cambios_monto;
