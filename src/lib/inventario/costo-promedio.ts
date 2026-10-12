/**
 * Costo Promedio Ponderado (CPP) móvil — función pura, testeable sin BD.
 *
 * Reemplaza el comportamiento anterior (que "pisaba" costo_promedio con el
 * costo de la última compra, ver compras-pg.ts). Ahora cada ENTRADA recalcula
 * el promedio ponderado por las unidades existentes y las que ingresan:
 *
 *   nuevo_costo = (stock_base · costo_actual + cantidad_in · costo_in)
 *                 ------------------------------------------------------
 *                            (stock_base + cantidad_in)
 *
 * donde stock_base = max(stock_actual, 0) para no ponderar con stock negativo
 * (producto sobrevendido); en ese caso el costo entrante define el nuevo costo.
 */

export const CPP_DECIMALES = 4;

export function redondearCosto(valor: number, decimales: number = CPP_DECIMALES): number {
  if (!Number.isFinite(valor)) return 0;
  const f = Math.pow(10, decimales);
  return Math.round(valor * f) / f;
}

export interface CppResultado {
  nuevoStock: number;
  nuevoCosto: number;
}

/**
 * Calcula stock y costo promedio ponderado tras una ENTRADA de `cantidadIn`
 * unidades a `costoIn` por unidad.
 *
 * - `cantidadIn <= 0`: no es una entrada válida de costeo → solo ajusta stock,
 *   mantiene el costo actual.
 * - stock base (previo, acotado a >= 0) + cantidadIn <= 0: no se puede ponderar
 *   → el costo entrante define el nuevo costo.
 */
export function calcularCostoPromedioPonderado(
  stockActual: number,
  costoActual: number,
  cantidadIn: number,
  costoIn: number
): CppResultado {
  const stockPrev = Number.isFinite(stockActual) ? stockActual : 0;
  const costoPrev = Number.isFinite(costoActual) && costoActual > 0 ? costoActual : 0;
  const qtyIn = Number.isFinite(cantidadIn) ? cantidadIn : 0;
  const cIn = Number.isFinite(costoIn) && costoIn > 0 ? costoIn : 0;

  const nuevoStock = stockPrev + qtyIn;

  // Entrada no positiva: no participa del costeo, solo mueve stock.
  if (qtyIn <= 0) {
    return { nuevoStock, nuevoCosto: redondearCosto(costoPrev) };
  }

  const base = Math.max(stockPrev, 0);
  const denom = base + qtyIn;
  if (denom <= 0) {
    return { nuevoStock, nuevoCosto: redondearCosto(cIn) };
  }

  const nuevoCosto = (base * costoPrev + qtyIn * cIn) / denom;
  return { nuevoStock, nuevoCosto: redondearCosto(nuevoCosto) };
}
