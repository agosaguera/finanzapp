-- =====================================================================
-- Versión 2, ronda 3: emojis en las categorías
-- Agrega la columna "emoji" y le pone uno a cada categoría conocida.
-- Solo completa las que no tienen emoji: si ya elegiste uno en la app,
-- no lo pisa. Después los cambiás desde Ciclo → Categorías.
-- Se puede correr más de una vez sin problema.
-- =====================================================================

alter table categorias add column if not exists emoji text;

update categorias c set emoji = e.emoji
from (values
  ('Super Comida', '🛒'), ('Salud', '🩺'), ('Salidas', '🍻'),
  ('Belleza e Higiene', '🧴'), ('Uber', '🚕'), ('Sube', '🚌'),
  ('Regalos', '🎁'), ('Pablo', '🐈'), ('Servicios', '💡'),
  ('Alquiler', '🏠'), ('Extras', '✨'), ('Ingreso', '💰'),
  ('Desconocidos', '❓'), ('Hogar', '🛋️'), ('Ropa', '👕'),
  ('Educación', '📚'), ('Suscripciones', '📺'), ('Transporte', '🚗')
) as e(nombre, emoji)
where c.nombre = e.nombre and c.emoji is null;

-- Verificar: tus categorías con su emoji (las que queden vacías, las completás en la app)
select nombre, emoji, tiene_presupuesto, activa from categorias order by nombre;
