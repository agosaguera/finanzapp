-- =====================================================================
-- Paso 2a: agrega "Cuota o Recurrente" a los movimientos
-- Corrélo una vez, ANTES de importar el historial.
-- Si tu tabla ya lo tenía, no cambia nada (se puede correr dos veces).
-- =====================================================================

-- La columna nueva: solo para fijos, la elegís vos al cargar.
alter table movimientos
  add column if not exists modalidad text check (modalidad in ('Cuota', 'Recurrente'));

-- La regla que une todo:
--   Variable   → sin modalidad
--   Recurrente → fecha de fin opcional (solo si lo das de baja)
--   Cuota      → fecha de fin obligatoria (el último pago)
alter table movimientos drop constraint if exists modalidad_coherente;
alter table movimientos add constraint modalidad_coherente check (
  (fijo_variable = 'Variable' and modalidad is null) or
  (fijo_variable = 'Fijo' and modalidad = 'Recurrente') or
  (fijo_variable = 'Fijo' and modalidad = 'Cuota' and fecha_fin is not null)
);

-- La limpieza automática ahora también ordena la modalidad.
create or replace function normalizar_movimiento() returns trigger
language plpgsql as $$
begin
  new.detalle       := limpiar_texto(new.detalle);
  new.categoria     := limpiar_texto(new.categoria);
  new.metodo_pago   := nullif(limpiar_texto(new.metodo_pago), '');
  new.tipo          := initcap(limpiar_texto(new.tipo));
  new.fijo_variable := initcap(limpiar_texto(new.fijo_variable));
  new.divisa        := upper(limpiar_texto(new.divisa));
  new.modalidad     := nullif(initcap(limpiar_texto(new.modalidad)), '');
  if new.fijo_variable = 'Variable' then
    new.fecha_fin := new.fecha_inicio;
    new.modalidad := null;
  end if;
  return new;
end $$;

-- Control: tiene que mostrar una fila con "modalidad".
select column_name from information_schema.columns
where table_name = 'movimientos' and column_name = 'modalidad';
