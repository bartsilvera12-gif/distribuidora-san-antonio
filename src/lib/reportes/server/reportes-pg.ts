/**
 * Agregados SQL server-side para el módulo Reportes (schema sanantonio).
 * Solo lectura sobre ventas/compras/gastos/proveedores. Mismo patrón de pool
 * que compras-pg / proveedores-reportes-pg.
 *
 * `start`/`end` = límites timestamptz del mes (para ventas/compras, fecha tz).
 * `mesInicio` = "YYYY-MM-01" (para gastos.fecha que es DATE).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import type {
  EstadoCuentaReporte,
  VentasReporte,
  ComprasReporte,
  ProveedoresReporte,
  MovimientoEstadoCuenta,
  VentaReporteRow,
  ItemVendidoRow,
  CompraReporteRow,
  ItemCompradoRow,
  ProveedorReporteRow,
  ConciliacionReporte,
  ConciliacionRow,
} from "@/lib/reportes/types";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export interface MesBounds {
  mes: string;
  start: string;
  end: string;
  mesInicio: string; // YYYY-MM-01
}

const num = (v: unknown): number => Number(v ?? 0) || 0;

// ── Estado de cuenta ─────────────────────────────────────────────────────────

export async function getEstadoCuenta(
  schemaRaw: string,
  empresaId: string,
  b: MesBounds
): Promise<EstadoCuentaReporte> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tVentas = quoteSchemaTable(schema, "ventas");
  const tCompras = quoteSchemaTable(schema, "compras");
  const tGastos = quoteSchemaTable(schema, "gastos");
  const p = pool();

  const ventasQ = p.query<{ total: number }>(
    `SELECT COALESCE(SUM(total),0)::float8 AS total FROM ${tVentas}
      WHERE empresa_id=$1::uuid AND fecha>=$2::timestamptz AND fecha<=$3::timestamptz`,
    [empresaId, b.start, b.end]
  );
  const comprasQ = p.query<{ total: number }>(
    `SELECT COALESCE(SUM(total),0)::float8 AS total FROM ${tCompras}
      WHERE empresa_id=$1::uuid AND fecha>=$2::timestamptz AND fecha<=$3::timestamptz`,
    [empresaId, b.start, b.end]
  );
  const gastosQ = p.query<{ total: number }>(
    `SELECT COALESCE(SUM(monto),0)::float8 AS total FROM ${tGastos}
      WHERE empresa_id=$1::uuid AND fecha>=$2::date AND fecha < ($2::date + interval '1 month')`,
    [empresaId, b.mesInicio]
  );
  const porCobrarQ = p.query<{ total: number }>(
    `SELECT COALESCE(SUM(total),0)::float8 AS total FROM ${tVentas}
      WHERE empresa_id=$1::uuid AND tipo_venta='CREDITO' AND fecha>=$2::timestamptz AND fecha<=$3::timestamptz`,
    [empresaId, b.start, b.end]
  );
  const porPagarQ = p.query<{ total: number }>(
    `SELECT COALESCE(SUM(total),0)::float8 AS total FROM ${tCompras}
      WHERE empresa_id=$1::uuid AND tipo_pago='credito' AND fecha>=$2::timestamptz AND fecha<=$3::timestamptz`,
    [empresaId, b.start, b.end]
  );
  const movsQ = p.query<MovimientoEstadoCuenta>(
    `SELECT fecha, tipo, referencia, descripcion, entrada, salida FROM (
        SELECT fecha, 'Venta'::text AS tipo, numero_control AS referencia,
               'Venta a cliente'::text AS descripcion, total::float8 AS entrada, 0::float8 AS salida
          FROM ${tVentas}
         WHERE empresa_id=$1::uuid AND fecha>=$2::timestamptz AND fecha<=$3::timestamptz
        UNION ALL
        SELECT fecha, 'Compra'::text, numero_control, proveedor_nombre, 0::float8, total::float8
          FROM ${tCompras}
         WHERE empresa_id=$1::uuid AND fecha>=$2::timestamptz AND fecha<=$3::timestamptz
        UNION ALL
        SELECT fecha::timestamptz, 'Gasto'::text, COALESCE(categoria,''),
               COALESCE(descripcion,''), 0::float8, monto::float8
          FROM ${tGastos}
         WHERE empresa_id=$1::uuid AND fecha>=$4::date AND fecha < ($4::date + interval '1 month')
      ) m ORDER BY fecha ASC`,
    [empresaId, b.start, b.end, b.mesInicio]
  );

  const [ventas, compras, gastos, porCobrar, porPagar, movs] = await Promise.all([
    ventasQ, comprasQ, gastosQ, porCobrarQ, porPagarQ, movsQ,
  ]);

  const ingresosVentas = num(ventas.rows[0]?.total);
  const comprasTotal = num(compras.rows[0]?.total);
  const gastosTotal = num(gastos.rows[0]?.total);

  return {
    mes: b.mes,
    ingresosVentas,
    compras: comprasTotal,
    gastos: gastosTotal,
    resultado: ingresosVentas - comprasTotal - gastosTotal,
    porCobrar: num(porCobrar.rows[0]?.total),
    porPagar: num(porPagar.rows[0]?.total),
    movimientos: movs.rows.map((m) => ({
      fecha: m.fecha,
      tipo: m.tipo,
      referencia: m.referencia,
      descripcion: m.descripcion,
      entrada: num(m.entrada),
      salida: num(m.salida),
    })),
  };
}

// ── Ventas ───────────────────────────────────────────────────────────────────

export async function getReporteVentas(
  schemaRaw: string,
  empresaId: string,
  b: MesBounds
): Promise<VentasReporte> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tV = quoteSchemaTable(schema, "ventas");
  const tVI = quoteSchemaTable(schema, "ventas_items");
  const p = pool();
  const per = `v.empresa_id=$1::uuid AND v.fecha>=$2::timestamptz AND v.fecha<=$3::timestamptz`;
  const args = [empresaId, b.start, b.end];

  const totQ = p.query<{ cantidad: number; total: number }>(
    `SELECT count(*)::int AS cantidad, COALESCE(SUM(total),0)::float8 AS total
       FROM ${tV} v WHERE ${per}`, args);
  const masAltaQ = p.query<{ numero_control: string; total: number }>(
    `SELECT numero_control, total::float8 AS total FROM ${tV} v WHERE ${per} ORDER BY total DESC LIMIT 1`, args);
  const tipoPrecioQ = p.query<{ tipo_precio: string; total: number }>(
    `SELECT vi.tipo_precio, COALESCE(SUM(vi.total_linea),0)::float8 AS total
       FROM ${tVI} vi JOIN ${tV} v ON v.id=vi.venta_id WHERE ${per}
      GROUP BY vi.tipo_precio`, args);
  const masVendidoQ = p.query<{ producto_nombre: string; cantidad: number }>(
    `SELECT vi.producto_nombre, SUM(vi.cantidad)::float8 AS cantidad
       FROM ${tVI} vi JOIN ${tV} v ON v.id=vi.venta_id WHERE ${per}
      GROUP BY vi.producto_id, vi.producto_nombre ORDER BY cantidad DESC LIMIT 1`, args);
  const mayorFactQ = p.query<{ producto_nombre: string; total: number }>(
    `SELECT vi.producto_nombre, SUM(vi.total_linea)::float8 AS total
       FROM ${tVI} vi JOIN ${tV} v ON v.id=vi.venta_id WHERE ${per}
      GROUP BY vi.producto_id, vi.producto_nombre ORDER BY total DESC LIMIT 1`, args);
  const ventasQ = p.query<VentaReporteRow>(
    `SELECT v.id, v.numero_control, v.fecha, v.subtotal::float8 AS subtotal,
            v.monto_iva::float8 AS monto_iva, v.total::float8 AS total, v.metodo_pago, v.estado,
            (SELECT count(*) FROM ${tVI} vi WHERE vi.venta_id=v.id)::int AS items_count
       FROM ${tV} v WHERE ${per} ORDER BY v.fecha DESC`, args);
  const itemsQ = p.query<ItemVendidoRow>(
    `SELECT v.numero_control, v.fecha, vi.producto_nombre, vi.sku, vi.cantidad::float8 AS cantidad,
            vi.tipo_precio, vi.precio_venta::float8 AS precio_venta, vi.subtotal::float8 AS subtotal,
            vi.monto_iva::float8 AS monto_iva, vi.total_linea::float8 AS total_linea
       FROM ${tVI} vi JOIN ${tV} v ON v.id=vi.venta_id WHERE ${per} ORDER BY v.fecha DESC`, args);

  const [tot, masAlta, tipoPrecio, masVendido, mayorFact, ventas, items] = await Promise.all([
    totQ, masAltaQ, tipoPrecioQ, masVendidoQ, mayorFactQ, ventasQ, itemsQ,
  ]);

  const cantidad = num(tot.rows[0]?.cantidad);
  const totalVendido = num(tot.rows[0]?.total);
  const porTipoPrecio = { minorista: 0, mayorista: 0, costo: 0 };
  for (const r of tipoPrecio.rows) {
    if (r.tipo_precio === "minorista") porTipoPrecio.minorista = num(r.total);
    else if (r.tipo_precio === "mayorista") porTipoPrecio.mayorista = num(r.total);
    else if (r.tipo_precio === "costo") porTipoPrecio.costo = num(r.total);
  }

  return {
    mes: b.mes,
    totalVendido,
    cantidad,
    ticketPromedio: cantidad > 0 ? totalVendido / cantidad : 0,
    ventaMasAlta: masAlta.rows[0] ? { numero_control: masAlta.rows[0].numero_control, total: num(masAlta.rows[0].total) } : null,
    porTipoPrecio,
    productoMasVendido: masVendido.rows[0] ? { producto_nombre: masVendido.rows[0].producto_nombre, cantidad: num(masVendido.rows[0].cantidad) } : null,
    productoMayorFacturacion: mayorFact.rows[0] ? { producto_nombre: mayorFact.rows[0].producto_nombre, total: num(mayorFact.rows[0].total) } : null,
    ventas: ventas.rows.map((v) => ({ ...v, subtotal: num(v.subtotal), monto_iva: num(v.monto_iva), total: num(v.total), items_count: num(v.items_count) })),
    items: items.rows.map((i) => ({ ...i, cantidad: num(i.cantidad), precio_venta: num(i.precio_venta), subtotal: num(i.subtotal), monto_iva: num(i.monto_iva), total_linea: num(i.total_linea) })),
  };
}

// ── Compras ──────────────────────────────────────────────────────────────────

export async function getReporteCompras(
  schemaRaw: string,
  empresaId: string,
  b: MesBounds
): Promise<ComprasReporte> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "compras");
  const tCI = quoteSchemaTable(schema, "compras_items");
  const p = pool();
  const per = `c.empresa_id=$1::uuid AND c.fecha>=$2::timestamptz AND c.fecha<=$3::timestamptz`;
  const args = [empresaId, b.start, b.end];

  const totQ = p.query<{ cantidad: number; total: number }>(
    `SELECT count(*)::int AS cantidad, COALESCE(SUM(total),0)::float8 AS total FROM ${tC} c WHERE ${per}`, args);
  const masAltaQ = p.query<{ numero_control: string; proveedor_nombre: string; total: number }>(
    `SELECT numero_control, proveedor_nombre, total::float8 AS total FROM ${tC} c WHERE ${per} ORDER BY total DESC LIMIT 1`, args);
  const provQ = p.query<{ proveedor_nombre: string; total: number }>(
    `SELECT proveedor_nombre, SUM(total)::float8 AS total FROM ${tC} c WHERE ${per}
      GROUP BY proveedor_id, proveedor_nombre ORDER BY total DESC LIMIT 1`, args);
  // Producto: líneas (multiproducto) + cabecera legacy sin items.
  const prodCantQ = p.query<{ producto_nombre: string; cantidad: number }>(
    `SELECT producto_nombre, SUM(cantidad)::float8 AS cantidad FROM (
        SELECT ci.producto_id, ci.producto_nombre, ci.cantidad FROM ${tCI} ci JOIN ${tC} c ON c.id=ci.compra_id WHERE ${per}
        UNION ALL
        SELECT c.producto_id, c.producto_nombre, c.cantidad FROM ${tC} c WHERE ${per} AND NOT EXISTS (SELECT 1 FROM ${tCI} ci WHERE ci.compra_id=c.id)
      ) g GROUP BY producto_id, producto_nombre ORDER BY cantidad DESC LIMIT 1`, args);
  const prodGastoQ = p.query<{ producto_nombre: string; gasto: number }>(
    `SELECT producto_nombre, SUM(gasto)::float8 AS gasto FROM (
        SELECT ci.producto_id, ci.producto_nombre, ci.total_linea AS gasto FROM ${tCI} ci JOIN ${tC} c ON c.id=ci.compra_id WHERE ${per}
        UNION ALL
        SELECT c.producto_id, c.producto_nombre, c.total AS gasto FROM ${tC} c WHERE ${per} AND NOT EXISTS (SELECT 1 FROM ${tCI} ci WHERE ci.compra_id=c.id)
      ) g GROUP BY producto_id, producto_nombre ORDER BY gasto DESC LIMIT 1`, args);
  const comprasQ = p.query<CompraReporteRow>(
    `SELECT c.id, c.numero_control, c.fecha, c.proveedor_nombre, c.subtotal::float8 AS subtotal,
            c.monto_iva::float8 AS monto_iva, c.total::float8 AS total,
            (c.factura_path IS NOT NULL) AS tiene_factura,
            (SELECT count(*) FROM ${tCI} ci WHERE ci.compra_id=c.id)::int AS items_count
       FROM ${tC} c WHERE ${per} ORDER BY c.fecha DESC`, args);
  const itemsQ = p.query<ItemCompradoRow>(
    `SELECT numero_control, fecha, proveedor_nombre, producto_nombre, sku, cantidad, costo_unitario, subtotal, monto_iva, total_linea FROM (
        SELECT c.numero_control, c.fecha, c.proveedor_nombre, ci.producto_nombre, ci.sku,
               ci.cantidad::float8 AS cantidad, ci.costo_unitario::float8 AS costo_unitario,
               ci.subtotal::float8 AS subtotal, ci.monto_iva::float8 AS monto_iva, ci.total_linea::float8 AS total_linea
          FROM ${tCI} ci JOIN ${tC} c ON c.id=ci.compra_id WHERE ${per}
        UNION ALL
        SELECT c.numero_control, c.fecha, c.proveedor_nombre, c.producto_nombre, ''::text,
               c.cantidad::float8, c.costo_unitario::float8, c.subtotal::float8, c.monto_iva::float8, c.total::float8
          FROM ${tC} c WHERE ${per} AND NOT EXISTS (SELECT 1 FROM ${tCI} ci WHERE ci.compra_id=c.id)
      ) it ORDER BY fecha DESC`, args);

  const [tot, masAlta, prov, prodCant, prodGasto, compras, items] = await Promise.all([
    totQ, masAltaQ, provQ, prodCantQ, prodGastoQ, comprasQ, itemsQ,
  ]);

  return {
    mes: b.mes,
    totalComprado: num(tot.rows[0]?.total),
    cantidad: num(tot.rows[0]?.cantidad),
    compraMasAlta: masAlta.rows[0] ? { numero_control: masAlta.rows[0].numero_control, proveedor_nombre: masAlta.rows[0].proveedor_nombre, total: num(masAlta.rows[0].total) } : null,
    proveedorMayor: prov.rows[0] ? { proveedor_nombre: prov.rows[0].proveedor_nombre, total: num(prov.rows[0].total) } : null,
    productoMasComprado: prodCant.rows[0] ? { producto_nombre: prodCant.rows[0].producto_nombre, cantidad: num(prodCant.rows[0].cantidad) } : null,
    productoMayorGasto: prodGasto.rows[0] ? { producto_nombre: prodGasto.rows[0].producto_nombre, gasto: num(prodGasto.rows[0].gasto) } : null,
    compras: compras.rows.map((c) => ({ ...c, subtotal: num(c.subtotal), monto_iva: num(c.monto_iva), total: num(c.total), items_count: num(c.items_count), tiene_factura: c.tiene_factura === true })),
    items: items.rows.map((i) => ({ ...i, cantidad: num(i.cantidad), costo_unitario: num(i.costo_unitario), subtotal: num(i.subtotal), monto_iva: num(i.monto_iva), total_linea: num(i.total_linea) })),
  };
}

// ── Proveedores ──────────────────────────────────────────────────────────────

export async function getReporteProveedores(
  schemaRaw: string,
  empresaId: string,
  b: MesBounds
): Promise<ProveedoresReporte> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tProv = quoteSchemaTable(schema, "proveedores");
  const tC = quoteSchemaTable(schema, "compras");
  const p = pool();

  const totalProvQ = p.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${tProv} WHERE empresa_id=$1::uuid`, [empresaId]);
  const mesQ = p.query<{ proveedores: number; total: number }>(
    `SELECT count(DISTINCT proveedor_id)::int AS proveedores, COALESCE(SUM(total),0)::float8 AS total
       FROM ${tC} WHERE empresa_id=$1::uuid AND fecha>=$2::timestamptz AND fecha<=$3::timestamptz`,
    [empresaId, b.start, b.end]);
  const ultimaQ = p.query<{ numero_control: string; proveedor_nombre: string; total: number; fecha: string }>(
    `SELECT numero_control, proveedor_nombre, total::float8 AS total, fecha
       FROM ${tC} WHERE empresa_id=$1::uuid AND fecha>=$2::timestamptz AND fecha<=$3::timestamptz
      ORDER BY fecha DESC LIMIT 1`, [empresaId, b.start, b.end]);
  // Proveedores con sus métricas del mes (LEFT JOIN para incluir los sin compras).
  const provListQ = p.query<ProveedorReporteRow>(
    `SELECT pr.id, pr.nombre, pr.ruc, pr.telefono,
            COALESCE(cc.cantidad,0)::int AS cantidad,
            COALESCE(cc.total,0)::float8 AS total,
            cc.ultima_compra
       FROM ${tProv} pr
       LEFT JOIN (
         SELECT proveedor_id, count(*)::int AS cantidad, SUM(total)::float8 AS total, MAX(fecha) AS ultima_compra
           FROM ${tC} WHERE empresa_id=$1::uuid AND fecha>=$2::timestamptz AND fecha<=$3::timestamptz
          GROUP BY proveedor_id
       ) cc ON cc.proveedor_id = pr.id
      WHERE pr.empresa_id=$1::uuid
      ORDER BY COALESCE(cc.total,0) DESC, pr.nombre ASC`,
    [empresaId, b.start, b.end]);

  const [totalProv, mes, ultima, provList] = await Promise.all([totalProvQ, mesQ, ultimaQ, provListQ]);

  const conCompras = num(mes.rows[0]?.proveedores);
  const totalComprado = num(mes.rows[0]?.total);

  return {
    mes: b.mes,
    totalProveedores: num(totalProv.rows[0]?.n),
    conCompras,
    totalComprado,
    compraPromedio: conCompras > 0 ? totalComprado / conCompras : 0,
    ultimaCompra: ultima.rows[0] ? { ...ultima.rows[0], total: num(ultima.rows[0].total) } : null,
    proveedores: provList.rows.map((r) => ({ ...r, cantidad: num(r.cantidad), total: num(r.total) })),
  };
}

// ── Conciliación entre cuentas ────────────────────────────────────────────────

export async function getReporteConciliacion(
  schemaRaw: string,
  empresaId: string,
  b: MesBounds
): Promise<ConciliacionReporte> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tD = quoteSchemaTable(schema, "ventas_pagos_detalle");
  const tV = quoteSchemaTable(schema, "ventas");
  const p = pool();

  const q = await p.query<ConciliacionRow>(
    `SELECT d.id, d.fecha, d.metodo_pago,
            d.banco_codigo, d.banco_nombre, d.titular,
            d.monto::float8 AS monto, d.nro_comprobante,
            v.numero_control, v.estado AS venta_estado
       FROM ${tD} d
       LEFT JOIN ${tV} v ON v.id = d.venta_id AND v.empresa_id = d.empresa_id
      WHERE d.empresa_id=$1::uuid AND d.fecha>=$2::timestamptz AND d.fecha<=$3::timestamptz
      ORDER BY d.fecha DESC`,
    [empresaId, b.start, b.end]
  );

  const movimientos: ConciliacionRow[] = q.rows.map((r) => ({ ...r, monto: num(r.monto) }));

  let totalTransferencias = 0;
  let cantidadTransferencias = 0;
  let totalTarjetas = 0;
  let cantidadTarjetas = 0;
  const bancoMap = new Map<string, { cantidad: number; total: number }>();

  for (const m of movimientos) {
    if (m.metodo_pago === "transferencia") {
      totalTransferencias += m.monto;
      cantidadTransferencias += 1;
    } else if (m.metodo_pago === "tarjeta") {
      totalTarjetas += m.monto;
      cantidadTarjetas += 1;
    }
    const key = m.banco_nombre ?? "—";
    const cur = bancoMap.get(key) ?? { cantidad: 0, total: 0 };
    cur.cantidad += 1;
    cur.total += m.monto;
    bancoMap.set(key, cur);
  }

  const porBanco = [...bancoMap.entries()]
    .map(([banco, v]) => ({ banco, cantidad: v.cantidad, total: v.total }))
    .sort((a, c) => c.total - a.total);

  return {
    mes: b.mes,
    totalTransferencias,
    cantidadTransferencias,
    totalTarjetas,
    cantidadTarjetas,
    totalGeneral: totalTransferencias + totalTarjetas,
    cantidadTotal: movimientos.length,
    porBanco,
    movimientos,
  };
}
