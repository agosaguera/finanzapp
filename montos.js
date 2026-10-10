// Lee un monto escrito a mano y lo convierte en número.
// Es la parte que evita el error de 6.99 leído como 699.
//
//   "6,99"      → 6.99    (coma = decimales, como se escribe acá)
//   "6.99"      → 6.99    (punto con 1 o 2 dígitos = decimales)
//   "1.500"     → 1500    (punto con 3 dígitos = miles)
//   "45.000,50" → 45000.5
//   "$ 270.000" → 270000
//
// Devuelve null si no se puede leer sin adivinar.
function leerMonto(texto) {
  return esCuenta(texto) ? leerCuenta(texto) : leerMontoSimple(texto);
}

function leerMontoSimple(texto) {
  let t = String(texto || "").replace(/[\s $]/g, "");
  if (t === "") return null;

  if (t.includes(",")) {
    // Formato argentino: los puntos son miles y la coma es el decimal
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(t)) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(".")) {
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
      t = t.replace(/\./g, "");            // 1.500 o 1.500.000: miles
    } else if (!/^\d+\.\d{1,2}$/.test(t)) {
      return null;                          // 1.5000, 1.2.3: no se adivina
    }
  } else if (!/^\d+$/.test(t)) {
    return null;
  }

  const n = Number(t);
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

// Calculadora: "1.500 + 2.300" → 3800, "45.000 / 3" → 15000.
// Cada número se lee igual que un monto suelto (así 6,99 sigue siendo 6,99).
// Primero se hacen × y ÷, después + y −, como en la escuela.
function esCuenta(texto) {
  return /\d\s*[-+*/x×÷]\s*\d/i.test(String(texto || "").replace(/\$/g, ""));
}

function leerCuenta(texto) {
  const partes = String(texto).replace(/\$/g, "").replace(/[×x]/gi, "*").replace(/÷/g, "/").split(/\s*([-+*/])\s*/);
  if (partes.length % 2 === 0) return null;            // termina en un signo
  const numeros = [], signos = [];
  for (let i = 0; i < partes.length; i++) {
    if (i % 2) { signos.push(partes[i]); continue; }
    const n = leerMontoSimple(partes[i]);
    if (n === null) return null;
    numeros.push(n);
  }
  // × y ÷ primero
  const sumas = [numeros[0]], ops = [];
  signos.forEach((s, i) => {
    const n = numeros[i + 1];
    if (s === "*") sumas[sumas.length - 1] *= n;
    else if (s === "/") sumas[sumas.length - 1] /= n;
    else { ops.push(s); sumas.push(n); }
  });
  const total = sumas.slice(1).reduce((t, n, i) => (ops[i] === "+" ? t + n : t - n), sumas[0]);
  return isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : null;
}

// Muestra un número como lo leés vos: 45.000,5 → "45.000,50"
function formatearMonto(n, divisa) {
  const texto = n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (divisa === "USD" ? "US$ " : "$ ") + texto;
}

// Para los tableros: pesos sin centavos y con signo si es negativo
//   -295175.4 → "−$ 295.175"
function formatearPesos(n) {
  const texto = Math.abs(Math.round(n)).toLocaleString("es-AR");
  return (n < -0.5 ? "−$ " : "$ ") + texto;
}

if (typeof module !== "undefined") module.exports = { leerMonto, formatearMonto, formatearPesos };
