// =====================================================================
// Pantalla de inicio (paso 6)
// Muestra lo que ya calculan las vistas del paso 3: no hace cuentas.
//   resumen_ciclo     → las tarjetas de arriba
//   categorias_ciclo  → las 8 categorías con presupuesto
//   ultimo_registro   → lo último que cargaste
// =====================================================================

let resumenes = [];       // resumen_ciclo, del más nuevo al más viejo
let cicloInicio = null;   // el ciclo elegido; al entrar, el que está en curso

function mensajeInicio(texto) {
  $("inicio-mensaje").textContent = texto;
  $("inicio-mensaje").hidden = !texto;
}

// Pone un número en una tarjeta. Sin dato → "Sin presupuesto" en gris.
function ponerNumero(id, valor, textoSinDato) {
  const el = $(id);
  if (valor === null || valor === undefined) {
    el.textContent = textoSinDato;
    el.className = "sin-datos";
    return;
  }
  el.textContent = formatearPesos(Number(valor));
  el.className = Number(valor) < -0.5 ? "negativo" : "";
}

async function abrirInicio() {
  mensajeInicio("");
  const [r, u] = await Promise.all([
    db.from("resumen_ciclo").select("*").order("fecha_inicio", { ascending: false }),
    db.from("ultimo_registro").select("*"),
  ]);
  if (r.error) return mensajeInicio("No pude leer los ciclos. ¿Corriste el paso 4 en Supabase?");
  resumenes = r.data;

  if (!resumenes.length) {
    $("inicio-ciclo").innerHTML = '<option value="">Sin ciclos</option>';
    return mensajeInicio("Todavía no hay ciclos. Cargá uno en la pantalla Ciclo.");
  }
  if (!resumenes.some((x) => x.ciclo === cicloInicio)) {
    cicloInicio = (resumenes.find((x) => x.en_curso) || resumenes[0]).ciclo;
  }
  $("inicio-ciclo").innerHTML = resumenes
    .map((x) => `<option value="${escapar(x.ciclo)}">${escapar(x.ciclo)}${x.en_curso ? " (en curso)" : ""}</option>`)
    .join("");
  $("inicio-ciclo").value = cicloInicio;

  mostrarUltimo(u);
  mostrarCiclo();
}

$("inicio-ciclo").addEventListener("change", () => {
  cicloInicio = $("inicio-ciclo").value;
  mostrarCiclo();
});

async function mostrarCiclo() {
  const x = resumenes.find((r) => r.ciclo === cicloInicio);
  if (!x) return;

  $("inicio-fechas").textContent = x.fecha_fin
    ? `Del ${fechaCorta(x.fecha_inicio)} al ${fechaCorta(x.fecha_fin)}`
    : `Desde el ${fechaCorta(x.fecha_inicio)}, hasta que cobres de nuevo`;

  ponerNumero("n-ingresos", x.ingresos);
  ponerNumero("n-gastado", x.gastado);
  ponerNumero("n-si-o-si", x.presupuesto_si_o_si, "Sin presupuesto");
  ponerNumero("n-libre", x.libre_para_gastar, "Sin presupuesto");
  ponerNumero("n-me-queda", x.me_queda);
  if (Number(x.ingresos) === 0) mensajeInicio("Todavía no hay ingresos cargados en este ciclo.");
  else mensajeInicio("");

  const ul = $("lista-categorias");
  const { data, error } = await db.from("categorias_ciclo").select("*").eq("ciclo", cicloInicio).order("categoria");
  if (cicloInicio !== x.ciclo) return; // cambiaste de ciclo mientras cargaba
  if (error) {
    ul.innerHTML = '<li class="vacio">No pude leer las categorías.</li>';
    return;
  }
  if (!data.length) {
    ul.innerHTML = '<li class="vacio">Sin datos.</li>';
    return;
  }
  ul.innerHTML = data.map(filaCategoria).join("");
}

function filaCategoria(c) {
  const gastado = Number(c.gastado);
  const tienePres = c.presupuesto !== null && c.presupuesto !== undefined;
  const pct = c.porcentaje === null || c.porcentaje === undefined ? null : Math.round(Number(c.porcentaje) * 100);
  const clase = c.estado === "Vengo bien" ? "bien" : c.estado === "Me pasé" ? "paso" : "sin-datos";
  const detalle = tienePres
    ? `${formatearPesos(gastado)} de ${formatearPesos(Number(c.presupuesto))}`
    : `${formatearPesos(gastado)} · sin presupuesto`;
  const barra = pct === null ? "" : `
      <div class="barra-uso"><div class="${clase === "paso" ? "paso" : ""}" style="width:${Math.min(pct, 100)}%"></div></div>`;
  return `
    <li>
      <div class="fila">
        <span>${escapar(c.categoria)}</span>
        <span class="estado ${clase}">${escapar(c.estado)}</span>
      </div>
      <div class="detalle">
        <span>${detalle}</span>
        <span>${pct === null ? "" : pct + " %"}</span>
      </div>${barra}
    </li>`;
}

function mostrarUltimo(u) {
  const p = $("ultimo-registro");
  if (u.error) return (p.textContent = "No pude leerlo.");
  const m = u.data[0];
  if (!m) return (p.textContent = "Sin datos todavía.");
  // "16/09 a las 00:00", en hora de Argentina
  let cuando = "";
  if (m.marca_temporal) {
    const partes = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(m.marca_temporal)).map((x) => [x.type, x.value]));
    cuando = `Cargado el ${partes.day}/${partes.month} a las ${partes.hour}:${partes.minute}`;
  }
  p.innerHTML = `<strong>${escapar(m.detalle)}</strong> · ${formatearMonto(Number(m.monto), m.divisa)}
    <small>${cuando}</small>`;
}
