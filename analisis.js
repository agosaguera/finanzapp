// =====================================================================
// Análisis de gastos (paso 9): ¿en qué se me va la plata?
// Las barras leen gastos_por_categoria; la lista de detalle lee
// movimientos_por_ciclo. Tocar una barra filtra la lista por categoría
// Y por fijo/variable (lo que en Power BI necesitó el truco de la leyenda).
// =====================================================================

let gastosAnalisis = [];   // movimientos del ciclo (solo gastos)
let filtroAnalisis = null; // { categoria, tipo: "Fijo" | "Variable" | null }

$("boton-analisis").addEventListener("click", () => mostrar("analisis"));
$("boton-volver-inicio").addEventListener("click", () => mostrar("inicio"));

function mensajeAnalisis(texto) {
  $("analisis-mensaje").textContent = texto;
  $("analisis-mensaje").hidden = !texto;
}

async function abrirAnalisis() {
  mensajeAnalisis("");
  // Usa la lista de ciclos y el ciclo elegido en Inicio
  if (!resumenes.length) {
    const r = await db.from("resumen_ciclo").select("*").order("fecha_inicio", { ascending: false });
    if (r.error) return mensajeAnalisis("No pude leer los ciclos.");
    resumenes = r.data;
  }
  if (!resumenes.length) return mensajeAnalisis("Todavía no hay ciclos.");
  if (!resumenes.some((x) => x.ciclo === cicloInicio)) {
    cicloInicio = (resumenes.find((x) => x.en_curso) || resumenes[0]).ciclo;
  }
  $("analisis-ciclo").innerHTML = resumenes
    .map((x) => `<option value="${escapar(x.ciclo)}">${escapar(x.ciclo)}${x.en_curso ? " (en curso)" : ""}</option>`)
    .join("");
  $("analisis-ciclo").value = cicloInicio;
  cargarAnalisis();
}

$("analisis-ciclo").addEventListener("change", () => {
  cicloInicio = $("analisis-ciclo").value; // al volver, Inicio muestra el mismo
  cargarAnalisis();
});

async function cargarAnalisis() {
  const ciclo = cicloInicio;
  filtroAnalisis = null;
  const [g, m] = await Promise.all([
    db.from("gastos_por_categoria").select("*").eq("ciclo", ciclo),
    db.from("movimientos_por_ciclo")
      .select("id, detalle, categoria, fijo_variable, fecha_inicio, monto, divisa, monto_ars")
      .eq("ciclo", ciclo).eq("tipo", "Gasto")
      .order("monto_ars", { ascending: false }),
  ]);
  if (ciclo !== cicloInicio) return; // cambiaste de ciclo mientras cargaba
  if (g.error || m.error) return mensajeAnalisis("No pude leer los gastos del ciclo.");
  gastosAnalisis = m.data;

  const cats = g.data;
  const fijos = cats.reduce((t, c) => t + Number(c.fijos), 0);
  const variables = cats.reduce((t, c) => t + Number(c.variables), 0);
  mostrarProporcion(fijos, variables);
  barras("barras-fijos", cats, "fijos", "Fijo");
  barras("barras-variables", cats, "variables", "Variable");
  barras("barras-total", cats, "total", null);
  mostrarDetalle();
}

function mostrarProporcion(fijos, variables) {
  const total = fijos + variables;
  ponerNumero("n-total-gastado", total);
  if (total <= 0) {
    $("proporcion").innerHTML = "";
    $("proporcion").setAttribute("aria-label", "Sin gastos");
    $("proporcion-leyenda").innerHTML = '<span style="--c:transparent">Sin datos</span>';
    return;
  }
  const pf = Math.round((fijos / total) * 100);
  const pv = 100 - pf;
  $("proporcion").innerHTML = `<div class="fijo" style="width:${(fijos / total) * 100}%"></div><div class="variable" style="width:${(variables / total) * 100}%"></div>`;
  $("proporcion").setAttribute("aria-label", `Fijos ${pf} %, variables ${pv} %`);
  $("proporcion-leyenda").innerHTML =
    `<span style="--c:var(--marca)">Fijos ${pf} % · ${formatearPesos(fijos)}</span>` +
    `<span style="--c:var(--variable)">Variables ${pv} % · ${formatearPesos(variables)}</span>`;
}

// Barras horizontales, de la más grande a la más chica.
// tipo: "Fijo", "Variable" o null (total, sin distinguir).
function barras(id, cats, campo, tipo) {
  const filas = cats.filter((c) => Number(c[campo]) > 0).sort((a, b) => Number(b[campo]) - Number(a[campo]));
  const ul = $(id);
  if (!filas.length) {
    ul.innerHTML = '<li class="vacio">Sin datos.</li>';
    return;
  }
  const maximo = Number(filas[0][campo]);
  const clase = tipo === "Fijo" ? "fijo" : tipo === "Variable" ? "variable" : "total";
  ul.innerHTML = filas.map((c) => `
    <li data-categoria="${escapar(c.categoria)}" data-tipo="${tipo || ""}" role="button" tabindex="0">
      <div class="fila"><span>${escapar(c.categoria)}</span><span>${formatearPesos(Number(c[campo]))}</span></div>
      <div class="pista"><div class="${clase}" style="width:${(Number(c[campo]) / maximo) * 100}%"></div></div>
    </li>`).join("");
}

function elegirBarra(li) {
  const nuevo = { categoria: li.dataset.categoria, tipo: li.dataset.tipo || null };
  const igual = filtroAnalisis && filtroAnalisis.categoria === nuevo.categoria && filtroAnalisis.tipo === nuevo.tipo;
  filtroAnalisis = igual ? null : nuevo; // tocar de nuevo la misma barra la suelta
  mostrarDetalle();
  if (filtroAnalisis) $("bloque-detalle").scrollIntoView({ behavior: "smooth", block: "start" });
}
document.querySelectorAll(".barras").forEach((ul) => {
  ul.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-categoria]");
    if (li) elegirBarra(li);
  });
  ul.addEventListener("keydown", (e) => {
    const li = e.target.closest("li[data-categoria]");
    if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); elegirBarra(li); }
  });
});
$("boton-quitar-filtro").addEventListener("click", () => {
  filtroAnalisis = null;
  mostrarDetalle();
});

function mostrarDetalle() {
  const f = filtroAnalisis;
  document.querySelectorAll(".barras li[data-categoria]").forEach((li) => {
    li.classList.toggle("elegida", !!f && li.dataset.categoria === f.categoria && (li.dataset.tipo || null) === f.tipo);
  });
  const filas = f
    ? gastosAnalisis.filter((m) => m.categoria === f.categoria && (!f.tipo || m.fijo_variable === f.tipo))
    : gastosAnalisis;
  $("titulo-detalle").textContent = f
    ? `${f.categoria}${f.tipo ? (f.tipo === "Fijo" ? " · fijos" : " · variables") : ""}`
    : "Todos los gastos";
  $("boton-quitar-filtro").hidden = !f;

  const ul = $("lista-detalle");
  if (!filas.length) {
    ul.innerHTML = '<li class="vacio">Sin gastos en este ciclo.</li>';
    return;
  }
  const total = filas.reduce((t, m) => t + Number(m.monto_ars), 0);
  ul.innerHTML = filas.map((m) => `
    <li>
      <div class="crece">
        <strong>${escapar(m.detalle)}</strong>
        <small>${escapar(m.categoria)} · ${m.fijo_variable === "Fijo" ? "fijo" : fechaCorta(m.fecha_inicio)}</small>
      </div>
      <span class="importe">${m.divisa === "USD"
        ? `${formatearMonto(Number(m.monto), "USD")}<br><small>${formatearPesos(Number(m.monto_ars))}</small>`
        : formatearPesos(Number(m.monto_ars))}</span>
    </li>`).join("") +
    `<li><div class="crece"><strong>Total</strong></div><span class="importe"><strong>${formatearPesos(total)}</strong></span></li>`;
}
