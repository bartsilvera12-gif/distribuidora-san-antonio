export type TipoPago = "contado" | "credito";
export type TipoIva = "exenta" | "5" | "10";
export type Moneda = "PYG" | "USD";

/** Una línea de detalle de compra (tabla sanantonio.compras_items). */
export interface CompraItem {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  costo_unitario: number;            // PYG (impacto en inventario)
  costo_unitario_original: number;   // en la moneda elegida
  iva_tipo: TipoIva;
  subtotal: number;                  // PYG, antes de IVA
  monto_iva: number;                 // PYG
  total_linea: number;               // PYG, con IVA
}

export interface Compra {
  id: string;
  numero_control: string;        // COMP-000001, COMP-000002, ...

  proveedor_id: string;
  proveedor_nombre: string;

  producto_id: string;
  producto_nombre: string;

  cantidad: number;

  moneda: Moneda;
  tipo_cambio: number;           // 1 si PYG; cotización si USD
  costo_unitario_original: number; // en la moneda elegida
  costo_unitario: number;        // siempre en PYG (para impacto en inventario)

  iva_tipo: TipoIva;
  subtotal: number;              // PYG, antes de IVA
  monto_iva: number;             // PYG
  total: number;                 // PYG, total con IVA

  precio_venta: number;          // PYG, precio de venta sugerido
  margen_venta: number;          // % margen sobre venta

  tipo_pago: TipoPago;
  plazo_dias?: number;           // solo si tipo_pago === "credito"

  nro_timbrado: string;

  fecha: string;                 // ISO string, generado automáticamente

  /** Cantidad de líneas de detalle (compras_items). 0/undefined = compra
   *  mono-producto legacy que se lee por los campos inline de `compras`. */
  items_count?: number;

  /** Factura adjunta del proveedor (Storage privado). Solo metadata; la URL
   *  firmada se genera on-demand vía /api/compras/[id]/factura. */
  factura_path?: string | null;
  factura_nombre_original?: string | null;
  factura_mime_type?: string | null;
}
