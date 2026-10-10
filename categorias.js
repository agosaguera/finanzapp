// =====================================================================
// Administrar categorías (versión 2, ronda 3), en la pantalla Ciclo
// Crear, renombrar, emoji, si tiene presupuesto y si está activa.
//   - Renombrar: la base cambia el nombre también en todos los gastos y
//     presupuestos viejos (las tablas tienen "on update cascade").
//   - No se borra: una categoría con gastos se DESACTIVA, así el
//     historial queda entero y deja de aparecer al cargar.
//   - Sacarle el presupuesto: se borra su presupuesto del ciclo en curso,
//     para que no siga sumando en lo planificado. Los ciclos viejos quedan.
// =====================================================================

let categoriasAdmin = [];
let categoriaEditada = null; // null = categoría nueva

function avisoCategorias(texto) {
  $("categorias-aviso").textContent = texto;
  $("categorias-aviso").hidden = !texto;
}

function mensajeCategoria(texto, tipo) {
  const p = $("categoria-mensaje");
  p.textContent = texto;
  p.className = "mensaje " + (tipo || "");
  p.hidden = !texto;
}

async function abrirCategorias() {
  const { data, error } = await db.from("categorias").select("*").order("nombre");
  const ul = $("lista-categorias-admin");
  if (error) {
    ul.innerHTML = '<li class="vacio">No pude leer las categorías.</li>';
    return;
  }
  categoriasAdmin = data;
  // Activas primero; las desactivadas al final
  const orden = [...data].sort((a, b) => (a.activa === b.activa ? a.nombre.localeCompare(b.nombre) : a.activa ? -1 : 1));
  ul.innerHTML = orden.map((c) => `
    <li data-nombre="${escapar(c.nombre)}" role="button" tabindex="0" class="${c.activa ? "" : "inactiva"}">
      <div class="crece">
        <strong>${escapar((c.emoji ? c.emoji + " " : "") + c.nombre)}</strong>
        <small>${c.tiene_presupuesto ? "Con presupuesto" : "Sin presupuesto"}${c.activa ? "" : " · desactivada"}</small>
      </div>
    </li>`).join("");
}

function abrirPanelCategoria(c) {
  categoriaEditada = c;
  avisoCategorias("");
  mensajeCategoria("");
  $("categoria-titulo").textContent = c ? "Editar categoría" : "Nueva categoría";
  $("cat-emoji").value = c ? c.emoji || "" : "";
  $("cat-nombre").value = c ? c.nombre : "";
  $("cat-presupuesto").checked = c ? c.tiene_presupuesto : false;
  $("cat-activa").checked = c ? c.activa : true;
  $("cat-ayuda").textContent = c
    ? "Si le cambiás el nombre, se cambia también en todos tus gastos viejos."
    : "Sin presupuesto propio, sus gastos variables salen del pozo semanal.";
  $("panel-categoria").hidden = false;
  document.querySelectorAll("#lista-categorias-admin li").forEach((li) => li.classList.toggle("elegida", !!c && li.dataset.nombre === c.nombre));
  $("panel-categoria").scrollIntoView({ behavior: "smooth", block: "start" });
  if (!c) $("cat-nombre").focus();
}

function cerrarPanelCategoria() {
  categoriaEditada = null;
  $("panel-categoria").hidden = true;
  document.querySelectorAll("#lista-categorias-admin li.elegida").forEach((li) => li.classList.remove("elegida"));
}

$("boton-nueva-categoria").addEventListener("click", () => abrirPanelCategoria(null));
$("boton-cerrar-categoria").addEventListener("click", cerrarPanelCategoria);
$("lista-categorias-admin").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-nombre]");
  if (li) abrirPanelCategoria(categoriasAdmin.find((c) => c.nombre === li.dataset.nombre));
});
$("lista-categorias-admin").addEventListener("keydown", (e) => {
  const li = e.target.closest("li[data-nombre]");
  if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirPanelCategoria(categoriasAdmin.find((c) => c.nombre === li.dataset.nombre)); }
});

$("panel-categoria").addEventListener("submit", async (e) => {
  e.preventDefault();
  const c = categoriaEditada ? { ...categoriaEditada } : null; // copia: cómo estaba antes de guardar
  const nombre = $("cat-nombre").value.trim().replace(/\s+/g, " ");
  const fila = {
    nombre,
    emoji: $("cat-emoji").value.trim() || null,
    tiene_presupuesto: $("cat-presupuesto").checked,
    activa: $("cat-activa").checked,
  };
  if (!nombre) return mensajeCategoria("Falta el nombre.", "error");
  const repetida = categoriasAdmin.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase() && (!c || x.nombre !== c.nombre));
  if (repetida) return mensajeCategoria(`Ya existe "${repetida.nombre}".`, "error");
  if (c && c.nombre !== nombre &&
      !confirm(`¿Cambiar "${c.nombre}" por "${nombre}"? Se cambia también en todos tus gastos.`)) return;

  $("boton-guardar-categoria").disabled = true;
  const { error } = c
    ? await db.from("categorias").update(fila).eq("nombre", c.nombre)
    : await db.from("categorias").insert(fila);
  let extra = "";
  if (!error && c && c.tiene_presupuesto && !fila.tiene_presupuesto) {
    // Que deje de sumar en lo planificado del ciclo en curso
    const actual = ciclos.find((x) => x.en_curso);
    if (actual) await db.from("presupuestos").delete().eq("ciclo", actual.nombre).eq("categoria", nombre);
    extra = " Ya no tiene presupuesto en el ciclo en curso.";
  }
  if (!error && fila.tiene_presupuesto && (!c || !c.tiene_presupuesto)) {
    extra = " Ponele su presupuesto arriba, en \"Corregir\" el ciclo en curso.";
  }
  $("boton-guardar-categoria").disabled = false;
  if (error) return mensajeCategoria("No se guardó: " + error.message, "error");

  cerrarPanelCategoria();
  await Promise.all([abrirCategorias(), cargarListas()]);
  avisoCategorias(`Listo: ${(fila.emoji ? fila.emoji + " " : "") + nombre} ${c ? "guardada" : "creada"}.${extra}`);
  if (extra.includes("Corregir")) abrirCiclo(); // muestra el campo de presupuesto nuevo
});
