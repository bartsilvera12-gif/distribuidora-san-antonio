// Tipos de los reportes operativos (server-side, schema sanantonio).

export interface MovimientoEstadoCuenta {
  fecha: string;
  tipo: string; // Venta | Compra | Gasto
  referencia: string;
  descripcion: string;
  entrada: number;
  salida: number;
}

export interface EstadoCuentaReporte {
  mes: string;
  ingresosVentas: number;
  compras: number;
  gastos: number;
  resultado: number; // ventas - compras - gastos
  /** Ventas a crédito del período (sin aplicación de pagos parciales). */
  porCobrar: number;
  /** Compras a crédito del período (sin aplicación de pagos parciales). */
  porPagar: number;
  movimientos: MovimientoEstadoCuenta[];
}

export interface VentaReporteRow {
  id: string;
  numero_control: string;
  fecha: string;
  items_count: number;
  subtotal: number;
  monto_iva: number;
  total: number;
  metodo_pago: string | null;
  estado: string;
}

export interface ItemVendidoRow {
  numero_control: string;
  fecha: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  tipo_precio: string;
  precio_venta: number;
  subtotal: number;
  monto_iva: number;
  total_linea: number;
}

export interface VentasReporte {
  mes: string;
  totalVendido: number;
  cantidad: number;
  ticketPromedio: number;
  ventaMasAlta: { numero_control: string; total: number } | null;
  porTipoPrecio: { minorista: number; mayorista: number; costo: number };
  productoMasVendido: { producto_nombre: string; cantidad: number } | null;
  productoMayorFacturacion: { producto_nombre: string; total: number } | null;
  ventas: VentaReporteRow[];
  items: ItemVendidoRow[];
}

export interface CompraReporteRow {
  id: string;
  numero_control: string;
  fecha: string;
  proveedor_nombre: string;
  items_count: number;
  subtotal: number;
  monto_iva: number;
  total: number;
  tiene_factura: boolean;
}

export interface ItemCompradoRow {
  numero_control: string;
  fecha: string;
  proveedor_nombre: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  costo_unitario: number;
  subtotal: number;
  monto_iva: number;
  total_linea: number;
}

export interface ComprasReporte {
  mes: string;
  totalComprado: number;
  cantidad: number;
  compraMasAlta: { numero_control: string; proveedor_nombre: string; total: number } | null;
  proveedorMayor: { proveedor_nombre: string; total: number } | null;
  productoMasComprado: { producto_nombre: string; cantidad: number } | null;
  productoMayorGasto: { producto_nombre: string; gasto: number } | null;
  compras: CompraReporteRow[];
  items: ItemCompradoRow[];
}

export interface ProveedorReporteRow {
  id: string;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  cantidad: number;
  total: number;
  ultima_compra: string | null;
}

export interface ProveedoresReporte {
  mes: string;
  totalProveedores: number;
  conCompras: number;
  totalComprado: number;
  compraPromedio: number;
  ultimaCompra: { numero_control: string; proveedor_nombre: string; total: number; fecha: string } | null;
  proveedores: ProveedorReporteRow[];
}

// ── Conciliación entre cuentas (transferencias / tarjetas) ────────────────────

export interface ConciliacionRow {
  id: string;
  fecha: string;
  numero_control: string | null; // venta asociada
  metodo_pago: string; // transferencia | tarjeta
  banco_codigo: string | null;
  banco_nombre: string | null;
  titular: string | null;
  monto: number;
  nro_comprobante: string | null;
  venta_estado: string | null;
}

export interface ConciliacionReporte {
  mes: string;
  totalTransferencias: number;
  cantidadTransferencias: number;
  totalTarjetas: number;
  cantidadTarjetas: number;
  totalGeneral: number;
  cantidadTotal: number;
  porBanco: { banco: string; cantidad: number; total: number }[];
  movimientos: ConciliacionRow[];
}
