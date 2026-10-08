// =====================================================================
// Pantalla de cuotas (paso 8): qué debo y cuánto margen tengo
// Lee cuotas_vigentes, proyeccion_cuotas y resumen_cuotas del paso 3.
// Todo se calcula desde hoy, por eso no tiene selector de ciclo.
// Cada cuota sale una sola vez (adiós celu mamá × 3).
// =====================================================================

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-11-01" → "nov 2026"
function mesCorto(iso) {
  const [a, m] = iso.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}

function mensajeCuotas(texto) {
  $("cuotas-mensaje").textContent = texto;
  $("cuotas-mensaje").hidden = !texto;
}

async function abrirCuotas() {
  mensajeCuotas("");
  const [res, cuo, pro] = await Promise.all([
    db.from("resumen_cuotas").select("*"),
    db.from("cuotas_vigentes").select("*").order("fecha_fin"),
    db.from("proyeccion_cuotas").select("*").order("mes"),
  ]);
  if (res.error || cuo.error || pro.error) {
    return mensajeCuotas("No pude leer las cuotas. ¿Corriste el paso 4 en Supabase?");
  }
  mostrarResumenCuotas(res.data[0], cuo.data);
  mostrarListaCuotas(cuo.data);
  mostrarProyeccion(pro.data);
}

function mostrarResumenCuotas(r, cuotas) {
  // Si no hay ciclo en curso la vista no trae fila: lo calculo con lo que hay
  const comprometido = r ? r.total_comprometido : cuotas.reduce((t, c) => t + Number(c.total_restante), 0);
  ponerNumero("n-comprometido", comprometido);
  ponerNumero("n-cuota-mes", r ? r.cuota_este_mes : null, "Sin datos");
  ponerNumero("n-margen", r ? r.margen : null, "Sin datos");

  const semaforo = r ? r.semaforo : "Sin datos";
  const clase = { Verde: "verde", Amarillo: "amarillo", Rojo: "rojo" }[semaforo] || "sin-datos";
  $("margen-semaforo").textContent = clase === "sin-datos" ? "" : semaforo; // "Sin datos" ya está en el número
  $("margen-semaforo").className = "semaforo " + clase;
  $("margen-ayuda").textContent = !r || r.margen === null
    ? "El ciclo en curso no tiene presupuesto cargado, así que no hay margen calculado."
    : "Es el 20 % de lo libre para gastar del ciclo en curso: lo que podrías sumar en cuotas por mes.";
}

function mostrarListaCuotas(cuotas) {
  const ul = $("lista-cuotas");
  if (!cuotas.length) {
    ul.innerHTML = '<li class="vacio">No tenés cuotas pendientes.</li>';
    return;
  }
  ul.innerHTML = cuotas.map((c) => {
    const meses = Number(c.meses_restantes);
    const porMes = c.divisa === "USD"
      ? `${formatearMonto(Number(c.monto), "USD")} (${formatearPesos(Number(c.monto_ars))})`
      : formatearPesos(Number(c.monto_ars));
    return `
    <li>
      <div class="crece">
        <strong>${escapar(c.detalle)}</strong>
        <small>${porMes} por mes · último pago ${mesCorto(c.fecha_fin)}</small>
      </div>
      <span class="importe">${formatearPesos(Number(c.total_restante))}
        <small>${meses} ${meses === 1 ? "mes" : "meses"}</small></span>
    </li>`;
  }).join("");
}

// Una barra por mes: cuánto vas a pagar de cuotas y de qué
function mostrarProyeccion(filas) {
  const ul = $("lista-proyeccion");
  if (!filas.length) {
    ul.innerHTML = '<li class="vacio">Sin cuotas de acá en adelante.</li>';
    return;
  }
  const porMes = new Map();
  filas.forEach((f) => {
    const m = porMes.get(f.mes) || { total: 0, detalles: [] };
    m.total += Number(f.monto_ars);
    m.detalles.push(f.detalle);
    porMes.set(f.mes, m);
  });
  const maximo = Math.max(...[...porMes.values()].map((m) => m.total));
  ul.innerHTML = [...porMes.entries()].map(([mes, m]) => `
    <li>
      <div class="fila">
        <span>${mesCorto(mes)}</span>
        <span>${formatearPesos(m.total)}</span>
      </div>
      <div class="barra-uso"><div class="marca" style="width:${maximo > 0 ? (m.total / maximo) * 100 : 0}%"></div></div>
      <small>${m.detalles.map(escapar).join(", ")}</small>
    </li>`).join("");
}
