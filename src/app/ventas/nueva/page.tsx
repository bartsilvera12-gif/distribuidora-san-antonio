"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import PageHeader from "@/components/ui/PageHeader";
import ProductPickerModal, { type AgregarVentaPayload } from "@/components/inventario/ProductPickerModal";
import { saveVenta } from "@/lib/ventas/storage";
import type { TipoIvaVenta, TipoVenta, MonedaVenta, LineaVenta, MetodoPago, TipoPrecioVenta } from "@/lib/ventas/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Flag de vertical de negocio del cliente.
 * - "gastronomia" (legacy En lo de Mari): muestra modalidad de pedido (local/delivery/carry_out),
 *   número de mesa, datos de delivery, y obliga seleccionar una modalidad antes de
 *   confirmar la venta. Al confirmar también crea un proyecto-pedido de cocina.
 * - cualquier otro valor (default "distribuidora"): oculta toda la sección
 *   de modalidad/mesa. La venta se confirma solo con cliente + productos.
 *
 * Se lee de NEXT_PUBLIC_NEURA_VERTICAL en build/runtime de cliente.
 * Default seguro: "distribuidora" (no gastronomía).
 */
const ES_GASTRONOMIA =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_NEURA_VERTICAL?.trim().toLowerCase()) === "gastronomia";

function formatGs(valor: number) {
  return `Gs. ${Math.round(valor).toLocaleString("es-PY")}`;
}

function calcIva(tipo: TipoIvaVenta, base: number) {
  if (tipo === "EXENTA") return 0;
  if (tipo === "5%")     return base * 0.05;
  return base * 0.10;
}

// ── Estilos ────────────────────────────────────────────────────────────────────

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none bg-white text-sm";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

// ── Labels ──────────────────────────────────────────────────────────────────

const ivaLabel: Record<TipoIvaVenta, string> = {
  EXENTA: "Exenta",
  "5%":   "5%",
  "10%":  "10%",
};

const tipoPrecioLabel: Record<TipoPrecioVenta, string> = {
  minorista: "Minorista",
  mayorista: "Mayorista",
  costo:     "Al costo",
};

// ── Componente principal ───────────────────────────────────────────────────────

export default function NuevaVentaPage() {
  const router = useRouter();

  // ── Estado global ──────────────────────────────────────────────────────────
  const [items, setItems]           = useState<LineaVenta[]>([]);
  const [errorVenta, setErrorVenta] = useState<string | null>(null);

  // ── Condiciones de la venta (fijas para En lo de Mari) ────────────────────
  // Instancia dedicada: siempre Guaraníes + Contado.
  const moneda: MonedaVenta = "GS";
  const tipoVenta: TipoVenta = "CONTADO";

  // Pedidos (gastronomía): modalidad obligatoria en instancia En lo de Mari
  type Modalidad = "local" | "delivery" | "carry_out";
  const [modalidad, setModalidad] = useState<Modalidad | "">("");
  const [pedidoMesa, setPedidoMesa] = useState("");
  const [pedidoClienteNombre, setPedidoClienteNombre] = useState("");
  const [pedidoClienteTelefono, setPedidoClienteTelefono] = useState("");
  const [pedidoDireccion, setPedidoDireccion] = useState("");
  const [pedidoObservacion, setPedidoObservacion] = useState("");

  // ── Cobro (solo CONTADO, no se persiste — solo ayuda al cajero) ───────────
  const [montoRecibido, setMontoRecibido] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");

  // ── Modal buscador ─────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);

  /**
   * Agregado desde el panel de detalle del buscador: arma la LineaVenta con los
   * datos del modal (producto, cantidad, precio, IVA y tipo de precio elegido
   * ahí). Mantiene el modal abierto si todo OK para seguir cargando.
   */
  function handleAgregarDesdePicker(payload: AgregarVentaPayload): boolean {
    const { producto: p, cantidad, precio_input, iva, tipo_precio } = payload;
    const precioPyg = precio_input;
    // Verificar stock vs lo ya cargado SOLO si el producto controla stock.
    // Productos del Menú (controla_stock=false) no validan stock.
    const ctrlStock = (p as { controla_stock?: boolean }).controla_stock !== false;
    if (ctrlStock) {
      const yaEnCarrito = items.filter((i) => i.producto_id === p.id).reduce((s, i) => s + i.cantidad, 0);
      const disp = p.stock_actual - yaEnCarrito;
      if (cantidad > disp) {
        return false;
      }
    }
    const subtotal = cantidad * precioPyg;
    const montoIva = calcIva(iva, subtotal);
    const totalLinea = subtotal + montoIva;

    setItems((prev) => [
      ...prev,
      {
        producto_id: p.id,
        producto_nombre: p.nombre,
        sku: p.sku,
        cantidad,
        precio_venta_original: precio_input,
        precio_venta: precioPyg,
        tipo_iva: iva,
        // Tipo de precio elegido por el cajero en el panel de detalle del buscador.
        tipo_precio,
        subtotal,
        monto_iva: montoIva,
        total_linea: totalLinea,
      },
    ]);
    setErrorVenta(null);
    return true;
  }

  // ── Cálculos ───────────────────────────────────────────────────────────────
  const tipoCambioNum = 1;

  const totalSubtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const totalIva      = items.reduce((s, i) => s + i.monto_iva, 0);
  const totalGeneral  = items.reduce((s, i) => s + i.total_linea, 0);
  const pedidoValido = (() => {
    // En verticales no-gastronomía no hay concepto de modalidad de pedido.
    if (!ES_GASTRONOMIA) return true;
    if (modalidad === "") return false;
    if (modalidad === "delivery") return pedidoClienteTelefono.trim().length > 0 && pedidoDireccion.trim().length > 0;
    return true; // local + carry_out: todos opcionales
  })();
  const ventaValida   = items.length > 0 && pedidoValido;

  // Vuelto (solo informativo, no se persiste)
  const montoRecibidoNum = parseFloat(montoRecibido) || 0;
  const vuelto           = montoRecibidoNum - totalGeneral;

  function handleEliminarLinea(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorVenta(null);
    if (!ventaValida) return;

    const resultado = await saveVenta(
      {
        items,
        moneda,
        tipo_cambio:  tipoCambioNum,
        subtotal:     totalSubtotal,
        monto_iva:    totalIva,
        total:        totalGeneral,
        tipo_venta:   tipoVenta,
        metodo_pago:  metodoPago,
      },
      // Pedido para el kanban:
      // - Gastronomía con modalidad elegida: mandar la info completa (mesa/delivery/etc).
      // - Gastronomía sin modalidad elegida: undefined (el form bloquea el submit antes).
      // - No-gastronomía (distribuidora): mandar siempre con modalidad=null → el backend
      //   igual crea el pedido en el kanban con título genérico "Venta {numero}".
      ES_GASTRONOMIA
        ? (modalidad === ""
            ? undefined
            : {
                modalidad,
                mesa: modalidad === "local" ? pedidoMesa.trim() || null : null,
                cliente_nombre: pedidoClienteNombre.trim() || null,
                cliente_telefono: pedidoClienteTelefono.trim() || null,
                direccion_entrega: pedidoDireccion.trim() || null,
                observacion: pedidoObservacion.trim() || null,
              })
        : {
            modalidad: null,
            mesa: null,
            cliente_nombre: null,
            cliente_telefono: null,
            direccion_entrega: null,
            observacion: null,
          }
    );

    if (!resultado.success) {
      setErrorVenta(resultado.error);
      return;
    }
    // Abrir comandas + ticket cliente en nueva pestaña con autoprint.
    try {
      window.open(`/api/ventas/${resultado.venta.id}/ticket?mode=comandas&auto=1`, "_blank", "noopener");
    } catch {}
    router.push("/ventas");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      <PageHeader
        eyebrow="San Antonio · Operaciones"
        title="Nueva venta"
        backHref="/ventas"
        backLabel="Ventas"
        actions={
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Agregar producto
          </button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-7xl">

        {/* ── SECCIÓN 3: Carrito + totales + confirmar ─────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Productos en esta venta
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              Agregar producto
            </button>
          </div>

          {items.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
              Todavía no agregaste productos a esta venta.
            </div>
          ) : (
            <>
              {/* min-w fuerza scroll horizontal en mobile (9 columnas).
                  Columnas secundarias (SKU, Subtotal, IVA Gs) se ocultan
                  progresivamente: en mobile solo Producto/Cant/Precio/Total/eliminar. */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] sm:min-w-0 text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                      <th className="py-2.5 pr-3 font-medium">Producto</th>
                      <th className="py-2.5 pr-3 font-medium hidden md:table-cell">SKU</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Cant.</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Precio unit.</th>
                      <th className="py-2.5 pr-3 font-medium text-center hidden md:table-cell">IVA</th>
                      <th className="py-2.5 pr-3 font-medium text-right hidden lg:table-cell">Subtotal</th>
                      <th className="py-2.5 pr-3 font-medium text-right hidden lg:table-cell">IVA Gs.</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Total</th>
                      <th className="py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-3 font-medium text-gray-800">
                          {item.producto_nombre}
                        </td>
                        <td className="py-3 pr-3 font-mono text-xs text-gray-500 hidden md:table-cell">
                          {item.sku}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {item.cantidad}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-gray-600 text-xs">
                          <div>{formatGs(item.precio_venta)}</div>
                          <span className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            item.tipo_precio === "mayorista"
                              ? "bg-indigo-100 text-indigo-700"
                              : item.tipo_precio === "costo"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {tipoPrecioLabel[item.tipo_precio]}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-center hidden md:table-cell">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                            {ivaLabel[item.tipo_iva]}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-gray-600 text-xs hidden lg:table-cell">
                          {formatGs(item.subtotal)}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-gray-500 text-xs hidden lg:table-cell">
                          {item.monto_iva > 0 ? formatGs(item.monto_iva) : "—"}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums font-semibold text-gray-800">
                          {formatGs(item.total_linea)}
                        </td>
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleEliminarLinea(idx)}
                            className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] text-red-400 hover:text-red-700 transition-colors rounded hover:bg-red-50"
                            title="Eliminar producto"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales + Cobro (vuelto) */}
              <div className="mt-5 flex justify-end">
                <div className="w-full md:w-80 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotal</span>
                      <span className="tabular-nums font-medium">{formatGs(totalSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>IVA</span>
                      <span className="tabular-nums font-medium">
                        {totalIva > 0 ? formatGs(totalIva) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                      <span>TOTAL</span>
                      <span className="tabular-nums">{formatGs(totalGeneral)}</span>
                    </div>
                  </div>

                  {tipoVenta === "CONTADO" && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Cobro
                      </p>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Método de pago</label>
                        <div className="grid grid-cols-3 gap-1">
                          {(["efectivo", "tarjeta", "transferencia"] as MetodoPago[]).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setMetodoPago(m)}
                              className={`text-xs py-1.5 rounded-md border transition-colors ${
                                metodoPago === m
                                  ? "border-[#0EA5E9] bg-[#0EA5E9]/10 text-[#0EA5E9] font-medium"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {m === "efectivo" ? "Efectivo" : m === "tarjeta" ? "Tarjeta" : "Transfer."}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Monto recibido (Gs.)
                        </label>
                        <MontoInput
                          value={montoRecibido}
                          onChange={(n) => setMontoRecibido(String(n))}
                          placeholder="Ej: 100.000"
                          className={inputClass}
                          decimals={false}
                        />
                      </div>
                      {montoRecibidoNum > 0 && (
                        <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                          {vuelto >= 0 ? (
                            <>
                              <span className="text-gray-600">Vuelto</span>
                              <span className="font-bold text-emerald-600 tabular-nums">
                                {formatGs(vuelto)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-gray-600">Falta</span>
                              <span className="font-bold text-red-600 tabular-nums">
                                {formatGs(Math.abs(vuelto))}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                      <p className="text-[11px] text-gray-400 leading-snug">
                        Cálculo solo informativo — no se guarda en la venta.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Modalidad del pedido (gastronómico) — solo en vertical gastronomía */}
          {ES_GASTRONOMIA && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/40 px-4 py-4">
            <p className="text-sm font-semibold text-slate-800 mb-3">
              Modalidad del pedido <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { v: "local",     label: "En local" },
                { v: "delivery",  label: "Delivery" },
                { v: "carry_out", label: "Retiro / Carry out" },
              ] as Array<{ v: Modalidad; label: string }>).map((opt) => (
                <label
                  key={opt.v}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition ${
                    modalidad === opt.v
                      ? "border-amber-500 bg-white text-amber-700 font-medium"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="modalidad"
                    value={opt.v}
                    checked={modalidad === opt.v}
                    onChange={() => setModalidad(opt.v)}
                    className="h-4 w-4 text-amber-600 focus:ring-amber-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {modalidad === "local" && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Número de mesa</label>
                  <input
                    type="text"
                    value={pedidoMesa}
                    onChange={(e) => setPedidoMesa(e.target.value)}
                    placeholder="Opcional — ej: 3"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Observación</label>
                  <input
                    type="text"
                    value={pedidoObservacion}
                    onChange={(e) => setPedidoObservacion(e.target.value)}
                    placeholder='Ej: "sin cebolla"'
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {modalidad === "delivery" && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre cliente</label>
                  <input
                    type="text"
                    value={pedidoClienteNombre}
                    onChange={(e) => setPedidoClienteNombre(e.target.value)}
                    placeholder="Opcional"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Teléfono <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={pedidoClienteTelefono}
                    onChange={(e) => setPedidoClienteTelefono(e.target.value)}
                    placeholder="09xx xxx xxx"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Dirección de entrega <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={pedidoDireccion}
                    onChange={(e) => setPedidoDireccion(e.target.value)}
                    placeholder="Calle, número, referencia"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Observación</label>
                  <input
                    type="text"
                    value={pedidoObservacion}
                    onChange={(e) => setPedidoObservacion(e.target.value)}
                    placeholder="Notas para el repartidor o la cocina"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {modalidad === "carry_out" && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre cliente</label>
                  <input
                    type="text"
                    value={pedidoClienteNombre}
                    onChange={(e) => setPedidoClienteNombre(e.target.value)}
                    placeholder="Opcional"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={pedidoClienteTelefono}
                    onChange={(e) => setPedidoClienteTelefono(e.target.value)}
                    placeholder="Opcional"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Observación</label>
                  <input
                    type="text"
                    value={pedidoObservacion}
                    onChange={(e) => setPedidoObservacion(e.target.value)}
                    placeholder='Ej: "pasa en 20 min"'
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {modalidad === "" && (
              <p className="mt-2 text-xs text-amber-700">
                Elegí una modalidad antes de confirmar la venta.
              </p>
            )}
          </div>
          )}

          {/* Error confirmar */}
          {errorVenta && (
            <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">
              <span className="text-base leading-none mt-0.5">⚠</span>
              <span className="font-medium">{errorVenta}</span>
            </div>
          )}

          {/* Acciones — stack vertical full-width en mobile (mas facil de tappear),
              fila en sm+. Confirmar en orden visual primero (primary). */}
          <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => router.push("/ventas")}
              className="border border-slate-200 px-6 py-3 rounded-lg text-sm hover:bg-slate-50 transition-colors min-h-[48px] w-full sm:w-auto"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!ventaValida}
              className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 min-h-[48px] w-full sm:w-auto"
            >
              Confirmar venta
            </button>
          </div>

        </div>

      </form>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAgregar={handleAgregarDesdePicker}
        excludeIds={items.map((i) => i.producto_id)}
        moneda={moneda}
        tipoCambio={tipoCambioNum}
        ivaDefault="10%"
      />
    </div>
  );
}
