/**
 * Helpers de código de barras EAN-13 (numérico, escaneable).
 *
 * EAN-13 = 12 dígitos + 1 dígito verificador (checksum). El verificador se
 * calcula con pesos alternados 1/3 sobre los primeros 12 dígitos.
 */

/** Dígito verificador EAN-13 para una cadena de 12 dígitos. */
export function ean13CheckDigit(d12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = d12.charCodeAt(i) - 48; // '0' = 48
    sum += i % 2 === 0 ? n : n * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Valida que `code` sea un EAN-13 (13 dígitos + verificador correcto). */
export function validarEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === code[12];
}

/** Solo dígitos (para validar barcodes escaneados/tipeados). */
export function esNumerico(code: string): boolean {
  return /^\d+$/.test(code);
}

/**
 * Genera un EAN-13 numérico con dígito verificador válido.
 * Usa el prefijo GS1 de Paraguay (779) como cabecera informativa; el resto
 * son dígitos aleatorios. La unicidad real la garantiza el índice único de la
 * tabla (la UI regenera si la BD rechaza un duplicado).
 */
export function generarEan13(): string {
  let base = "779"; // prefijo país (informativo)
  for (let i = 0; i < 9; i++) base += Math.floor(Math.random() * 10);
  return base + ean13CheckDigit(base);
}
