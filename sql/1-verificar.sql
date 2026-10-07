-- =====================================================================
-- Paso 1: verificación
-- Corré cada bloque por separado (seleccionalo y tocá Run).
-- Al final hay un bloque que borra todos los datos de prueba.
-- =====================================================================

-- Prueba 1: decimales. Cargamos Apple con 6.99 USD.
insert into ciclos (nombre, fecha_inicio, cotizacion) values ('Prueba Sep', '2026-09-15', 1500);
insert into movimientos (detalle, categoria, tipo, fijo_variable, modalidad, monto, divisa, fecha_inicio)
values ('Apple', 'Servicios', 'Gasto', 'Fijo', 'Recurrente', 6.99, 'USD', '2026-09-20');
select detalle, monto, divisa from movimientos where detalle = 'Apple';
-- Esperado: Apple | 6.99 | USD


-- Prueba 2: espacios invisibles y mayúsculas.
-- Todo viene "sucio" a propósito: espacios, minúsculas, "ingreso " con espacio.
insert into movimientos (detalle, categoria, tipo, fijo_variable, monto, divisa, fecha_inicio)
values ('  Sueldo  ', 'Servicios ', 'ingreso ', 'variable', 1000, ' usd', '2026-09-15');
select '[' || detalle || ']' as detalle, tipo, fijo_variable, divisa, fecha_inicio, fecha_fin
from movimientos where detalle = 'Sueldo';
-- Esperado: [Sueldo] | Ingreso | Variable | USD | 2026-09-15 | 2026-09-15
-- (los corchetes muestran que no quedó ningún espacio; la fecha fin se completó sola)


-- Prueba 3: un error a propósito. Tipo que no existe.
insert into movimientos (detalle, categoria, tipo, fijo_variable, monto, divisa, fecha_inicio)
values ('Café', 'Servicios', 'Gastito', 'Variable', 2500, 'ARS', '2026-09-20');
-- Esperado: ERROR ... violates check constraint "movimientos_tipo_check"


-- Prueba 4: el fin del ciclo se calcula solo.
insert into ciclos (nombre, fecha_inicio, cotizacion) values ('Prueba Oct', '2026-10-16', 1550);
select nombre, fecha_inicio, fecha_fin, en_curso from ciclos_con_fin order by fecha_inicio;
-- Esperado:
--   Prueba Sep | 2026-09-15 | 2026-10-15 | false
--   Prueba Oct | 2026-10-16 | (vacío)    | true


-- Prueba 5: presupuesto solo para las 8 categorías.
insert into presupuestos (ciclo, categoria, monto) values ('Prueba Sep', 'Salud', 80000);   -- anda
insert into presupuestos (ciclo, categoria, monto) values ('Prueba Sep', 'Alquiler', 1);    -- da error
-- Esperado en la segunda: ERROR: La categoría "Alquiler" no tiene presupuesto propio


-- Limpieza: borra todo lo de prueba (los presupuestos se borran con su ciclo).
delete from movimientos where detalle in ('Apple', 'Sueldo');
delete from ciclos where nombre in ('Prueba Sep', 'Prueba Oct');
select (select count(*) from movimientos) as movimientos, (select count(*) from ciclos) as ciclos;
-- Esperado: 0 | 0
