-- =====================================================================
-- Paso 1: las tablas de la app de finanzas
-- Se pega entero en Supabase → SQL Editor → New query → Run.
-- Se corre UNA sola vez. Si lo corrés dos veces, la segunda da error
-- porque las tablas ya existen (no rompe nada).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Listas que se eligen, no se escriben
--    Categorías y métodos de pago viven en su propia tabla. Movimientos
--    solo puede usar valores que estén acá: así "Salud " o "salud" no
--    pueden aparecer como categorías nuevas por accidente.
-- ---------------------------------------------------------------------

create table categorias (
  nombre            text primary key,
  tiene_presupuesto boolean not null default false,  -- las 8 con presupuesto propio
  activa            boolean not null default true,   -- para ocultar una sin borrar su historial
  constraint categorias_sin_espacios check (nombre = btrim(nombre) and nombre <> '')
);

create table metodos_pago (
  nombre text primary key,
  activo boolean not null default true,
  constraint metodos_sin_espacios check (nombre = btrim(nombre) and nombre <> '')
);

-- Las 8 categorías con presupuesto propio, más dos que usa tu documentación.
-- El resto llega con tu historial en el paso 2.
insert into categorias (nombre, tiene_presupuesto) values
  ('Super Comida', true), ('Salud', true), ('Salidas', true),
  ('Belleza e Higiene', true), ('Uber', true), ('Sube', true),
  ('Regalos', true), ('Pablo', true),
  ('Servicios', false), ('Alquiler', false);


-- ---------------------------------------------------------------------
-- 2. Ciclos
--    Solo guardás el día que cobrás y la cotización de ese ciclo.
--    El fin NO se guarda: lo calcula la vista ciclos_con_fin (más abajo)
--    como el día anterior al próximo cobro.
--    La cotización va acá porque es una por ciclo (tu relación 1 a 1).
-- ---------------------------------------------------------------------

create table ciclos (
  nombre       text primary key,                 -- "Ciclo Octubre"
  fecha_inicio date not null unique,             -- el día que cobraste (día 1 del ciclo)
  cotizacion   numeric(12,2) not null check (cotizacion > 0),  -- dólar blue Takenos
  constraint ciclos_nombre_sin_espacios check (nombre = btrim(nombre) and nombre <> '')
);


-- ---------------------------------------------------------------------
-- 3. Presupuesto: un monto por categoría y por ciclo
--    Solo se aceptan categorías marcadas con tiene_presupuesto
--    (lo controla el trigger de la sección 6).
-- ---------------------------------------------------------------------

create table presupuestos (
  ciclo     text not null references ciclos(nombre) on update cascade on delete cascade,
  categoria text not null references categorias(nombre) on update cascade,
  monto     numeric(14,2) not null check (monto >= 0),
  primary key (ciclo, categoria)                 -- una sola fila por categoría y ciclo
);


-- ---------------------------------------------------------------------
-- 4. Movimientos: cada gasto o ingreso
--    numeric(14,2) = número con 2 decimales exactos. 6.99 se guarda 6.99,
--    nunca 699: la base no adivina separadores, recibe un número.
-- ---------------------------------------------------------------------

create table movimientos (
  id             bigint generated always as identity primary key,
  marca_temporal timestamptz not null default now(),   -- cuándo lo cargaste
  detalle        text not null,
  categoria      text not null references categorias(nombre) on update cascade,
  tipo           text not null check (tipo in ('Gasto', 'Ingreso')),
  fijo_variable  text not null check (fijo_variable in ('Fijo', 'Variable')),
  metodo_pago    text references metodos_pago(nombre) on update cascade,  -- puede quedar vacío
  monto          numeric(14,2) not null check (monto > 0),
  divisa         text not null check (divisa in ('ARS', 'USD')),
  fecha_inicio   date not null,
  modalidad      text check (modalidad in ('Cuota', 'Recurrente')),
                             -- Solo para fijos. La elegís vos:
                             --   Cuota: lleva fecha de fin sí o sí
                             --   Recurrente: se repite (suscripción, seguro); fecha de fin
                             --   opcional, solo si la das de baja
  fecha_fin      date,       -- Variable: igual a fecha_inicio (se completa sola)
                             -- Fijo: la fecha del ÚLTIMO PAGO
  esencial       boolean not null default false,
  constraint detalle_no_vacio check (detalle <> ''),
  constraint fin_despues_de_inicio check (fecha_fin is null or fecha_fin >= fecha_inicio),
  constraint variable_dura_un_dia check (fijo_variable = 'Fijo' or fecha_fin = fecha_inicio),
  constraint modalidad_coherente check (
    (fijo_variable = 'Variable' and modalidad is null) or
    (fijo_variable = 'Fijo' and modalidad = 'Recurrente') or
    (fijo_variable = 'Fijo' and modalidad = 'Cuota' and fecha_fin is not null)
  )
);


-- ---------------------------------------------------------------------
-- 5. Cambios de monto de un fijo (tu respuesta a la pregunta 5)
--    Si Netflix pasa de 8 a 10 USD, no se edita el movimiento: se agrega
--    una fila acá con "desde cuándo" vale 10. Los ciclos anteriores
--    siguen viendo 8. Esta tabla también va a servir para medir la
--    inflación de tus gastos fijos más adelante.
-- ---------------------------------------------------------------------

create table cambios_monto (
  movimiento_id bigint not null references movimientos(id) on delete cascade,
  desde         date not null,
  monto         numeric(14,2) not null check (monto > 0),
  primary key (movimiento_id, desde)
);


-- ---------------------------------------------------------------------
-- 6. Ajustes: valores que querés cambiar sin tocar código
-- ---------------------------------------------------------------------

create table ajustes (
  clave       text primary key,
  valor       numeric not null,
  descripcion text
);

insert into ajustes (clave, valor, descripcion) values
  ('margen_cuotas_pct', 0.20, 'Parte del libre para gastar del ciclo en curso que puede ir a cuotas nuevas'),
  ('semaforo_cuotas_amarillo', 50000, 'Hasta este margen (en ARS) el semáforo de cuotas queda amarillo');


-- ---------------------------------------------------------------------
-- 7. Limpieza automática al guardar (los "triggers")
--    Un trigger es una función que la base corre sola antes de guardar
--    cada fila. Acá arregla lo que ya te hizo lío en Power BI.
-- ---------------------------------------------------------------------

-- Saca espacios del principio y del final, incluidos los invisibles
-- (el espacio "duro" que a veces se pega desde el celu).
create function limpiar_texto(t text) returns text
language sql immutable as $$
  select regexp_replace(t, '^[\s ​]+|[\s ​]+$', '', 'g')
$$;

create function normalizar_movimiento() returns trigger
language plpgsql as $$
begin
  new.detalle       := limpiar_texto(new.detalle);
  new.categoria     := limpiar_texto(new.categoria);
  new.metodo_pago   := nullif(limpiar_texto(new.metodo_pago), '');
  new.tipo          := initcap(limpiar_texto(new.tipo));           -- "ingreso " → "Ingreso"
  new.fijo_variable := initcap(limpiar_texto(new.fijo_variable));  -- "fijo" → "Fijo"
  new.divisa        := upper(limpiar_texto(new.divisa));           -- "usd" → "USD"
  new.modalidad     := nullif(initcap(limpiar_texto(new.modalidad)), '');  -- "cuota" → "Cuota"
  if new.fijo_variable = 'Variable' then
    new.fecha_fin := new.fecha_inicio;                             -- un variable dura un día
    new.modalidad := null;                                         -- y no es cuota ni recurrente
  end if;
  return new;
end $$;

create trigger movimientos_normalizar
  before insert or update on movimientos
  for each row execute function normalizar_movimiento();

create function normalizar_nombre() returns trigger
language plpgsql as $$
begin
  new.nombre := limpiar_texto(new.nombre);
  return new;
end $$;

create trigger categorias_normalizar before insert or update on categorias
  for each row execute function normalizar_nombre();
create trigger metodos_normalizar before insert or update on metodos_pago
  for each row execute function normalizar_nombre();
create trigger ciclos_normalizar before insert or update on ciclos
  for each row execute function normalizar_nombre();

-- El presupuesto solo acepta las categorías con presupuesto propio.
create function validar_presupuesto() returns trigger
language plpgsql as $$
begin
  new.categoria := limpiar_texto(new.categoria);
  if not exists (select 1 from categorias where nombre = new.categoria and tiene_presupuesto) then
    raise exception 'La categoría "%" no tiene presupuesto propio', new.categoria;
  end if;
  return new;
end $$;

create trigger presupuestos_validar before insert or update on presupuestos
  for each row execute function validar_presupuesto();


-- ---------------------------------------------------------------------
-- 8. Vista: ciclos con su fecha de fin calculada
--    Una vista es una consulta guardada con nombre: se usa como una
--    tabla, pero se recalcula cada vez que la mirás.
--    lead() mira la fila siguiente (el próximo cobro). El ciclo en curso
--    no tiene siguiente, así que su fecha_fin queda vacía.
-- ---------------------------------------------------------------------

create view ciclos_con_fin with (security_invoker = true) as
select
  nombre,
  fecha_inicio,
  (lead(fecha_inicio) over (order by fecha_inicio) - 1) as fecha_fin,
  cotizacion,
  lead(fecha_inicio) over (order by fecha_inicio) is null as en_curso
from ciclos;


-- ---------------------------------------------------------------------
-- 9. Seguridad: solo vos, con tu usuario, podés leer y escribir
--    RLS (Row Level Security) bloquea todas las tablas por defecto.
--    Las políticas abren el acceso solo a usuarios con sesión iniciada
--    ("authenticated"). Como desactivás el registro de usuarios nuevos
--    en el paso 0, el único usuario posible sos vos.
-- ---------------------------------------------------------------------

alter table categorias    enable row level security;
alter table metodos_pago  enable row level security;
alter table ciclos        enable row level security;
alter table presupuestos  enable row level security;
alter table movimientos   enable row level security;
alter table cambios_monto enable row level security;
alter table ajustes       enable row level security;

create policy "solo con sesion" on categorias    for all to authenticated using (true) with check (true);
create policy "solo con sesion" on metodos_pago  for all to authenticated using (true) with check (true);
create policy "solo con sesion" on ciclos        for all to authenticated using (true) with check (true);
create policy "solo con sesion" on presupuestos  for all to authenticated using (true) with check (true);
create policy "solo con sesion" on movimientos   for all to authenticated using (true) with check (true);
create policy "solo con sesion" on cambios_monto for all to authenticated using (true) with check (true);
create policy "solo con sesion" on ajustes       for all to authenticated using (true) with check (true);
