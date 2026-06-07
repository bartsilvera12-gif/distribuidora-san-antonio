/**
 * PG directo para Compras. Mismo patron que productos-pg / proveedores-pg:
 * pool singleton + queries parametrizadas + identifier escape.
 *
 * insertCompra realiza la operacion en transaccion:
 *   1) inserta compra con numero_control generado por secuencia local
 *   2) inserta movimiento ENTRADA (origen=compra) con audit
 *   3) actualiza producto.precio_venta + costo_promedio + stock_actual
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export interface CompraRow {
  id: string;
  empresa_id: string;
  proveedor_id: string;
  proveedor_nombre: string;
  producto_id: string;
  producto_nombre: string;
  cantidad: string | number;
  moneda: string;
  tipo_cambio: string | number;
  costo_unitario_original: string | number;
  costo_unitario: string | number;
  iva_tipo: string;
  subtotal: string | number;
  monto_iva: string | number;
  total: string | number;
  precio_venta: string | number;
  margen_venta: string | number | null;
  tipo_pago: string;
  plazo_dias: number | null;
  nro_timbrado: string;
  numero_control: string;
  estado: string;
  fecha: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  usuario_nombre: string | null;
  factura_bucket: string | null;
  factura_path: string | null;
  factura_nombre_original: string | null;
  factura_mime_type: string | null;
  items_count?: number;
}

const COLS = `
  id, empresa_id, proveedor_id, proveedor_nombre, producto_id, producto_nombre,
  cantidad, moneda, tipo_cambio, costo_unitario_original, costo_unitario,
  iva_tipo, subtotal, monto_iva, total, precio_venta, margen_venta,
  tipo_pago, plazo_dias, nro_timbrado, numero_control, estado, fecha,
  created_at, updated_at, created_by, usuario_nombre,
  factura_bucket, factura_path, factura_nombre_original, factura_mime_type
`;

export interface InsertCompraInput {
  proveedor_id: string;
  proveedor_nombre: string;
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  moneda: string;
  tipo_cambio: number;
  costo_unitario_original: number;
  costo_unitario: number;
  iva_tipo: string;
  subtotal: number;
  monto_iva: number;
  total: number;
  precio_venta: number;
  margen_venta: number | null;
  tipo_pago: string;
  plazo_dias: number | null;
  nro_timbrado: string;
  created_by: string | null;
  usuario_nombre: string | null;
}

export async function listCompras(
  schemaRaw: string,
  empresaId: string
): Promise<CompraRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "compras");
  const tItems = quoteSchemaTable(schema, "compras_items");
  // items_count permite distinguir compras multiproducto (>1) de las legacy
  // mono-producto (0, se leen por los campos inline de `compras`).
  const colsPrefixed = COLS.replace(/\s+/g, " ").trim().split(",").map((c) => `c.${c.trim()}`).join(", ");
  const { rows } = await pool().query<CompraRow>(
    `SELECT ${colsPrefixed},
            (SELECT count(*) FROM ${tItems} ci WHERE ci.compra_id = c.id)::int AS items_count
       FROM ${t} c
      WHERE c.empresa_id = $1::uuid
      ORDER BY c.fecha DESC LIMIT 500`,
    [empresaId]
  );
  return rows;
}

// ── Detalle de una compra ────────────────────────────────────────────────────

export interface CompraItemRow {
  id: string;
  compra_id: string;
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: string | number;
  costo_unitario: string | number;
  iva_tipo: string;
  subtotal: string | number;
  monto_iva: string | number;
  total_linea: string | number;
}

export interface MovimientoCompraRow {
  id: string;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string | null;
  tipo: string;
  cantidad: string | number;
  costo_unitario: string | number;
  origen: string | null;
  referencia: string | null;
  fecha: string;
}

/** Cabecera de una compra por id (con items_count para distinguir multiproducto). */
export async function getCompraById(
  schemaRaw: string,
  empresaId: string,
  compraId: string
): Promise<CompraRow | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "compras");
  const tItems = quoteSchemaTable(schema, "compras_items");
  const colsPrefixed = COLS.replace(/\s+/g, " ").trim().split(",").map((c) => `c.${c.trim()}`).join(", ");
  const { rows } = await pool().query<CompraRow>(
    `SELECT ${colsPrefixed},
            (SELECT count(*) FROM ${tItems} ci WHERE ci.compra_id = c.id)::int AS items_count
       FROM ${t} c
      WHERE c.id = $1::uuid AND c.empresa_id = $2::uuid
      LIMIT 1`,
    [compraId, empresaId]
  );
  return rows[0] ?? null;
}

/** Líneas (compras_items) de una compra multiproducto. Vacío en compras legacy. */
export async function listCompraItems(
  schemaRaw: string,
  empresaId: string,
  compraId: string
): Promise<CompraItemRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "compras_items");
  const { rows } = await pool().query<CompraItemRow>(
    `SELECT id, compra_id, producto_id, producto_nombre, sku, cantidad,
            costo_unitario, iva_tipo, subtotal, monto_iva, total_linea
       FROM ${t}
      WHERE compra_id = $1::uuid AND empresa_id = $2::uuid
      ORDER BY created_at ASC`,
    [compraId, empresaId]
  );
  return rows;
}

/**
 * Movimientos de inventario generados por una compra. Se relacionan por
 * origen='compra' + referencia=numero_control (no hay FK directa).
 */
export async function listMovimientosDeCompra(
  schemaRaw: string,
  empresaId: string,
  numeroControl: string
): Promise<MovimientoCompraRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "movimientos_inventario");
  const { rows } = await pool().query<MovimientoCompraRow>(
    `SELECT id, producto_id, producto_nombre, producto_sku, tipo, cantidad,
            costo_unitario, origen, referencia, fecha
       FROM ${t}
      WHERE empresa_id = $1::uuid AND origen = 'compra' AND referencia = $2
      ORDER BY fecha ASC`,
    [empresaId, numeroControl]
  );
  return rows;
}

// ── Resumen / mini-dashboard de compras ──────────────────────────────────────

export interface ResumenComprasBounds {
  dayStart: string;
  dayEnd: string;
  monthStart: string;
  monthEnd: string;
}

export interface ResumenCompras {
  hoy: { cantidad: number; total: number };
  mes: { cantidad: number; total: number };
  compraMasAlta: { numero_control: string; proveedor_nombre: string; total: number } | null;
  proveedorPrincipal: { proveedor_id: string; proveedor_nombre: string; total: number } | null;
  productoMasGasto: { producto_id: string; producto_nombre: string; gasto: number } | null;
}

/** Agregados SQL para el mini-dashboard de compras (todo server-side). */
export async function getResumenCompras(
  schemaRaw: string,
  empresaId: string,
  bounds: ResumenComprasBounds
): Promise<ResumenCompras> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "compras");
  const tItems = quoteSchemaTable(schema, "compras_items");
  const p = pool();
  const { dayStart, dayEnd, monthStart, monthEnd } = bounds;

  const totalsQ = (start: string, end: string) =>
    p.query<{ cantidad: number; total: number }>(
      `SELECT count(*)::int AS cantidad, COALESCE(SUM(total), 0)::float8 AS total
         FROM ${t}
        WHERE empresa_id = $1::uuid AND fecha >= $2::timestamptz AND fecha <= $3::timestamptz`,
      [empresaId, start, end]
    );

  const masAltaQ = p.query<{ numero_control: string; proveedor_nombre: string; total: number }>(
    `SELECT numero_control, proveedor_nombre, total::float8 AS total
       FROM ${t}
      WHERE empresa_id = $1::uuid AND fecha >= $2::timestamptz AND fecha <= $3::timestamptz
      ORDER BY total DESC LIMIT 1`,
    [empresaId, monthStart, monthEnd]
  );

  const provQ = p.query<{ proveedor_id: string; proveedor_nombre: string; total: number }>(
    `SELECT proveedor_id, proveedor_nombre, SUM(total)::float8 AS total
       FROM ${t}
      WHERE empresa_id = $1::uuid AND fecha >= $2::timestamptz AND fecha <= $3::timestamptz
      GROUP BY proveedor_id, proveedor_nombre
      ORDER BY total DESC LIMIT 1`,
    [empresaId, monthStart, monthEnd]
  );

  // Producto con más gasto del mes: líneas (multiproducto) + cabecera (legacy sin items).
  const prodQ = p.query<{ producto_id: string; producto_nombre: string; gasto: number }>(
    `SELECT producto_id, producto_nombre, SUM(gasto)::float8 AS gasto FROM (
        SELECT ci.producto_id, ci.producto_nombre, ci.total_linea AS gasto
          FROM ${tItems} ci JOIN ${t} c ON c.id = ci.compra_id
         WHERE c.empresa_id = $1::uuid AND c.fecha >= $2::timestamptz AND c.fecha <= $3::timestamptz
        UNION ALL
        SELECT c.producto_id, c.producto_nombre, c.total AS gasto
          FROM ${t} c
         WHERE c.empresa_id = $1::uuid AND c.fecha >= $2::timestamptz AND c.fecha <= $3::timestamptz
           AND NOT EXISTS (SELECT 1 FROM ${tItems} ci WHERE ci.compra_id = c.id)
      ) g
      GROUP BY producto_id, producto_nombre
      ORDER BY gasto DESC LIMIT 1`,
    [empresaId, monthStart, monthEnd]
  );

  const [hoy, mes, masAlta, prov, prod] = await Promise.all([
    totalsQ(dayStart, dayEnd),
    totalsQ(monthStart, monthEnd),
    masAltaQ,
    provQ,
    prodQ,
  ]);

  return {
    hoy: { cantidad: hoy.rows[0]?.cantidad ?? 0, total: hoy.rows[0]?.total ?? 0 },
    mes: { cantidad: mes.rows[0]?.cantidad ?? 0, total: mes.rows[0]?.total ?? 0 },
    compraMasAlta: masAlta.rows[0] ?? null,
    proveedorPrincipal: prov.rows[0] ?? null,
    productoMasGasto: prod.rows[0] ?? null,
  };
}

/** Genera proximo COMP-XXXXXX leyendo el maximo existente. */
async function nextNumeroControl(
  client: import("pg").PoolClient,
  schema: string,
  empresaId: string
): Promise<string> {
  const t = quoteSchemaTable(schema, "compras");
  const { rows } = await client.query<{ maxn: number | null }>(
    `SELECT COALESCE(MAX(
       CASE WHEN numero_control ~ '^COMP-[0-9]+$'
            THEN (substring(numero_control from 6))::int
            ELSE 0 END
     ), 0) AS maxn
     FROM ${t} WHERE empresa_id = $1::uuid`,
    [empresaId]
  );
  const next = Number(rows[0]?.maxn ?? 0) + 1;
  return `COMP-${String(next).padStart(6, "0")}`;
}

export interface CompraResult {
  compra: CompraRow;
  movimiento_id: string | null;
  movimiento_warning: string | null;
}

/** Una línea de detalle para insertar en compras_items. */
export interface CompraItemInput {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  costo_unitario: number;            // PYG
  costo_unitario_original: number;   // moneda elegida
  iva_tipo: string;                  // 'exenta' | '5' | '10'
  subtotal: number;
  monto_iva: number;
  total_linea: number;
}

/** Cabecera de compra + N líneas (multiproducto). */
export interface InsertCompraMultiInput {
  proveedor_id: string;
  proveedor_nombre: string;
  moneda: string;
  tipo_cambio: number;
  tipo_pago: string;
  plazo_dias: number | null;
  nro_timbrado: string;
  created_by: string | null;
  usuario_nombre: string | null;
  items: CompraItemInput[];
}

/**
 * Crea una compra multiproducto en una transacción:
 *  1) cabecera en `compras`: snapshot del PRIMER ítem en los campos inline
 *     NOT NULL; totales (subtotal/monto_iva/total) = SUMA de las líneas;
 *     precio_venta = snapshot del precio actual del primer producto (campo
 *     NOT NULL, informativo — NO se reescribe al producto).
 *  2) cada línea → `compras_items`.
 *  3) por línea → movimiento ENTRADA + stock += cantidad + costo_promedio = costo_unitario.
 *
 * Decisión Fase 3: compras NO toca el precio de venta del producto
 * (se gestiona en Inventario). Solo stock y costo_promedio por línea.
 */
export async function insertCompraMultiConImpacto(
  schemaRaw: string,
  empresaId: string,
  d: InsertCompraMultiInput
): Promise<CompraResult> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "compras");
  const tCI = quoteSchemaTable(schema, "compras_items");
  const tM = quoteSchemaTable(schema, "movimientos_inventario");
  const tP = quoteSchemaTable(schema, "productos");

  const items = d.items;
  if (!items.length) throw new Error("La compra debe tener al menos una línea.");

  // Totales agregados = suma de las líneas
  const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
  const montoIva = items.reduce((s, it) => s + it.monto_iva, 0);
  const total = items.reduce((s, it) => s + it.total_linea, 0);
  const first = items[0];

  const client = await pool().connect();
  let movimientoId: string | null = null;
  let movimientoWarning: string | null = null;
  try {
    await client.query("BEGIN");

    const numero = await nextNumeroControl(client, schema, empresaId);

    // precio_venta de cabecera = snapshot del precio actual del primer producto
    // (NOT NULL, solo informativo; NO se reescribe al producto).
    const pvQ = await client.query<{ precio_venta: string | number }>(
      `SELECT precio_venta FROM ${tP} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [first.producto_id, empresaId]
    );
    const precioVentaSnapshot = Number(pvQ.rows[0]?.precio_venta ?? 0) || 0;

    const { rows: compraRows } = await client.query<CompraRow>(
      `INSERT INTO ${tC} (
         empresa_id, proveedor_id, proveedor_nombre, producto_id, producto_nombre,
         cantidad, moneda, tipo_cambio, costo_unitario_original, costo_unitario,
         iva_tipo, subtotal, monto_iva, total, precio_venta, margen_venta,
         tipo_pago, plazo_dias, nro_timbrado, numero_control, estado, fecha,
         created_by, usuario_nombre
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4::uuid, $5,
         $6::numeric, $7, $8::numeric, $9::numeric, $10::numeric,
         $11, $12::numeric, $13::numeric, $14::numeric, $15::numeric, $16::numeric,
         $17, $18::integer, $19, $20, 'registrada', now(),
         $21::uuid, $22
       )
       RETURNING ${COLS}`,
      [
        empresaId,
        d.proveedor_id,
        d.proveedor_nombre,
        first.producto_id,
        first.producto_nombre,
        first.cantidad,
        d.moneda,
        d.tipo_cambio,
        first.costo_unitario_original,
        first.costo_unitario,
        first.iva_tipo,
        subtotal,
        montoIva,
        total,
        precioVentaSnapshot,
        null, // margen_venta: no aplica (compras no gestiona precio de venta)
        d.tipo_pago,
        d.plazo_dias,
        d.nro_timbrado,
        numero,
        d.created_by,
        d.usuario_nombre,
      ]
    );
    const compra = compraRows[0];
    const compraId = compra.id;

    // 1) Insertar TODAS las líneas en compras_items
    for (const it of items) {
      await client.query(
        `INSERT INTO ${tCI} (
           empresa_id, compra_id, producto_id, producto_nombre, sku,
           cantidad, costo_unitario, iva_tipo, subtotal, monto_iva, total_linea
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4, $5,
           $6::numeric, $7::numeric, $8, $9::numeric, $10::numeric, $11::numeric
         )`,
        [
          empresaId, compraId, it.producto_id, it.producto_nombre, it.sku,
          it.cantidad, it.costo_unitario, it.iva_tipo, it.subtotal, it.monto_iva, it.total_linea,
        ]
      );
    }

    // 2) Por cada línea: movimiento ENTRADA + stock + costo_promedio (NO precio_venta)
    for (const it of items) {
      try {
        const { rows: movRows } = await client.query<{ id: string }>(
          `INSERT INTO ${tM} (
             empresa_id, producto_id, producto_nombre, producto_sku,
             tipo, cantidad, costo_unitario, origen, referencia, fecha,
             created_by, usuario_nombre
           )
           SELECT $1::uuid, $2::uuid, $3, COALESCE(NULLIF($4, ''), p.sku, ''),
                  'ENTRADA', $5::numeric, $6::numeric, 'compra', $7, now(),
                  $8::uuid, $9
           FROM ${tP} p WHERE p.id = $2::uuid
           RETURNING id`,
          [
            empresaId, it.producto_id, it.producto_nombre, it.sku,
            it.cantidad, it.costo_unitario, numero, d.created_by, d.usuario_nombre,
          ]
        );
        if (movRows[0]?.id) movimientoId = movRows[0].id;
      } catch (movErr) {
        const msg = movErr instanceof Error ? movErr.message : String(movErr);
        console.error("[compras-pg] movimiento ENTRADA fallo", {
          schema, empresaId, numero, producto_id: it.producto_id, message: msg,
          code: (movErr as { code?: string })?.code,
          detail: (movErr as { detail?: string })?.detail,
        });
        movimientoWarning =
          "La compra se guardó pero uno o más movimientos de entrada en inventario no se registraron.";
      }

      // stock += cantidad ; costo_promedio = costo_unitario (réplica exacta del comportamiento actual)
      await client.query(
        `UPDATE ${tP}
            SET stock_actual = stock_actual + $1::numeric,
                costo_promedio = $2::numeric,
                updated_at = now()
          WHERE id = $3::uuid AND empresa_id = $4::uuid`,
        [it.cantidad, it.costo_unitario, it.producto_id, empresaId]
      );
    }

    await client.query("COMMIT");
    return { compra, movimiento_id: movimientoId, movimiento_warning: movimientoWarning };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Compat: compra mono-producto. Delega en la multiproducto con una sola línea.
 * Mantiene la firma original. Nota: ya NO reescribe precio_venta del producto
 * (decisión Fase 3 — el precio se gestiona en Inventario).
 */
export async function insertCompraConImpacto(
  schemaRaw: string,
  empresaId: string,
  d: InsertCompraInput
): Promise<CompraResult> {
  return insertCompraMultiConImpacto(schemaRaw, empresaId, {
    proveedor_id: d.proveedor_id,
    proveedor_nombre: d.proveedor_nombre,
    moneda: d.moneda,
    tipo_cambio: d.tipo_cambio,
    tipo_pago: d.tipo_pago,
    plazo_dias: d.plazo_dias,
    nro_timbrado: d.nro_timbrado,
    created_by: d.created_by,
    usuario_nombre: d.usuario_nombre,
    items: [{
      producto_id: d.producto_id,
      producto_nombre: d.producto_nombre,
      sku: "",
      cantidad: d.cantidad,
      costo_unitario: d.costo_unitario,
      costo_unitario_original: d.costo_unitario_original,
      iva_tipo: d.iva_tipo,
      subtotal: d.subtotal,
      monto_iva: d.monto_iva,
      total_linea: d.total,
    }],
  });
}
