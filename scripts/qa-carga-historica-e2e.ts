/**
 * E2E de LÓGICA (sin base de datos) de la carga histórica, con datos ficticios.
 * Simula un escenario junio→octubre 2026 aplicando las MISMAS reglas que el
 * servidor y verifica: stock, costo promedio (CPP), caja, cuentas por cobrar y
 * la protección SIFEN (guard real con un cliente Supabase falso).
 *
 * No conecta a ninguna base. La prueba end-to-end contra staging real queda
 * pendiente de credenciales (ver docs/CARGA_HISTORICA_SETUP.md).
 *
 * Uso: npm run qa:carga-historica-e2e
 */
import { calcularCostoPromedioPonderado } from "../src/lib/inventario/costo-promedio";
import {
  validarFechaOperacion,
  impactaSaldosEnVivo,
  costoMovimientoVenta,
} from "../src/lib/fechas/carga-historica";
import { estadoFacturaParaUi } from "../src/lib/gestion-clientes/estado-factura-ui";
import { loadValidatedSifenPayload } from "../src/lib/sifen/load-factura-payload";
import type { AppSupabaseClient } from "../src/lib/supabase/schema";

const CORTE = "2026-10-01";
const HOY = "2026-10-12";
const CFG = { fechaCorte: CORTE, cargaHistoricaHabilitada: true, hoy: HOY };

let fallos = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.error(`  ✗ ${nombre}`, extra ?? ""); }
}

// ── Estado "en vivo" sembrado por el saldo inicial a la fecha de corte ────────
const prod = { stock: 100, costo: 1000 }; // Producto A: 100u @ 1000
let caja = 500_000;                        // caja inicial
const cxc: Array<{ fecha: string; venc: string; monto: number; saldo: number; estado: string; esHist: boolean }> = [];

console.log("── Escenario carga histórica junio→octubre (ficticio) ──");

// 1) COMPRA HISTÓRICA (10-jun): no debe tocar stock/costo en vivo
{
  const v = validarFechaOperacion({ fecha: "2026-06-10", ...CFG });
  check("compra 10-jun validada como histórica", v.ok && v.esHistorico, v);
  if (impactaSaldosEnVivo(v.esHistorico)) {
    prod.stock += 50; // NO debería ejecutarse
  }
  check("compra histórica NO cambió stock en vivo (sigue 100)", prod.stock === 100, prod);
}

// 2) COMPRA EN VIVO (05-oct): CPP ponderado
{
  const v = validarFechaOperacion({ fecha: "2026-10-05", ...CFG });
  check("compra 05-oct validada en vivo", v.ok && !v.esHistorico, v);
  const r = calcularCostoPromedioPonderado(prod.stock, prod.costo, 50, 1200);
  prod.stock = r.nuevoStock; prod.costo = r.nuevoCosto;
  // (100*1000 + 50*1200)/150 = 1066.6667
  check("CPP tras compra en vivo => stock 150, costo 1066.6667", prod.stock === 150 && prod.costo === 1066.6667, prod);
}

// 3) VENTA HISTÓRICA (20-jun) con costo manual 900: no toca stock; costo mov = manual
{
  const v = validarFechaOperacion({ fecha: "2026-06-20", ...CFG });
  const costoMov = costoMovimientoVenta(v.esHistorico, 900, prod.costo);
  if (impactaSaldosEnVivo(v.esHistorico)) prod.stock -= 30; // NO
  check("venta histórica NO cambió stock (sigue 150)", prod.stock === 150, prod);
  check("venta histórica usa costo MANUAL 900 (no el actual)", costoMov === 900, { costoMov });
}

// 4) VENTA EN VIVO (06-oct) 20u: descuenta stock; costo mov = costo actual
{
  const v = validarFechaOperacion({ fecha: "2026-10-06", ...CFG });
  const costoMov = costoMovimientoVenta(v.esHistorico, null, prod.costo);
  if (impactaSaldosEnVivo(v.esHistorico)) prod.stock -= 20;
  check("venta en vivo => stock 130", prod.stock === 130, prod);
  check("venta en vivo usa costo actual 1066.6667", costoMov === 1066.6667, { costoMov });
}

// 5) CAJA: pago en vivo suma; pago histórico NO toca caja en vivo
{
  const pagoVivo = validarFechaOperacion({ fecha: "2026-10-07", ...CFG });
  if (impactaSaldosEnVivo(pagoVivo.esHistorico)) caja += 200_000;
  const pagoHist = validarFechaOperacion({ fecha: "2026-06-25", ...CFG });
  if (impactaSaldosEnVivo(pagoHist.esHistorico)) caja += 999_999; // NO
  check("caja: solo el pago en vivo sumó (700.000)", caja === 700_000, { caja });
}

// 6) CUENTAS POR COBRAR: factura histórica abierta aparece como vencida vs hoy
{
  const v = validarFechaOperacion({ fecha: "2026-06-15", ...CFG });
  cxc.push({ fecha: "2026-06-15", venc: "2026-07-15", monto: 300_000, saldo: 300_000, estado: "Pendiente", esHist: v.esHistorico });
  const f = cxc[0];
  const estadoUi = estadoFacturaParaUi({ estado: f.estado, saldo: f.saldo, fecha_vencimiento: f.venc }, HOY);
  check("CxC histórica abierta se muestra Vencido (venc < hoy)", estadoUi === "Vencido", { estadoUi });
  check("CxC histórica marcada es_historico", f.esHist === true, f);
  const totalCxC = cxc.reduce((s, x) => s + x.saldo, 0);
  check("saldo CxC pendiente = 300.000", totalCxC === 300_000, { totalCxC });
}

// 7) No se permite backdating si la carga está DESHABILITADA
{
  const v = validarFechaOperacion({ fecha: "2026-06-01", fechaCorte: CORTE, cargaHistoricaHabilitada: false, hoy: HOY });
  check("backdating bloqueado si carga histórica deshabilitada", !v.ok, v);
}

// ── 8) PROTECCIÓN SIFEN: guard real con Supabase falso ────────────────────────
function fakeSupabase(facturaRow: Record<string, unknown> | null): AppSupabaseClient {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: facturaRow, error: null });
  // thenable (para queries awaited sin maybeSingle, p.ej. items)
  builder.then = (res: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: facturaRow ?? [], error: null }).then(res);
  return { from: () => builder } as unknown as AppSupabaseClient;
}

async function main() {
  console.log("── Protección SIFEN (guard real) ──");
  const facturaHistorica = {
    id: "f-hist", cliente_id: "c1", numero_factura: "HIST-x", fecha: "2026-06-15",
    tipo: "contado", moneda: "GS", monto: 300_000, saldo: 300_000, es_historico: true,
  };
  const res = await loadValidatedSifenPayload(fakeSupabase(facturaHistorica), "emp1", "f-hist");
  check(
    "factura histórica NO emitible a SIFEN (bloqueada por el guard)",
    res.ok === false && res.error.status === 400 && /histór/i.test(res.error.message),
    res
  );

  console.log("");
  if (fallos > 0) { console.error(`✗ ${fallos} verificación(es) fallaron`); process.exit(1); }
  console.log("✓ E2E de lógica OK — stock, CPP, caja, CxC y protección SIFEN verificados (datos ficticios)");
}

main().catch((e) => { console.error(e); process.exit(1); });
