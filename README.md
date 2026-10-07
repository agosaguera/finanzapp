# Finanzapp

App personal de finanzas para usar desde el celu. Reemplaza a Google Forms + Google Sheets + Power BI.

## Cómo está armada

| Pieza | Qué hace |
|---|---|
| **Supabase** | Guarda los datos (movimientos, ciclos, presupuesto) y hace todas las cuentas con vistas SQL. Tiene el login. |
| **Esta página** (`index.html`, `app.js`, …) | Muestra las pantallas y carga movimientos. No hace cuentas: lee las vistas. |
| **GitHub Pages** | Publica esta carpeta como página web. |

## Archivos

- `index.html`: las pantallas (login, carga y ciclo) y el menú de abajo.
- `app.js`: login, menú y carga de movimientos.
- `ciclo.js`: pantalla de ciclo: ciclo nuevo cuando cobrás y corrección de cotización o presupuesto.
- `montos.js`: lee los montos escritos a mano (6,99 · 1.500 · 45.000,50) sin confundir decimales con miles.
- `estilos.css`: colores y tamaños, con modo oscuro.
- `config.js`: dirección de Supabase y clave publishable (pública a propósito; los datos se protegen con login + RLS).
- `sql/`: lo que se corrió en Supabase, en orden. `3-cuentas.sql` tiene todas las reglas de cálculo.

## Reglas importantes

- El "mes" es un **ciclo**: de un cobro al siguiente. Solo se carga el día de cobro.
- Un **fijo** es Cuota (con fecha del último pago) o Recurrente (se repite hasta que se da de baja).
- Todo se pasa a pesos con la cotización **del ciclo** de cada movimiento.
