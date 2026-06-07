/**
 * Reportería de proveedores (PG directo). Agregados sobre `compras` /
 * `compras_items` para el resumen operativo, columnas del listado y el detalle
 * de proveedor. Mismo patrón de pool que compras-pg / productos-pg.
 *
 * Solo lectura: no modifica datos de ventas/caja/inventario.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export interface MonthBounds {
  monthStart: string;
  monthEnd: string;
}

// ── Resumen operativo (cards arriba del listado) ─────────────────────────────

export interface ResumenProveedores {
  totalProveedores: number;
  conComprasMes: number;
  totalCompradoMes: number;
  proveedorTopMes: { proveedor_id: string; proveedor_nombre: string; total: number } | null;
  ultimaCompra: { numero_control: string; proveedor_nombre: string; total: number; fecha: string } | null;
}

export async function getResumenProveedores(
  schemaRaw: string,
  empresaId: string,
  b: MonthBounds
): Promise<ResumenProveedores> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tProv = quoteSchemaTable(schema, "proveedores");
  const tComp = quoteSchemaTable(schema, "compras");
  const p = pool();

  const totalQ = p.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${tProv} WHERE empresa_id = $1::uuid`,
    [empresaId]
  );
  const mesQ = p.query<{ proveedores: number; total: number }>(
    `SELECT count(DISTINCT proveedor_id)::int AS proveedores, COALESCE(SUM(total), 0)::float8 AS total
       FROM ${tComp}
      WHERE empresa_id = $1::uuid AND fecha >= $2::timestamptz AND fecha <= $3::timestamptz`,
    [empresaId, b.monthStart, b.monthEnd]
  );
  const topQ = p.query<{ proveedor_id: string; proveedor_nombre: string; total: number }>(
    `SELECT proveedor_id, proveedor_nombre, SUM(total)::float8 AS total
       FROM ${tComp}
      WHERE empresa_id = $1::uuid AND fecha >= $2::timestamptz AND fecha <= $3::timestamptz
      GROUP BY proveedor_id, proveedor_nombre
      ORDER BY total DESC LIMIT 1`,
    [empresaId, b.monthStart, b.monthEnd]
  );
  const ultimaQ = p.query<{ numero_control: string; proveedor_nombre: string; total: number; fecha: string }>(
    `SELECT numero_control, proveedor_nombre, total::float8 AS total, fecha
       FROM ${tComp}
      WHERE empresa_id = $1::uuid
      ORDER BY fecha DESC LIMIT 1`,
    [empresaId]
  );

  const [total, mes, top, ultima] = await Promise.all([totalQ, mesQ, topQ, ultimaQ]);
  return {
    totalProveedores: total.rows[0]?.n ?? 0,
    conComprasMes: mes.rows[0]?.proveedores ?? 0,
    totalCompradoMes: mes.rows[0]?.total ?? 0,
    proveedorTopMes: top.rows[0] ?? null,
    ultimaCompra: ultima.rows[0] ?? null,
  };
}

// ── Stats por proveedor (columnas del listado) ───────────────────────────────

export interface ProveedorComprasStat {
  proveedor_id: string;
  cantidad: number;
  total_mes: number;
  ultima_compra: string | null;
}

export async function getComprasStatsPorProveedor(
  schemaRaw: string,
  empresaId: string,
  b: MonthBounds
): Promise<ProveedorComprasStat[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tComp = quoteSchemaTable(schema, "compras");
  const { rows } = await pool().query<ProveedorComprasStat>(
    `SELECT proveedor_id,
            count(*)::int AS cantidad,
            COALESCE(SUM(total) FILTER (WHERE fecha >= $2::timestamptz AND fecha <= $3::timestamptz), 0)::float8 AS total_mes,
            MAX(fecha) AS ultima_compra
       FROM ${tComp}
      WHERE empresa_id = $1::uuid
      GROUP BY proveedor_id`,
    [empresaId, b.monthStart, b.monthEnd]
  );
  return rows;
}

// ── Detalle de proveedor (/proveedores/[id]) ─────────────────────────────────

export interface ProveedorDetalleCompras {
  metricas: { cantidad: number; total: number; ultimaCompra: string | null };
  compras: Array<{
    id: string;
    numero_control: string;
    fecha: string;
    total: number;
    tipo_pago: string;
    items_count: number;
  }>;
  topProductos: Array<{ producto_id: string; producto_nombre: string; cantidad: number; gasto: number }>;
}

export async function getProveedorDetalleCompras(
  schemaRaw: string,
  empresaId: string,
  proveedorId: string
): Promise<ProveedorDetalleCompras> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tComp = quoteSchemaTable(schema, "compras");
  const tItems = quoteSchemaTable(schema, "compras_items");
  const p = pool();

  const metricasQ = p.query<{ cantidad: number; total: number; ultima: string | null }>(
    `SELECT count(*)::int AS cantidad, COALESCE(SUM(total), 0)::float8 AS total, MAX(fecha) AS ultima
       FROM ${tComp} WHERE empresa_id = $1::uuid AND proveedor_id = $2::uuid`,
    [empresaId, proveedorId]
  );
  const comprasQ = p.query<{
    id: string; numero_control: string; fecha: string; total: number; tipo_pago: string; items_count: number;
  }>(
    `SELECT c.id, c.numero_control, c.fecha, c.total::float8 AS total, c.tipo_pago,
            (SELECT count(*) FROM ${tItems} ci WHERE ci.compra_id = c.id)::int AS items_count
       FROM ${tComp} c
      WHERE c.empresa_id = $1::uuid AND c.proveedor_id = $2::uuid
      ORDER BY c.fecha DESC LIMIT 100`,
    [empresaId, proveedorId]
  );
  const topProdQ = p.query<{ producto_id: string; producto_nombre: string; cantidad: number; gasto: number }>(
    `SELECT producto_id, producto_nombre, SUM(cantidad)::float8 AS cantidad, SUM(gasto)::float8 AS gasto FROM (
        SELECT ci.producto_id, ci.producto_nombre, ci.cantidad, ci.total_linea AS gasto
          FROM ${tItems} ci JOIN ${tComp} c ON c.id = ci.compra_id
         WHERE c.empresa_id = $1::uuid AND c.proveedor_id = $2::uuid
        UNION ALL
        SELECT c.producto_id, c.producto_nombre, c.cantidad, c.total AS gasto
          FROM ${tComp} c
         WHERE c.empresa_id = $1::uuid AND c.proveedor_id = $2::uuid
           AND NOT EXISTS (SELECT 1 FROM ${tItems} ci WHERE ci.compra_id = c.id)
      ) g
      GROUP BY producto_id, producto_nombre
      ORDER BY gasto DESC LIMIT 10`,
    [empresaId, proveedorId]
  );

  const [metricas, compras, topProd] = await Promise.all([metricasQ, comprasQ, topProdQ]);
  return {
    metricas: {
      cantidad: metricas.rows[0]?.cantidad ?? 0,
      total: metricas.rows[0]?.total ?? 0,
      ultimaCompra: metricas.rows[0]?.ultima ?? null,
    },
    compras: compras.rows,
    topProductos: topProd.rows,
  };
}
