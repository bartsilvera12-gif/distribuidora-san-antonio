/**
 * QA unitario (sin BD) de la lógica de carga histórica:
 *   - calcularCostoPromedioPonderado (CPP móvil)
 *   - validarFechaOperacion / esFechaHistorica
 *
 * Uso: npm run qa:carga-historica
 */
import {
  calcularCostoPromedioPonderado as cpp,
  redondearCosto,
} from "../src/lib/inventario/costo-promedio";
import {
  validarFechaOperacion,
  esFechaHistorica,
} from "../src/lib/fechas/carga-historica";

let fallos = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.error(`  ✗ ${nombre}`, extra ?? "");
  }
}

console.log("── Costo Promedio Ponderado (CPP) ──");

// 1) Caso clásico: 10u@100 + 10u@200 => stock 20, costo 150 (NO 200 como el bug anterior)
{
  const r = cpp(10, 100, 10, 200);
  check("10@100 + 10@200 => stock 20, costo 150", r.nuevoStock === 20 && r.nuevoCosto === 150, r);
}

// 2) Stock inicial 0: la primera compra define el costo
{
  const r = cpp(0, 0, 5, 300);
  check("0 stock + 5@300 => stock 5, costo 300", r.nuevoStock === 5 && r.nuevoCosto === 300, r);
}

// 3) Ponderación desigual: 3u@1000 + 1u@2000 => costo 1250
{
  const r = cpp(3, 1000, 1, 2000);
  check("3@1000 + 1@2000 => stock 4, costo 1250", r.nuevoStock === 4 && r.nuevoCosto === 1250, r);
}

// 4) Stock negativo previo (sobreventa): no pondera con negativo, usa costo entrante
{
  const r = cpp(-5, 100, 10, 500);
  check("-5 stock + 10@500 => stock 5, costo 500 (no pondera negativo)", r.nuevoStock === 5 && r.nuevoCosto === 500, r);
}

// 5) Entrada no positiva: no cambia el costo
{
  const r = cpp(10, 100, 0, 999);
  check("10@100 + 0@999 => costo se mantiene 100", r.nuevoStock === 10 && r.nuevoCosto === 100, r);
}

// 6) Redondeo a 4 decimales: 1u@100 + 2u@101 => (100+202)/3 = 100.6667
{
  const r = cpp(1, 100, 2, 101);
  check("promedio con redondeo 4 dec => 100.6667", r.nuevoCosto === redondearCosto(302 / 3), r);
}

console.log("── Validación de fecha de operación ──");

const CORTE = "2026-10-01";
const HOY = "2026-10-12";

// a) Fecha de hoy: siempre ok, no histórica, no requiere flag
{
  const v = validarFechaOperacion({ fecha: HOY, fechaCorte: CORTE, cargaHistoricaHabilitada: false, hoy: HOY });
  check("hoy => ok, no histórica, sin flag", v.ok && !v.esHistorico, v);
}

// b) Fecha de junio con carga habilitada => ok e histórica
{
  const v = validarFechaOperacion({ fecha: "2026-06-15", fechaCorte: CORTE, cargaHistoricaHabilitada: true, hoy: HOY });
  check("junio + habilitada => ok e histórica", v.ok && v.esHistorico, v);
}

// c) Fecha de junio SIN carga habilitada => rechazada
{
  const v = validarFechaOperacion({ fecha: "2026-06-15", fechaCorte: CORTE, cargaHistoricaHabilitada: false, hoy: HOY });
  check("junio sin habilitar => rechazada", !v.ok && v.error != null, v);
}

// d) Fecha futura => rechazada aunque esté habilitada
{
  const v = validarFechaOperacion({ fecha: "2026-12-31", fechaCorte: CORTE, cargaHistoricaHabilitada: true, hoy: HOY });
  check("futura => rechazada", !v.ok, v);
}

// e) Entre corte y hoy (posterior al corte) con habilitada => ok, NO histórica
{
  const v = validarFechaOperacion({ fecha: "2026-10-05", fechaCorte: CORTE, cargaHistoricaHabilitada: true, hoy: HOY });
  check("entre corte y hoy => ok, no histórica", v.ok && !v.esHistorico, v);
}

// f) esFechaHistorica directa
{
  check("esFechaHistorica junio<corte => true", esFechaHistorica("2026-06-01", CORTE) === true);
  check("esFechaHistorica octubre>=corte => false", esFechaHistorica("2026-10-10", CORTE) === false);
}

console.log("");
if (fallos > 0) {
  console.error(`✗ ${fallos} prueba(s) fallaron`);
  process.exit(1);
} else {
  console.log("✓ Todas las pruebas pasaron");
}
