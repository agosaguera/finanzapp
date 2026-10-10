// =====================================================================
// Tus fijos (versión 2, ronda 2): cambiar el monto o cancelar un fijo
// Vive en la pantalla Ciclo. Lista los fijos que siguen vigentes.
//   - Monto nuevo: se guarda en cambios_monto, "desde" un ciclo. Los
//     ciclos anteriores no cambian (no es retroactivo).
//   - Cancelar (recurrente) o cambiar el último pago (cuota): fecha_fin.
// La vista movimientos_por_ciclo usa el cambio vigente al EMPEZAR cada
// ciclo (sql/6-cambios-de-monto.sql).
// =====================================================================

let fijos = [];          // movimientos fijos vigentes
let cambios = [];        // cambios_monto de esos fijos
let fijoElegido = null;  // el fijo abierto en el panel

function cicloActual() {
  return ciclos.find((c) => c.en_curso) || null; // "ciclos" viene de ciclo.js
}

// Monto que rige en un ciclo que empieza en "inicio" (como la vista)
function montoVigente(f, inicio) {
  const vigentes = cambios
    .filter((c) => c.movimiento_id === f.id && c.desde <= inicio)
    .sort((a, b) => (a.desde < b.desde ? 1 : -1));
  return vigentes.length ? Number(vigentes[0].monto) : Number(f.monto);
}

// Un cambio ya programado para el próximo ciclo, si hay
function montoProximo(f, inicio) {
  const futuros = cambios
    .filter((c) => c.movimiento_id === f.id && c.desde > inicio)
    .sort((a, b) => (a.desde < b.desde ? 1 : -1));
  return futuros.length ? Number(futuros[0].monto) : null;
}

function mensajeFijo(texto, tipo) {
  // Si el panel se cerró (el fijo ya no está vigente), el aviso va bajo la lista
  const p = $("panel-fijo").hidden ? $("fijos-aviso") : $("fijo-mensaje");
  $("fijos-aviso").hidden = true;
  p.textContent = texto;
  p.className = "mensaje " + (tipo || "");
  p.hidden = !texto;
}

async function abrirFijos() {
  const ul = $("lista-fijos");
  const { data, error } = await db.from("movimientos")
    .select("id, detalle, categoria, monto, divisa, modalidad, fecha_inicio, fecha_fin")
    .eq("tipo", "Gasto").eq("fijo_variable", "Fijo")
    .or(`fecha_fin.is.null,fecha_fin.gte.${hoy()}`)
    .order("detalle");
  if (error) {
    ul.innerHTML = '<li class="vacio">No pude leer tus fijos.</li>';
    return;
  }
  fijos = data;
  const ids = fijos.map((f) => f.id);
  const c = ids.length ? await db.from("cambios_monto").select("*").in("movimiento_id", ids) : { data: [] };
  cambios = c.error ? [] : c.data;
  dibujarFijos();
  if (fijoElegido) {
    const f = fijos.find((x) => x.id === fijoElegido.id);
    if (f) abrirPanelFijo(f); else cerrarPanelFijo();
  }
}

function dibujarFijos() {
  const ul = $("lista-fijos");
  if (!fijos.length) {
    ul.innerHTML = '<li class="vacio">No tenés fijos vigentes.</li>';
    return;
  }
  const actual = cicloActual();
  const inicio = actual ? actual.fecha_inicio : hoy();
  ul.innerHTML = fijos.map((f) => {
    const ahora = montoVigente(f, inicio);
    const prox = montoProximo(f, inicio);
    const tipo = f.modalidad === "Cuota" ? `cuota hasta ${fechaCorta(f.fecha_fin)}` : f.fecha_fin ? `último pago ${fechaCorta(f.fecha_fin)}` : "recurrente";
    return `
    <li class="${fijoElegido && fijoElegido.id === f.id ? "elegida" : ""}" data-id="${f.id}" role="button" tabindex="0">
      <div class="crece">
        <strong>${escapar(f.detalle)}</strong>
        <small>${escapar(f.categoria)} · ${tipo}</small>
        ${prox !== null ? `<small class="ok">Próximo ciclo: ${formatearMonto(prox, f.divisa)}</small>` : ""}
      </div>
      <span class="importe">${formatearMonto(ahora, f.divisa)}</span>
    </li>`;
  }).join("");
}

function abrirPanelFijo(f) {
  fijoElegido = f;
  $("fijos-aviso").hidden = true;
  const actual = cicloActual();
  const inicio = actual ? actual.fecha_inicio : hoy();
  const prox = montoProximo(f, inicio);
  $("fijo-titulo").textContent = f.detalle;
  $("fijo-actual").textContent = `Hoy pagás ${formatearMonto(montoVigente(f, inicio), f.divisa)} por ciclo` +
    (prox !== null ? `, y desde el próximo ciclo ${formatearMonto(prox, f.divisa)}.` : ".");
  $("fijo-monto").value = "";
  $("fijo-monto-vista").textContent = "";
  $("desde-proximo").checked = true;
  const cuota = f.modalidad === "Cuota";
  $("fijo-fin-etiqueta").firstChild.textContent = cuota ? "Último pago de la cuota" : "Último pago (si lo cancelás)";
  $("fijo-fin").value = f.fecha_fin || hoy();
  $("boton-guardar-fin").textContent = cuota ? "Guardar último pago" : f.fecha_fin ? "Cambiar último pago" : "Cancelar este fijo";
  mensajeFijo("");
  $("panel-fijo").hidden = false;
  document.querySelectorAll("#lista-fijos li").forEach((li) => li.classList.toggle("elegida", Number(li.dataset.id) === f.id));
  $("panel-fijo").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cerrarPanelFijo() {
  fijoElegido = null;
  $("panel-fijo").hidden = true;
  document.querySelectorAll("#lista-fijos li.elegida").forEach((li) => li.classList.remove("elegida"));
}

$("lista-fijos").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (li) abrirPanelFijo(fijos.find((f) => f.id === Number(li.dataset.id)));
});
$("lista-fijos").addEventListener("keydown", (e) => {
  const li = e.target.closest("li[data-id]");
  if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirPanelFijo(fijos.find((f) => f.id === Number(li.dataset.id))); }
});
$("boton-cerrar-fijo").addEventListener("click", cerrarPanelFijo);

$("fijo-monto").addEventListener("input", () => {
  const t = $("fijo-monto").value, n = leerMonto(t), v = $("fijo-monto-vista");
  if (!t.trim()) { v.textContent = ""; v.className = "vista-previa"; return; }
  v.textContent = n === null ? "No entiendo ese monto. Probá con 6,99 o 1500" : "Se guarda: " + formatearMonto(n, fijoElegido.divisa);
  v.className = "vista-previa " + (n === null ? "error" : "ok");
});

$("boton-guardar-monto").addEventListener("click", async () => {
  const f = fijoElegido;
  const monto = leerMonto($("fijo-monto").value);
  if (monto === null) return mensajeFijo("Falta el monto nuevo o no se entiende.", "error");
  const actual = cicloActual();
  if (!actual) return mensajeFijo("Primero cargá un ciclo.", "error");
  // "desde" = el día que empieza el ciclo en curso, o el siguiente
  // (cualquier fecha después de ese inicio cae en el próximo ciclo)
  const proximo = valorDe("fijo-desde") === "proximo";
  const desde = proximo ? sumarDias(actual.fecha_inicio, 1) : actual.fecha_inicio;
  const { error } = await db.from("cambios_monto")
    .upsert({ movimiento_id: f.id, desde, monto }, { onConflict: "movimiento_id,desde" });
  if (error) return mensajeFijo("No se guardó: " + error.message, "error");
  await abrirFijos();
  mensajeFijo(`Listo: ${f.detalle} pasa a ${formatearMonto(monto, f.divisa)} desde ${proximo ? "el próximo ciclo" : "este ciclo"}.`, "ok");
});

$("boton-guardar-fin").addEventListener("click", async () => {
  const f = fijoElegido;
  const fin = $("fijo-fin").value;
  if (!fin) return mensajeFijo("Falta la fecha del último pago.", "error");
  if (fin < f.fecha_inicio) return mensajeFijo("El último pago no puede ser antes de que empezó.", "error");
  if (f.modalidad !== "Cuota" && !f.fecha_fin &&
      !confirm(`¿Cancelar "${f.detalle}"? Se cuenta hasta el ${fechaCorta(fin)} y después deja de sumar.`)) return;
  const { error } = await db.from("movimientos").update({ fecha_fin: fin }).eq("id", f.id);
  if (error) return mensajeFijo("No se guardó: " + error.message, "error");
  await abrirFijos();
  mensajeFijo(fin < hoy()
    ? `Listo: ${f.detalle} ya no aparece en tus fijos vigentes.`
    : `Listo: el último pago de ${f.detalle} es el ${fechaCorta(fin)}.`, "ok");
});
