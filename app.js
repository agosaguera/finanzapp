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
  $("menu").hidden = pantalla === "login";
  document.querySelectorAll("#menu button").forEach((b) => b.classList.toggle("activo", b.dataset.pantalla === pantalla));
  window.scrollTo(0, 0);
  if (pantalla === "ciclo") abrirCiclo();
  if (pantalla === "inicio") abrirInicio();
  if (pantalla === "semanal") abrirSemanal();
  if (pantalla === "cuotas") abrirCuotas();
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

async function cargarListas() {
  const [cats, metodos] = await Promise.all([
    db.from("categorias").select("nombre").eq("activa", true).order("nombre"),
    db.from("metodos_pago").select("nombre").eq("activo", true).order("nombre"),
  ]);
  if (cats.error || metodos.error) {
    mensaje("No pude leer las categorías. ¿Corriste el paso 4 en Supabase?", "error");
    return;
  }
  $("categoria").innerHTML =
    '<option value="" disabled selected>Elegí una</option>' +
    cats.data.map((c) => `<option>${escapar(c.nombre)}</option>`).join("");
  $("metodo-pago").innerHTML =
    '<option value="">Sin método</option>' +
    metodos.data.map((m) => `<option>${escapar(m.nombre)}</option>`).join("");
  $("metodo-pago").value = metodos.data.some((m) => m.nombre === "Débito") ? "Débito" : "";
}

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
    vista.textContent = "No entiendo ese monto. Probá con 6,99 o 1500";
    vista.className = "vista-previa error";
  } else {
    vista.textContent = "Se guarda: " + formatearMonto(n, valorDe("divisa"));
    vista.className = "vista-previa ok";
  }
}
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
  if ([...$("categoria").options].some((o) => o.value === "Ingreso")) $("categoria").value = "Ingreso";
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
  const { error } = await db.from("movimientos").insert(fila);
  $("boton-guardar").disabled = false;

  if (error) {
    mensaje("No se guardó: " + error.message, "error");
    return;
  }
  mensaje(`Guardado: ${fila.detalle.trim()}, ${formatearMonto(monto, fila.divisa)}`, "ok");
  // Se limpia lo que cambia de un gasto a otro; tipo, categoría y método quedan
  $("monto").value = "";
  $("detalle").value = "";
  actualizarVistaMonto();
  cargarUltimos();
  $("monto").focus();
});

// ------------------------------------------------------------- últimos

async function cargarUltimos() {
  const { data, error } = await db
    .from("movimientos")
    .select("id, detalle, monto, divisa, categoria, fecha_inicio, marca_temporal")
    .order("marca_temporal", { ascending: false })
    .order("id", { ascending: false })
    .limit(5);
  const ul = $("lista-ultimos");
  if (error) {
    ul.innerHTML = '<li class="vacio">No pude leer los últimos movimientos.</li>';
    return;
  }
  if (!data.length) {
    ul.innerHTML = '<li class="vacio">Sin datos todavía.</li>';
    return;
  }
  ul.innerHTML = data.map((m) => `
    <li>
      <div class="crece">
        <strong>${escapar(m.detalle)}</strong>
        <small>${escapar(m.categoria)} · ${m.fecha_inicio.split("-").reverse().join("/")}</small>
      </div>
      <span class="importe">${formatearMonto(Number(m.monto), m.divisa)}</span>
      <button type="button" class="boton-borrar" data-id="${m.id}" aria-label="Borrar ${escapar(m.detalle)}">✕</button>
    </li>`).join("");
}

$("lista-ultimos").addEventListener("click", async (e) => {
  const boton = e.target.closest(".boton-borrar");
  if (!boton) return;
  const nombre = boton.closest("li").querySelector("strong").textContent;
  if (!confirm(`¿Borrar "${nombre}"? No se puede deshacer.`)) return;
  const { error } = await db.from("movimientos").delete().eq("id", Number(boton.dataset.id));
  if (error) return mensaje("No se borró: " + error.message, "error");
  mensaje(`Borrado: ${nombre}`, "ok");
  cargarUltimos();
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
