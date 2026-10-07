-- =====================================================================
-- Paso 3: verificación
-- Corré cada consulta por separado (seleccionala y tocá Run).
-- Los números esperados salen de tus datos importados en el paso 2.
-- =====================================================================

-- 1. Resumen de cada ciclo (lo que van a mostrar las tarjetas de Inicio)
select ciclo,
       round(ingresos)            as ingresos,
       round(presupuesto_si_o_si) as si_o_si,
       round(gastado)             as gastado,
       round(libre_para_gastar)   as libre,
       round(me_queda)            as me_queda
from resumen_ciclo order by fecha_inicio;
-- Esperado:
--   Ciclo Julio      | 2995500 | 2366321 | 3012878 | 629179 |  -17378
--   Ciclo Agosto     | 2995500 | 2328254 | 3290675 | 667246 | -295175
--   Ciclo Septiembre | 3135290 | 2341696 | 1761696 | 793594 | 1373594


-- 2. Apple se pasa a pesos con la cotización de CADA ciclo
select ciclo, monto, monto_ars from movimientos_por_ciclo where detalle = 'Apple';
-- Esperado: Julio y Agosto 10485 (6,99 × 1.500), Septiembre 10974,30 (6,99 × 1.570)


-- 3. Cuotas: celu mamá aparece UNA vez, con 2 meses restantes
select detalle, monto_ars, meses_restantes, total_restante
from cuotas_vigentes order by detalle;
-- Esperado: 8 cuotas. celu mamá | 45000 | 2 | 90000


-- 4. Las 8 categorías de Agosto
select categoria, presupuesto, round(gastado) as gastado,
       round(porcentaje * 100) as pct, estado
from categorias_ciclo where ciclo = 'Ciclo Agosto' order by categoria;
-- Esperado: Belleza e Higiene 11176 de 30000 (37 %, Vengo bien); el resto, Me pasé.


-- 5. Septiembre todavía no tiene gastos variables: tiene que decir "Sin datos"
select categoria, estado from categorias_ciclo where ciclo = 'Ciclo Septiembre';
-- Esperado: las 8 con "Sin datos" (nunca "Vengo bien")


-- 6. Pozo semanal de Agosto
select semana, round(limite) as limite, round(gastado) as gastado,
       round(porcentaje * 100) as pct, semaforo
from semanal where ciclo = 'Ciclo Agosto' order by semana;
-- Esperado: límite 133449 todas las semanas; semana 1 gastó 269200 (Rojo),
-- semana 2 233000 (Rojo), semana 3 800 (Verde), semanas 4 y 5 en 0 (Verde)


-- 7. Margen para cuotas nuevas
select round(total_comprometido) as comprometido, round(cuota_este_mes) as este_mes,
       round(margen) as margen, semaforo
from resumen_cuotas;
-- Esperado (en octubre de 2026): 1669621 | 362770 | 158719 | Verde
