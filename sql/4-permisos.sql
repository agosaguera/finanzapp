-- =====================================================================
-- Paso 4: permisos para que la app pueda leer y cargar
-- Las reglas de seguridad (RLS) del paso 1 ya dicen QUIÉN puede entrar
-- (solo vos, con sesión iniciada). Esto asegura que, una vez adentro,
-- la app pueda usar las tablas y las vistas. Se puede correr dos veces.
-- =====================================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function hoy() to authenticated;

-- Control: tiene que mostrar "true" en las tres columnas.
select has_table_privilege('authenticated', 'movimientos', 'insert') as puede_cargar,
       has_table_privilege('authenticated', 'resumen_ciclo', 'select') as puede_ver_resumen,
       has_table_privilege('authenticated', 'categorias', 'select') as puede_ver_categorias;
