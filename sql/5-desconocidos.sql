-- =====================================================================
-- Versión 2, ronda 1: categoría "Desconocidos"
-- Para anotar todo, aunque no sepas en qué se fue. Si en un ciclo hay
-- mucho acá, es la alerta de que falta anotar mejor.
-- No tiene presupuesto propio: sale del pozo semanal.
-- Se puede correr más de una vez sin problema.
-- =====================================================================

insert into categorias (nombre, tiene_presupuesto, activa)
values ('Desconocidos', false, true)
on conflict (nombre) do update set activa = true;

-- Verificar: tiene que aparecer una fila "Desconocidos | false | true"
select nombre, tiene_presupuesto, activa from categorias where nombre = 'Desconocidos';
