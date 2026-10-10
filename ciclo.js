// =====================================================================
// Pantalla de ciclo (paso 5)
// Cuando cobrás: cargás el día, la cotización y el presupuesto de las
// categorías con presupuesto propio. El fin del ciclo anterior se calcula
// solo (el día antes de este cobro).
// También sirve para corregir la cotización o el presupuesto de un ciclo.
// =====================================================================

const NUEVO = "__nuevo__";
let ciclos = [];          // ciclos_con_fin, del más nuevo al más viejo
let categoriasPres = [];  // nombres de las categorías con presupuesto propio
let presupuestos = [];    // todas las filas de presupuestos
let nombreTocado = false; // si escribiste el nombre a mano, no lo piso

function fechaCorta(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function nombreSugerido(iso) {
  if (!iso) return "";
  const mes = new Date(iso + "T12:00:00").toLocaleString("es-AR", { month: "long" });
  return "Ciclo " + mes.charAt(0).toUpperCase() + mes.slice(1);
}

// Como leerMonto, pero acepta 0 (un presupuesto puede ser cero)
function leerPresupuesto(texto) {
  const t = String(texto || "").trim();
  if (t === "") return undefined;     // vacío: sin presupuesto
  if (/^\$?\s*0+([.,]0+)?$/.test(t)) return 0;
  return leerMonto(t);                // null si no se entiende
}

function mensajeCiclo(texto, tipo) {
  const p = $("ciclo-mensaje");
  p.textContent = texto;
  p.className = "mensaje " + (tipo || "");
  p.hidden = false;
}

async function abrirCiclo() {
  $("ciclo-mensaje").hidden = true;
  const [c, cat, pres] = await Promise.all([
    db.from("ciclos_con_fin").select("*").order("fecha_inicio", { ascending: false }),
    db.from("categorias").select("nombre").eq("tiene_presupuesto", true).eq("activa", true).order("nombre"),
    db.from("presupuestos").select("ciclo, categoria, monto"),
  ]);
  if (c.error || cat.error || pres.error) {
    mensajeCiclo("No pude leer los ciclos. Probá de nuevo en un rato.", "error");
    return;
  }
  ciclos = c.data;
  categoriasPres = cat.data.map((x) => x.nombre);
  presupuestos = pres.data;

  // Lista de ciclos con sus fechas
  $("lista-ciclos").innerHTML = ciclos.length
    ? ciclos.map((x) => `
      <li>
        <div class="crece">
          <strong>${escapar(x.nombre)}</strong>
          <small>${fechaCorta(x.fecha_inicio)} – ${x.en_curso ? "en curso" : fechaCorta(x.fecha_fin)}</small>
        </div>
        <span class="importe">US$ 1 = ${formatearMonto(Number(x.cotizacion), "ARS")}</span>
      </li>`).join("")
    : '<li class="vacio">Sin datos todavía.</li>';

  // Selector: ciclo nuevo o uno existente para corregir
  $("ciclo-elegido").innerHTML =
    `<option value="${NUEVO}">Nuevo ciclo (cobré)</option>` +
    ciclos.map((x) => `<option value="${escapar(x.nombre)}">Corregir ${escapar(x.nombre)}</option>`).join("");
  $("ciclo-elegido").value = NUEVO;
  prepararFormulario();
  abrirFijos();
  abrirCategorias();
}

function prepararFormulario() {
  const elegido = $("ciclo-elegido").value;
  const esNuevo = elegido === NUEVO;
  $("bloque-ciclo-nuevo").hidden = !esNuevo;
  $("boton-guardar-ciclo").textContent = esNuevo ? "Guardar ciclo nuevo" : "Guardar cambios";

  let origen;   // de qué ciclo salen los montos que se muestran
  if (esNuevo) {
    $("ciclo-fecha").value = hoy();
    nombreTocado = false;
    $("ciclo-nombre").value = nombreSugerido(hoy());
    $("ciclo-cotizacion").value = "";
    origen = ciclos[0];  // el más reciente: el presupuesto se copia de ahí
    $("presupuesto-origen").textContent = origen
      ? `Copiado de ${origen.nombre}. Cambiá lo que necesites.`
      : "";
  } else {
    origen = ciclos.find((x) => x.nombre === elegido);
    $("ciclo-cotizacion").value = formatearNumero(Number(origen.cotizacion));
    $("presupuesto-origen").textContent = "";
  }

  $("campos-presupuesto").innerHTML = categoriasPres.map((cat) => {
    const fila = origen && presupuestos.find((p) => p.ciclo === origen.nombre && p.categoria === cat);
    const valor = fila ? formatearNumero(Number(fila.monto)) : "";
    return `
      <label class="campo-presupuesto">
        <span>${escapar(cat)}</span>
        <input type="text" inputmode="decimal" autocomplete="off" data-categoria="${escapar(cat)}" value="${valor}" placeholder="—">
      </label>`;
  }).join("");
  actualizarTotal();
}

// 45000 → "45.000" ; 6.5 → "6,50" (como lo escribirías vos)
function formatearNumero(n) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}

function actualizarTotal() {
  let total = 0;
  let hayError = false;
  document.querySelectorAll("#campos-presupuesto input").forEach((inp) => {
    const v = leerPresupuesto(inp.value);
    inp.classList.toggle("invalido", v === null);
    if (v === null) hayError = true;
    else if (v) total += v;
  });
  $("presupuesto-total").textContent = hayError ? "revisá los montos en rojo" : formatearMonto(total, "ARS");
}

$("ciclo-elegido").addEventListener("change", () => {
  $("ciclo-mensaje").hidden = true;
  prepararFormulario();
});
$("campos-presupuesto").addEventListener("input", actualizarTotal);
$("ciclo-nombre").addEventListener("input", () => { nombreTocado = true; });
$("ciclo-fecha").addEventListener("change", () => {
  if (!nombreTocado) $("ciclo-nombre").value = nombreSugerido($("ciclo-fecha").value);
});

$("form-ciclo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const esNuevo = $("ciclo-elegido").value === NUEVO;
  const nombre = esNuevo ? $("ciclo-nombre").value.trim() : $("ciclo-elegido").value;
  const fecha = $("ciclo-fecha").value;
  const cotizacion = leerMonto($("ciclo-cotizacion").value);

  // Controles antes de mandar nada
  if (esNuevo) {
    if (!fecha) return mensajeCiclo("Falta el día que cobraste.", "error");
    if (!nombre) return mensajeCiclo("Falta el nombre del ciclo.", "error");
    if (ciclos[0] && fecha <= ciclos[0].fecha_inicio)
      return mensajeCiclo(`El cobro tiene que ser después del último (${fechaCorta(ciclos[0].fecha_inicio)}).`, "error");
    if (ciclos.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase()))
      return mensajeCiclo(`Ya existe un ciclo llamado "${nombre}". Elegilo arriba para corregirlo.`, "error");
  }
  if (cotizacion === null) return mensajeCiclo("Falta la cotización o no se entiende.", "error");

  const filas = [];
  const vacias = [];
  for (const inp of document.querySelectorAll("#campos-presupuesto input")) {
    const v = leerPresupuesto(inp.value);
    if (v === null) return mensajeCiclo(`No entiendo el presupuesto de ${inp.dataset.categoria}.`, "error");
    if (v === undefined) vacias.push(inp.dataset.categoria);
    else filas.push({ ciclo: nombre, categoria: inp.dataset.categoria, monto: v });
  }

  $("boton-guardar-ciclo").disabled = true;
  try {
    // 1. El ciclo
    const r1 = esNuevo
      ? await db.from("ciclos").insert({ nombre, fecha_inicio: fecha, cotizacion })
      : await db.from("ciclos").update({ cotizacion }).eq("nombre", nombre);
    if (r1.error) return mensajeCiclo("No se guardó el ciclo: " + r1.error.message, "error");

    // 2. El presupuesto: los montos cargados se guardan, los vacíos se borran
    if (filas.length) {
      const r2 = await db.from("presupuestos").upsert(filas, { onConflict: "ciclo,categoria" });
      if (r2.error) return mensajeCiclo("El ciclo se guardó, pero el presupuesto no: " + r2.error.message, "error");
    }
    if (!esNuevo && vacias.length) {
      const r3 = await db.from("presupuestos").delete().eq("ciclo", nombre).in("categoria", vacias);
      if (r3.error) return mensajeCiclo("No pude borrar los presupuestos vacíos: " + r3.error.message, "error");
    }

    await abrirCiclo();
    mensajeCiclo(esNuevo ? `Listo: ${nombre} empezó el ${fechaCorta(fecha)}.` : `Listo: ${nombre} actualizado.`, "ok");
  } finally {
    $("boton-guardar-ciclo").disabled = false;
  }
});
