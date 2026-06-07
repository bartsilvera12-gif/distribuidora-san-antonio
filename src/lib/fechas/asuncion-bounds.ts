/**
 * Límites de día / mes en zona horaria Paraguay (America/Asuncion, UTC-4 fijo,
 * sin horario de verano desde 2024) expresados como ISO UTC, para filtrar
 * columnas timestamptz en SQL (`fecha >= start AND fecha <= end`).
 *
 * Helper neutral en `lib/fechas` (no acoplar Compras/Proveedores a otro módulo).
 */

const TZ = "America/Asuncion";

/** YYYY-MM-DD del "hoy" en Asunción. */
function asuncionYmd(now: Date): string {
  // en-CA da formato YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Año y mes (1-12) del "ahora" en Asunción. */
function asuncionYearMonth(now: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

/** Inicio y fin (inclusive) del día de hoy en Asunción, como ISO UTC. */
export function asuncionDayBoundsUtc(now: Date = new Date()): { start: string; end: string } {
  const ymd = asuncionYmd(now);
  const start = new Date(`${ymd}T00:00:00.000-04:00`);
  const end = new Date(`${ymd}T23:59:59.999-04:00`);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Inicio y fin (inclusive) del mes actual en Asunción, como ISO UTC. */
export function asuncionMonthBoundsUtc(now: Date = new Date()): { start: string; end: string } {
  const { year, month } = asuncionYearMonth(now);
  const mm = String(month).padStart(2, "0");
  const start = new Date(`${year}-${mm}-01T00:00:00.000-04:00`);
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const nextMM = String(nextM).padStart(2, "0");
  const end = new Date(`${nextY}-${nextMM}-01T00:00:00.000-04:00`);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
