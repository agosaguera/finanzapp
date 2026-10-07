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

// Muestra un número como lo leés vos: 45.000,5 → "45.000,50"
function formatearMonto(n, divisa) {
  const texto = n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (divisa === "USD" ? "US$ " : "$ ") + texto;
}

if (typeof module !== "undefined") module.exports = { leerMonto, formatearMonto };
