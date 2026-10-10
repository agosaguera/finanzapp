// =====================================================================
// Pantalla semanal (paso 7, versión 2): como las reservas de Mercado Pago
// Arriba, lo que queda de cada categoría con presupuesto (categorias_ciclo).
// Abajo, el pozo de cada semana (vista "semanal"): límite = restante del
// presupuesto ÷ 5; gastado = variables de las categorías sin presupuesto.
// Tocando una categoría o una semana ves en qué se fue esa plata.
// =====================================================================

const RANGOS = { 1: [1, 8], 2: [9, 15], 3: [16, 22], 4: [23, 30], 5: [31, null] };
let resumenesSemanal = []; // resumen_ciclo, del más nuevo al más viejo
let cicloSemanal = null;
let semanaElegida = null;
let categoriaElegida = null; // se elige una categoría O una semana, no las dos

function mensajeSemanal(texto) {
  $("semanal-mensaje").textContent = texto;
  $("semanal-mensaje").hidden = !texto;
}

// Suma días a "AAAA-MM-DD" sin líos de zona horaria
function sumarDias(iso, dias) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Las fechas reales de una semana: "16/09 al 23/09"
function fechasSemana(ciclo, semana) {
  const [desde, hasta] = RANGOS[semana];
  const ini = sumarDias(ciclo.fecha_inicio, desde - 1);
  const fin = hasta ? sumarDias(ciclo.fecha_inicio, hasta - 1) : ciclo.fecha_fin;
  if (ciclo.fecha_fin && ini > ciclo.fecha_fin) return "no llega";
  const finReal = fin && ciclo.fecha_fin && fin > ciclo.fecha_fin ? ciclo.fecha_fin : fin;
  if (!finReal) return `desde el ${fechaCorta(ini)}`;
  return finReal === ini ? fechaCorta(ini) : `${fechaCorta(ini)} al ${fechaCorta(finReal)}`;
}

// En qué semana estás hoy (solo para el ciclo en curso)
function semanaDeHoy(ciclo) {
  if (!ciclo.en_curso) return null;
  const dia = Math.round((new Date(hoy() + "T12:00:00Z") - new Date(ciclo.fecha_inicio + "T12:00:00Z")) / 86400000) + 1;
  if (dia < 1) return null;
  return dia <= 8 ? 1 : dia <= 15 ? 2 : dia <= 22 ? 3 : dia <= 30 ? 4 : 5;
}

async function abrirSemanal() {
  mensajeSemanal("");
  const { data, error } = await db.from("resumen_ciclo")
    .select("ciclo, fecha_inicio, fecha_fin, en_curso, libre_para_gastar")
    .order("fecha_inicio", { ascending: false });
  if (error) return mensajeSemanal("No pude leer los ciclos. ¿Corriste el paso 4 en Supabase?");
  resumenesSemanal = data;
  if (!data.length) return mensajeSemanal("Todavía no hay ciclos. Cargá uno en la pantalla Ciclo.");

  if (!data.some((x) => x.ciclo === cicloSemanal)) {
    cicloSemanal = (data.find((x) => x.en_curso) || data[0]).ciclo;
  }
  $("semanal-ciclo").innerHTML = data
    .map((x) => `<option value="${escapar(x.ciclo)}">${escapar(x.ciclo)}${x.en_curso ? " (en curso)" : ""}</option>`)
    .join("");
  $("semanal-ciclo").value = cicloSemanal;
  mostrarSemanas();
}

$("semanal-ciclo").addEventListener("change", () => {
  cicloSemanal = $("semanal-ciclo").value;
  mostrarSemanas();
});

async function mostrarSemanas() {
  const ciclo = resumenesSemanal.find((x) => x.ciclo === cicloSemanal);
  if (!ciclo) return;
  const libre = ciclo.libre_para_gastar;
  ponerNumero("n-libre-ciclo", libre, "Sin presupuesto");
  ponerNumero("n-por-semana", libre === null ? null : Number(libre) / 5, "Sin presupuesto");
  mensajeSemanal(libre === null ? "Este ciclo no tiene presupuesto cargado, así que no hay límite semanal." : "");

  const ul = $("lista-semanas");
  const [sem, cat] = await Promise.all([
    db.from("semanal").select("*").eq("ciclo", ciclo.ciclo).order("semana"),
    db.from("categorias_ciclo").select("*").eq("ciclo", ciclo.ciclo).order("categoria"),
  ]);
  if (cicloSemanal !== ciclo.ciclo) return; // cambiaste de ciclo mientras cargaba
  const actual = semanaDeHoy(ciclo);
  // Al entrar se abre la semana de hoy (o nada, en un ciclo cerrado)
  semanaElegida = actual;
  categoriaElegida = null;

  $("semanal-categorias").innerHTML = cat.error
    ? '<li class="vacio">No pude leer las categorías.</li>'
    : cat.data.length ? cat.data.map(filaReserva).join("") : '<li class="vacio">Sin datos.</li>';
  ul.innerHTML = sem.error
    ? '<li class="vacio">No pude leer las semanas.</li>'
    : sem.data.map((s) => filaSemana(s, ciclo, actual)).join("");
  mostrarGastosElegidos();
}

// Una categoría como reserva: cuánto te queda de lo que le asignaste
function filaReserva(c) {
  const gastado = Number(c.gastado);
  const tienePres = c.presupuesto !== null && c.presupuesto !== undefined;
  const queda = tienePres ? Number(c.presupuesto) - gastado : null;
  const pct = c.porcentaje === null || c.porcentaje === undefined ? null : Math.floor(Number(c.porcentaje) * 100);
  const clase = c.estado === "Vengo bien" ? "verde" : c.estado === "Me pasé" ? "rojo" : "sin-datos";
  const linea = !tienePres
    ? `Gastado ${formatearPesos(gastado)} · sin presupuesto`
    : queda < -0.5
      ? `Te pasaste ${formatearPesos(-queda)} (tenías ${formatearPesos(Number(c.presupuesto))})`
      : `Quedan ${formatearPesos(queda)} de ${formatearPesos(Number(c.presupuesto))}`;
  const barra = pct === null ? "" : `
      <div class="barra-uso"><div class="${clase}" style="width:${Math.min(Math.max(pct, 0), 100)}%"></div></div>`;
  return `
    <li class="${c.categoria === categoriaElegida ? "elegida" : ""}" data-categoria="${escapar(c.categoria)}" role="button" tabindex="0">
      <div class="fila">
        <span>${escapar(conEmoji(c.categoria))}</span>
        <span class="estado ${clase === "verde" ? "bien" : clase === "rojo" ? "paso" : "sin-datos"}">${escapar(c.estado)}</span>
      </div>
      <div class="detalle">
        <span>${linea}</span>
        <span>${pct === null ? "" : pct + " %"}</span>
      </div>${barra}
    </li>`;
}

function filaSemana(s, ciclo, actual) {
  const clase = { Verde: "verde", Amarillo: "amarillo", Rojo: "rojo" }[s.semaforo] || "sin-datos";
  const pct = s.porcentaje === null || s.porcentaje === undefined ? null : Math.floor(Number(s.porcentaje) * 100); // 74,9 % muestra 74, no 75 en verde
  const sinLimite = s.limite === null || s.limite === undefined;
  const detalle = sinLimite
    ? `Gastado ${formatearPesos(Number(s.gastado))}`
    : `${formatearPesos(Number(s.gastado))} de ${formatearPesos(Number(s.limite))}`;
  const queda = sinLimite ? "" : Number(s.disponible) < -0.5
    ? `Te pasaste ${formatearPesos(-Number(s.disponible))}`
    : `Quedan ${formatearPesos(Number(s.disponible))}`;
  const barra = pct === null ? "" : `
      <div class="barra-uso"><div class="${clase}" style="width:${Math.min(Math.max(pct, 0), 100)}%"></div></div>`;
  const marcas = [s.semana === actual ? "hoy" : "", s.semana === semanaElegida ? "elegida" : ""].join(" ");
  return `
    <li class="${marcas}" data-semana="${s.semana}" role="button" tabindex="0">
      <div class="fila">
        <span>Semana ${s.semana}${s.semana === actual ? " · hoy" : ""} <small>${fechasSemana(ciclo, s.semana)}</small></span>
        <span class="semaforo ${clase}">${escapar(s.semaforo)}</span>
      </div>
      <div class="detalle">
        <span>${detalle}</span>
        <span>${pct === null ? "" : pct + " %"}</span>
      </div>${barra}
      ${queda ? `<div class="detalle"><span>${queda}</span></div>` : ""}
    </li>`;
}

function elegir(li) {
  if (li.dataset.semana) {
    semanaElegida = Number(li.dataset.semana);
    categoriaElegida = null;
  } else {
    categoriaElegida = li.dataset.categoria;
    semanaElegida = null;
  }
  document.querySelectorAll("#semanal-categorias li, #lista-semanas li").forEach((x) => x.classList.toggle("elegida", x === li));
  mostrarGastosElegidos();
  $("bloque-semana").scrollIntoView({ behavior: "smooth", block: "start" });
}
["semanal-categorias", "lista-semanas"].forEach((id) => {
  $(id).addEventListener("click", (e) => {
    const li = e.target.closest("li[data-semana], li[data-categoria]");
    if (li) elegir(li);
  });
  $(id).addEventListener("keydown", (e) => {
    const li = e.target.closest("li[data-semana], li[data-categoria]");
    if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); elegir(li); }
  });
});

// Lista de gastos de la semana elegida (solo el pozo) o de la categoría elegida
async function mostrarGastosElegidos() {
  const bloque = $("bloque-semana");
  if (!semanaElegida && !categoriaElegida) { bloque.hidden = true; return; }
  const ciclo = cicloSemanal, semana = semanaElegida, categoria = categoriaElegida;
  $("titulo-semana").textContent = semana ? `Gastos del pozo, semana ${semana}` : `Gastos de ${categoria}`;
  bloque.hidden = false;
  const ul = $("lista-semana");
  let q = db.from("movimientos_por_ciclo")
    .select("id, detalle, categoria, fecha_inicio, monto, divisa, monto_ars")
    .eq("ciclo", ciclo).eq("tipo", "Gasto").eq("fijo_variable", "Variable");
  q = semana ? q.eq("semana", semana).eq("tiene_presupuesto", false) : q.eq("categoria", categoria);
  const { data, error } = await q.order("fecha_inicio");
  if (ciclo !== cicloSemanal || semana !== semanaElegida || categoria !== categoriaElegida) return;
  if (error) { ul.innerHTML = '<li class="vacio">No pude leer los gastos.</li>'; return; }
  if (!data.length) {
    ul.innerHTML = `<li class="vacio">${semana ? "Sin gastos del pozo esta semana." : "Sin gastos en este ciclo."}</li>`;
    return;
  }
  ul.innerHTML = data.map((m) => `
    <li>
      <div class="crece">
        <strong>${escapar(m.detalle)}</strong>
        <small>${escapar(m.categoria)} · ${fechaCorta(m.fecha_inicio)}</small>
      </div>
      <span class="importe">${m.divisa === "USD"
        ? `${formatearMonto(Number(m.monto), "USD")}<br><small>${formatearPesos(Number(m.monto_ars))}</small>`
        : formatearPesos(Number(m.monto_ars))}</span>
    </li>`).join("");
}
