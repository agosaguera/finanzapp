// =====================================================================
// App de finanzas: login y carga rápida (paso 4)
// La página no hace cuentas: guarda movimientos y lee las vistas del paso 3.
// =====================================================================

const db = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
const $ = (id) => document.getElementById(id);

// Hoy en Argentina, como "AAAA-MM-DD" (lo que usan los campos de fecha)
function hoy() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

function valorDe(nombre) {
  return document.querySelector(`input[name="${nombre}"]:checked`).value;
}

function mostrar(pantalla) {
  $("pantalla-login").hidden = pantalla !== "login";
  $("pantalla-carga").hidden = pantalla !== "carga";
  $("pantalla-ciclo").hidden = pantalla !== "ciclo";
  $("pantalla-inicio").hidden = pantalla !== "inicio";
  $("pantalla-semanal").hidden = pantalla !== "semanal";
  $("pantalla-cuotas").hidden = pantalla !== "cuotas";
  $("pantalla-analisis").hidden = pantalla !== "analisis";
  $("menu").hidden = pantalla === "login";
  // Análisis no tiene botón propio: se abre desde Inicio
  const enMenu = pantalla === "analisis" ? "inicio" : pantalla;
  document.querySelectorAll("#menu button").forEach((b) => b.classList.toggle("activo", b.dataset.pantalla === enMenu));
  window.scrollTo(0, 0);
  if (pantalla === "ciclo") abrirCiclo();
  if (pantalla === "inicio") abrirInicio();
  if (pantalla === "semanal") abrirSemanal();
  if (pantalla === "cuotas") abrirCuotas();
  if (pantalla === "analisis") abrirAnalisis();
}

$("menu").addEventListener("click", (e) => {
  const boton = e.target.closest("button[data-pantalla]");
  if (boton) mostrar(boton.dataset.pantalla);
});

function mensaje(texto, tipo) {
  const p = $("carga-mensaje");
  p.textContent = texto;
  p.className = "mensaje " + (tipo || "");
  p.hidden = false;
}

// ------------------------------------------------------------- login

$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").hidden = true;
  const { error } = await db.auth.signInWithPassword({
    email: $("login-mail").value.trim(),
    password: $("login-clave").value,
  });
  if (error) {
    $("login-error").textContent = "No pude entrar: revisá el mail y la contraseña.";
    $("login-error").hidden = false;
    return;
  }
  iniciar();
});

$("boton-salir").addEventListener("click", async () => {
  await db.auth.signOut();
  mostrar("login");
});

// ------------------------------------------------------------- listas

let categoriasActivas = []; // [{nombre, emoji}] para el buscador
let emojis = {};            // nombre → emoji, para mostrar en todas las pantallas

// "🛒 Super Comida" (o solo el nombre si no tiene emoji)
function conEmoji(nombre) {
  return (emojis[nombre] ? emojis[nombre] + " " : "") + nombre;
}

async function cargarListas() {
  const [cats, metodos] = await Promise.all([
    db.from("categorias").select("*").order("nombre"),
    db.from("metodos_pago").select("nombre").eq("activo", true).order("nombre"),
  ]);
  if (cats.error || metodos.error) {
    mensaje("No pude leer las categorías. ¿Corriste el paso 4 en Supabase?", "error");
    return;
  }
  emojis = Object.fromEntries(cats.data.filter((c) => c.emoji).map((c) => [c.nombre, c.emoji]));
  categoriasActivas = cats.data.filter((c) => c.activa);
  dibujarOpcionesCategoria();
  const metodoAntes = $("metodo-pago").value;
  $("metodo-pago").innerHTML =
    '<option value="">Sin método</option>' +
    metodos.data.map((m) => `<option>${escapar(m.nombre)}</option>`).join("");
  $("metodo-pago").value = metodoAntes || (metodos.data.some((m) => m.nombre === "Débito") ? "Débito" : "");
}

// ------------------------------------------------------------- buscador de categorías

// Sin tildes ni mayúsculas: "salud" encuentra "Salud", "educacion" encuentra "Educación"
function normalizar(t) {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function elegirCategoria(nombre) {
  $("categoria").value = nombre || "";
  $("categoria-buscar").value = nombre ? conEmoji(nombre) : "";
  dibujarOpcionesCategoria();
}

function dibujarOpcionesCategoria() {
  const elegida = $("categoria").value;
  const texto = $("categoria-buscar").value;
  const cont = $("categoria-opciones");
  // Con una categoría ya elegida y el texto sin tocar, no hace falta mostrar opciones
  if (elegida && texto === conEmoji(elegida)) { cont.innerHTML = ""; return; }
  const q = normalizar(texto);
  const filtradas = categoriasActivas.filter((c) => !q || normalizar(c.nombre).includes(q));
  cont.innerHTML = filtradas.length
    ? filtradas.map((c) => `<button type="button" class="chip" role="option" data-nombre="${escapar(c.nombre)}">${escapar(conEmoji(c.nombre))}</button>`).join("")
    : '<span class="vacio">No hay ninguna con ese nombre. Podés crearla en Ciclo → Categorías.</span>';
}

$("categoria-buscar").addEventListener("input", () => {
  $("categoria").value = ""; // escribir de nuevo borra la elección
  dibujarOpcionesCategoria();
});
$("categoria-buscar").addEventListener("focus", () => $("categoria-buscar").select());
$("categoria-buscar").addEventListener("keydown", (e) => {
  // Enter elige la primera opción de la lista
  if (e.key !== "Enter") return;
  e.preventDefault();
  const primera = $("categoria-opciones").querySelector(".chip");
  if (primera) elegirCategoria(primera.dataset.nombre);
});
$("categoria-opciones").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) elegirCategoria(chip.dataset.nombre);
});

function escapar(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

// ------------------------------------------------------------- formulario

// El monto se muestra como se va a guardar, mientras lo escribís
function actualizarVistaMonto() {
  const texto = $("monto").value;
  const n = leerMonto(texto);
  const vista = $("monto-vista");
  if (texto.trim() === "") {
    vista.textContent = "";
    vista.className = "vista-previa";
  } else if (n === null) {
    vista.textContent = esCuenta(texto)
      ? "La cuenta no cierra. Revisá los números y los signos."
      : "No entiendo ese monto. Probá con 6,99 o 1500";
    vista.className = "vista-previa error";
  } else {
    vista.textContent = (esCuenta(texto) ? "= " : "Se guarda: ") + formatearMonto(n, valorDe("divisa"));
    vista.className = "vista-previa ok";
  }
}

// Botones de la calculadora: agregan el signo donde está el cursor
document.querySelector(".operaciones").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-op]");
  if (!b) return;
  const campo = $("monto");
  if (b.dataset.op === "borrar") campo.value = campo.value.slice(0, -1);
  else campo.value = campo.value.replace(/\s*$/, "") + " " + b.dataset.op + " ";
  actualizarVistaMonto();
  campo.focus();
});
$("monto").addEventListener("input", actualizarVistaMonto);
document.querySelectorAll('input[name="divisa"]').forEach((r) => r.addEventListener("change", actualizarVistaMonto));

// Mostrar u ocultar lo que solo corresponde a los fijos
function actualizarBloqueFijo() {
  const fijo = valorDe("fijo-variable") === "Fijo";
  $("bloque-fijo").hidden = !fijo;
  const cuota = fijo && valorDe("modalidad") === "Cuota";
  $("bloque-ultimo-pago").hidden = !cuota;
  $("fecha-fin").required = cuota;
}
document.querySelectorAll('input[name="fijo-variable"], input[name="modalidad"]')
  .forEach((r) => r.addEventListener("change", actualizarBloqueFijo));

// Ingresos: no tienen método de pago ni son "esenciales" en el mismo sentido,
// pero se dejan editables. Solo se elige la categoría Ingreso si existe.
$("tipo-ingreso").addEventListener("change", () => {
  if (categoriasActivas.some((c) => c.nombre === "Ingreso")) elegirCategoria("Ingreso");
  $("metodo-pago").value = "";
});

$("form-carga").addEventListener("submit", async (e) => {
  e.preventDefault();
  const monto = leerMonto($("monto").value);
  const fijo = valorDe("fijo-variable") === "Fijo";
  const modalidad = fijo ? valorDe("modalidad") : null;
  const fechaInicio = $("fecha-inicio").value;
  const fechaFin = modalidad === "Cuota" ? $("fecha-fin").value : null;

  // Controles antes de mandar nada
  if (monto === null) return mensaje("Falta el monto o no se entiende.", "error");
  if (!$("detalle").value.trim()) return mensaje("Falta el detalle.", "error");
  if (!$("categoria").value) return mensaje("Falta elegir la categoría.", "error");
  if (!fechaInicio) return mensaje("Falta la fecha.", "error");
  if (modalidad === "Cuota" && !fechaFin) return mensaje("Una cuota necesita la fecha del último pago.", "error");
  if (fechaFin && fechaFin < fechaInicio) return mensaje("El último pago no puede ser antes de la fecha de inicio.", "error");

  $("boton-guardar").disabled = true;
  const editando = editandoId;
  const fila = {
    tipo: valorDe("tipo"),
    monto,
    divisa: valorDe("divisa"),
    detalle: $("detalle").value.trim(),
    categoria: $("categoria").value,
    fijo_variable: valorDe("fijo-variable"),
    modalidad,
    metodo_pago: $("metodo-pago").value || null,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    esencial: $("esencial").checked,
  };
  const { error } = editando
    ? await db.from("movimientos").update(fila).eq("id", editando)
    : await db.from("movimientos").insert(fila);
  $("boton-guardar").disabled = false;

  if (error) {
    mensaje("No se guardó: " + error.message, "error");
    return;
  }
  if (editando) salirDeEdicion();
  mensaje(`${editando ? "Cambios guardados" : "Guardado"}: ${fila.detalle.trim()}, ${formatearMonto(monto, fila.divisa)}`, "ok");
  // Se limpia lo que cambia de un gasto a otro; tipo, categoría y método quedan
  $("monto").value = "";
  $("detalle").value = "";
  actualizarVistaMonto();
  cargarUltimos();
  $("monto").focus();
});

// ------------------------------------------------------------- últimos

let cuantosUltimos = 5;

async function cargarUltimos() {
  const { data, error } = await db
    .from("movimientos")
    .select("id, detalle, monto, divisa, categoria, fecha_inicio, marca_temporal")
    .order("marca_temporal", { ascending: false })
    .order("id", { ascending: false })
    .limit(cuantosUltimos);
  const ul = $("lista-ultimos");
  if (error) {
    ul.innerHTML = '<li class="vacio">No pude leer los últimos movimientos.</li>';
    return;
  }
  if (!data.length) {
    ul.innerHTML = '<li class="vacio">Sin datos todavía.</li>';
    return;
  }
  $("boton-ver-mas").hidden = data.length < cuantosUltimos;
  ul.innerHTML = data.map((m) => `
    <li class="${m.id === editandoId ? "elegida" : ""}">
      <div class="crece editable" data-id="${m.id}" role="button" tabindex="0">
        <strong>${escapar(m.detalle)}</strong>
        <small>${escapar(conEmoji(m.categoria))} · ${m.fecha_inicio.split("-").reverse().join("/")}</small>
      </div>
      <span class="importe">${formatearMonto(Number(m.monto), m.divisa)}</span>
      <button type="button" class="boton-borrar" data-id="${m.id}" aria-label="Borrar ${escapar(m.detalle)}">✕</button>
    </li>`).join("");
}

$("boton-ver-mas").addEventListener("click", () => {
  cuantosUltimos += 15;
  cargarUltimos();
});

$("lista-ultimos").addEventListener("click", async (e) => {
  const editar = e.target.closest(".editable");
  if (editar) return editarMovimiento(Number(editar.dataset.id));
  const boton = e.target.closest(".boton-borrar");
  if (!boton) return;
  const nombre = boton.closest("li").querySelector("strong").textContent;
  if (!confirm(`¿Borrar "${nombre}"? No se puede deshacer.`)) return;
  const { error } = await db.from("movimientos").delete().eq("id", Number(boton.dataset.id));
  if (error) return mensaje("No se borró: " + error.message, "error");
  if (Number(boton.dataset.id) === editandoId) salirDeEdicion();
  mensaje(`Borrado: ${nombre}`, "ok");
  cargarUltimos();
});

$("lista-ultimos").addEventListener("keydown", (e) => {
  const editar = e.target.closest(".editable");
  if (editar && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); editarMovimiento(Number(editar.dataset.id)); }
});

// ------------------------------------------------------------- editar

// Editar usa el mismo formulario de carga: se llena con el movimiento
// y "Guardar" pasa a guardar los cambios en vez de crear uno nuevo.
let editandoId = null;

function marcarRadio(nombre, valor) {
  const r = document.querySelector(`input[name="${nombre}"][value="${valor}"]`);
  if (r) r.checked = true;
}

async function editarMovimiento(id) {
  const { data, error } = await db.from("movimientos").select("*").eq("id", id).limit(1);
  if (error || !data.length) return mensaje("No pude abrir ese movimiento.", "error");
  const m = data[0];
  editandoId = id;
  marcarRadio("tipo", m.tipo);
  marcarRadio("divisa", m.divisa);
  marcarRadio("fijo-variable", m.fijo_variable);
  marcarRadio("modalidad", m.modalidad || "Recurrente");
  $("monto").value = Number(m.monto).toLocaleString("es-AR", { maximumFractionDigits: 2 });
  $("detalle").value = m.detalle;
  elegirCategoria(m.categoria); // sirve aunque la categoría esté desactivada
  $("metodo-pago").value = m.metodo_pago || "";
  $("fecha-inicio").value = m.fecha_inicio;
  $("fecha-fin").value = m.fijo_variable === "Fijo" ? m.fecha_fin || "" : "";
  $("esencial").checked = !!m.esencial;
  actualizarBloqueFijo();
  actualizarVistaMonto();
  $("boton-guardar").textContent = "Guardar cambios";
  $("boton-cancelar-edicion").hidden = false;
  $("aviso-edicion").textContent = m.fijo_variable === "Fijo"
    ? `Editando: ${m.detalle}. Ojo: cambiar el monto acá cambia todos los meses. Para un aumento desde ahora, usá Ciclo → Tus fijos.`
    : `Editando: ${m.detalle}`;
  $("aviso-edicion").hidden = false;
  $("carga-mensaje").hidden = true;
  document.querySelectorAll("#lista-ultimos li").forEach((li) =>
    li.classList.toggle("elegida", li.querySelector(".editable")?.dataset.id === String(id)));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function salirDeEdicion() {
  editandoId = null;
  $("boton-guardar").textContent = "Guardar";
  $("boton-cancelar-edicion").hidden = true;
  $("aviso-edicion").hidden = true;
  $("monto").value = "";
  $("detalle").value = "";
  $("fecha-inicio").value = hoy();
  $("fecha-fin").value = "";
  marcarRadio("fijo-variable", "Variable");
  $("esencial").checked = false;
  actualizarBloqueFijo();
  actualizarVistaMonto();
  document.querySelectorAll("#lista-ultimos li.elegida").forEach((li) => li.classList.remove("elegida"));
}

$("boton-cancelar-edicion").addEventListener("click", () => {
  salirDeEdicion();
  $("carga-mensaje").hidden = true;
});

// ------------------------------------------------------------- arranque

async function iniciar() {
  mostrar("carga");
  $("fecha-inicio").value = hoy();
  actualizarBloqueFijo();
  await cargarListas();
  cargarUltimos();
}

(async () => {
  const { data } = await db.auth.getSession();
  if (data.session) iniciar();
  else mostrar("login");
})();
