export type EstadoProveedor = "activo" | "inactivo";

export type CondicionPagoProveedor = "contado" | "credito" | "mixto";

/** Categoría maestra (tenant). */
export interface ProveedorCategoria {
  id: string;
  empresa_id?: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Proveedor persistido en DB (cabecera + categorías resueltas en GET). */
export interface Proveedor {
  id: string;
  empresa_id?: string;
  nombre: string;
  nombre_comercial: string | null;
  razon_social: string | null;
  ruc: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contacto: string | null;
  estado: EstadoProveedor;
  condicion_pago: CondicionPagoProveedor | null;
  plazo_pago_dias: number | null;
  moneda_preferida: "GS" | "USD" | null;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
  /** Solo en lecturas que join-ean categorías */
  categorias?: Pick<ProveedorCategoria, "id" | "nombre" | "activo">[];
}

/** Alta rápida desde compras u otros flujos (mínimos obligatorios en API). */
export type NuevoProveedorInput = {
  nombre: string;
  nombre_comercial?: string | null;
  razon_social?: string | null;
  ruc?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  contacto?: string | null;
  estado?: EstadoProveedor;
  condicion_pago?: CondicionPagoProveedor | null;
  plazo_pago_dias?: number | null;
  moneda_preferida?: "GS" | "USD" | null;
  observaciones?: string | null;
  categoria_ids?: string[];
};

// ── Reportería (resumen, stats por proveedor, detalle) ───────────────────────

export interface ResumenProveedores {
  totalProveedores: number;
  /** Proveedores con compras en el rango seleccionado (default mes actual). */
  conComprasRango: number;
  /** Total comprado en el rango seleccionado. */
  totalCompradoRango: number;
  ultimaCompra: { numero_control: string; proveedor_nombre: string; total: number; fecha: string } | null;
}

export interface ProveedorComprasStat {
  proveedor_id: string;
  cantidad: number;
  /** Total comprado al proveedor en el rango seleccionado. */
  total_rango: number;
  ultima_compra: string | null;
}

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
