/**
 * Reglas de fecha para la carga histórica (Opción A: saldos iniciales).
 *
 * - "fecha de corte": desde esta fecha el sistema opera EN VIVO. Las operaciones
 *   con fecha ANTERIOR al corte son "históricas" (es_historico=true): sirven para
 *   que los reportes caigan en su período, pero NO mueven stock/caja en vivo (eso
 *   ya está representado por el saldo inicial cargado a la fecha de corte).
 * - Operaciones con fecha >= corte: normales, impactan stock/caja/CPP.
 *
 * Funciones puras y testeables (no tocan BD).
 */

import { toCalendarDateStr, hoyYmdLocal } from "./calendario";

/** Piso de sanidad: no se aceptan fechas absurdamente viejas. */
export const FECHA_MINIMA_OPERACION = "2000-01-01";

/** ¿La fecha de operación es anterior a la fecha de corte? → histórica. */
export function esFechaHistorica(fechaYmd: string, fechaCorteYmd: string): boolean {
  const f = toCalendarDateStr(fechaYmd);
  const c = toCalendarDateStr(fechaCorteYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(c)) return false;
  return f < c;
}

export interface ValidarFechaParams {
  /** Fecha de la operación (YYYY-MM-DD o ISO). */
  fecha: string;
  /** Fecha de corte de la empresa (YYYY-MM-DD). */
  fechaCorte: string;
  /** Si la empresa tiene habilitada la carga histórica. */
  cargaHistoricaHabilitada: boolean;
  /** Hoy (YYYY-MM-DD); default = hoy local. */
  hoy?: string;
}

export interface ValidarFechaResultado {
  ok: boolean;
  /** Fecha normalizada YYYY-MM-DD (vacío si inválida). */
  fechaNorm: string;
  /** Derivado: true si la fecha es anterior al corte. */
  esHistorico: boolean;
  /** Mensaje de error legible (null si ok). */
  error: string | null;
}

/**
 * Valida la fecha de una operación contra la fecha de corte y "hoy".
 *
 * Reglas:
 *  - Formato válido YYYY-MM-DD.
 *  - No futura (no puede ser mayor a hoy).
 *  - No anterior al piso de sanidad.
 *  - Si es anterior al corte (histórica), la empresa debe tener habilitada la
 *    carga histórica; si no, se rechaza.
 */
export function validarFechaOperacion(p: ValidarFechaParams): ValidarFechaResultado {
  const hoy = p.hoy ? toCalendarDateStr(p.hoy) : hoyYmdLocal();
  const fechaNorm = toCalendarDateStr(p.fecha);
  const corteNorm = toCalendarDateStr(p.fechaCorte);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNorm)) {
    return { ok: false, fechaNorm: "", esHistorico: false, error: "Fecha inválida." };
  }
  if (fechaNorm > hoy) {
    return { ok: false, fechaNorm, esHistorico: false, error: "La fecha no puede ser futura." };
  }
  if (fechaNorm < FECHA_MINIMA_OPERACION) {
    return { ok: false, fechaNorm, esHistorico: false, error: "La fecha es demasiado antigua." };
  }

  const esHistorico = /^\d{4}-\d{2}-\d{2}$/.test(corteNorm) ? fechaNorm < corteNorm : false;

  // Cualquier fecha anterior a hoy (backdating) exige que la empresa tenga
  // habilitada la carga histórica. La operación normal del día (fecha = hoy)
  // nunca necesita el flag.
  const esBackdated = fechaNorm < hoy;
  if (esBackdated && !p.cargaHistoricaHabilitada) {
    return {
      ok: false,
      fechaNorm,
      esHistorico,
      error: "La carga histórica no está habilitada para esta empresa.",
    };
  }

  return { ok: true, fechaNorm, esHistorico, error: null };
}
