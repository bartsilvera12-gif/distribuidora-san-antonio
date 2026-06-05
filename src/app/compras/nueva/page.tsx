"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import PageHeader from "@/components/ui/PageHeader";
import { saveCompraMulti, uploadFacturaCompra } from "@/lib/compras/storage";
import { getProveedores, proveedorExiste, createProveedor } from "@/lib/proveedores/storage";
import { getProductos, productoExiste, saveProducto } from "@/lib/inventario/storage";
import type { TipoIva, TipoPago, Moneda, CompraItem } from "@/lib/compras/types";
import type { Proveedor } from "@/lib/proveedores/types";
import type { MetodoValuacion, Producto } from "@/lib/inventario/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGs(valor: number) {
  return `Gs. ${Math.round(valor).toLocaleString("es-PY")}`;
}

function ivaRate(t: TipoIva) {
  return t === "5" ? 0.05 : t === "10" ? 0.10 : 0;
}

const ivaLabel: Record<TipoIva, string> = { exenta: "Exenta", "5": "5%", "10": "10%" };

// ── Estilos ────────────────────────────────────────────────────────────────────

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none bg-white text-sm";
const inputSmClass = inputClass;
const labelClass = "block text-sm font-medium text-slate-700 mb-2";
const labelSmClass = "block text-xs font-medium text-slate-600 mb-1.5";

// ── SegmentedControl ───────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  value, options, onChange, small = false, disabled = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  small?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`flex border border-slate-200 rounded-lg overflow-hidden ${disabled ? "opacity-50" : ""}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`flex-1 font-medium transition-colors ${small ? "py-2 text-xs" : "py-2.5 text-sm"} ${
            value === opt.value ? "bg-[#0EA5E9] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function NuevaCompraPage() {
  const router = useRouter();

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);

  // ── Cabecera (una sola vez por compra) ───────────────────────────────────
  const [header, setHeader] = useState({
    proveedor_id: "",
    nro_timbrado: "",
    moneda: "PYG" as Moneda,
    tipo_cambio: "",
    tipo_pago: "contado" as TipoPago,
    plazo_dias: "",
  });

  // ── Líneas agregadas ─────────────────────────────────────────────────────
  const [items, setItems] = useState<CompraItem[]>([]);

  // ── Línea en construcción ────────────────────────────────────────────────
  const [linea, setLinea] = useState({
    producto_id: "",
    cantidad: "",
    costo_input: "",
    iva_tipo: "10" as TipoIva,
  });

  // ── Inline: PROVEEDOR ────────────────────────────────────────────────────
  const [mostrarFormProveedor, setMostrarFormProveedor] = useState(false);
  const [formProveedor, setFormProveedor] = useState({ nombre: "", ruc: "", telefono: "", email: "", contacto: "" });
  const [errorRuc, setErrorRuc] = useState<string | null>(null);
  const [proveedorCreado, setProveedorCreado] = useState<string | null>(null);

  // ── Inline: PRODUCTO (para la línea en construcción) ─────────────────────
  const [mostrarFormProducto, setMostrarFormProducto] = useState(false);
  const [formProducto, setFormProducto] = useState({
    nombre: "", sku: "", unidad_medida: "Unidad",
    metodo_valuacion: "CPP" as MetodoValuacion, stock_minimo: "0", precio_venta_sugerido: "",
  });
  const [errorSku, setErrorSku] = useState<string | null>(null);
  const [productoCreado, setProductoCreado] = useState<string | null>(null);

  const [errorLinea, setErrorLinea] = useState<string | null>(null);
  const [errorSubmit, setErrorSubmit] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Factura adjunta (opcional) ───────────────────────────────────────────
  const FACTURA_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  const FACTURA_MAX = 10 * 1024 * 1024; // 10 MB
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [facturaPreview, setFacturaPreview] = useState<string | null>(null);
  const [facturaError, setFacturaError] = useState<string | null>(null);

  function handleFacturaChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFacturaError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFacturaFile(null); setFacturaPreview(null); return; }
    if (!FACTURA_MIME.includes(f.type)) {
      setFacturaError("Formato no permitido. Usá JPG, PNG, WebP o PDF.");
      e.target.value = "";
      return;
    }
    if (f.size > FACTURA_MAX) {
      setFacturaError("Archivo demasiado grande (máx. 10 MB).");
      e.target.value = "";
      return;
    }
    setFacturaFile(f);
    setFacturaPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  function quitarFactura() {
    setFacturaFile(null);
    setFacturaPreview(null);
    setFacturaError(null);
  }

  // ── Carga inicial ─────────────────────────────────────────────────────────
  async function recargarProveedores() {
    const data = await getProveedores();
    setProveedores(data.filter((p) => p.estado === "activo"));
  }
  function recargarProductos() {
    getProductos().then(setProductos);
  }
  useEffect(() => {
    recargarProveedores();
    recargarProductos();
  }, []);

  // ── Cálculos de la línea en construcción ──────────────────────────────────
  const tipoCambioNum = header.moneda === "USD" ? (parseFloat(header.tipo_cambio) || 0) : 1;
  const cantNum = parseFloat(linea.cantidad) || 0;
  const costoInputNum = parseFloat(linea.costo_input) || 0;
  const costoPYG = costoInputNum * tipoCambioNum;
  const lineaSubtotal = cantNum > 0 && costoPYG > 0 ? cantNum * costoPYG : 0;
  const lineaIvaMonto = lineaSubtotal * ivaRate(linea.iva_tipo);
  const lineaTotal = lineaSubtotal + lineaIvaMonto;
  const prodLineaSel = productos.find((p) => p.id === linea.producto_id);
  const lineaValida =
    !!linea.producto_id && cantNum > 0 && costoPYG > 0 &&
    (header.moneda !== "USD" || tipoCambioNum > 0);

  // ── Totales de la compra (suma de líneas) ─────────────────────────────────
  const totalSubtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const totalIva = items.reduce((s, i) => s + i.monto_iva, 0);
  const totalGeneral = items.reduce((s, i) => s + i.total_linea, 0);

  const proveedorSel = proveedores.find((p) => String(p.id) === header.proveedor_id);
  const compraValida = !!header.proveedor_id && !!header.nro_timbrado.trim() && items.length > 0;

  // Margen preview del form de nuevo producto (usa el costo de la línea)
  const precioSugeridoNum = parseFloat(formProducto.precio_venta_sugerido) || 0;
  const margenPreview =
    precioSugeridoNum > 0 && costoPYG > 0 ? ((precioSugeridoNum - costoPYG) / precioSugeridoNum) * 100 : null;

  // ── Handlers de la línea ──────────────────────────────────────────────────
  function handleProductoLineaChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    const p = productos.find((x) => x.id === id);
    setProductoCreado(null);
    setErrorLinea(null);
    setLinea((prev) => ({
      ...prev,
      producto_id: id,
      // Prefill del costo con el costo promedio actual (en PYG → de-convertir si USD).
      costo_input: p
        ? header.moneda === "USD" && tipoCambioNum > 0
          ? String(Math.round((p.costo_promedio / tipoCambioNum) * 100) / 100)
          : String(p.costo_promedio)
        : "",
    }));
  }

  function agregarLinea() {
    setErrorLinea(null);
    if (!linea.producto_id) return setErrorLinea("Seleccioná un producto.");
    if (cantNum <= 0) return setErrorLinea("La cantidad debe ser mayor a 0.");
    if (costoPYG <= 0) return setErrorLinea("El costo unitario debe ser mayor a 0.");
    if (header.moneda === "USD" && tipoCambioNum <= 0) return setErrorLinea("Cargá el tipo de cambio.");
    const p = prodLineaSel;
    if (!p) return setErrorLinea("Producto no encontrado.");

    setItems((prev) => [
      ...prev,
      {
        producto_id: p.id,
        producto_nombre: p.nombre,
        sku: p.sku,
        cantidad: cantNum,
        costo_unitario: costoPYG,
        costo_unitario_original: costoInputNum,
        iva_tipo: linea.iva_tipo,
        subtotal: lineaSubtotal,
        monto_iva: lineaIvaMonto,
        total_linea: lineaTotal,
      },
    ]);
    setLinea({ producto_id: "", cantidad: "", costo_input: "", iva_tipo: linea.iva_tipo });
    setProductoCreado(null);
  }

  function quitarLinea(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorSubmit(null);
    if (!header.proveedor_id) return setErrorSubmit("Seleccioná o agregá un proveedor.");
    if (!header.nro_timbrado.trim()) return setErrorSubmit("Ingresá el N° de timbrado.");
    if (items.length === 0) return setErrorSubmit("Agregá al menos una línea de producto.");
    if (header.moneda === "USD" && tipoCambioNum <= 0) return setErrorSubmit("Cargá el tipo de cambio.");
    if (!proveedorSel) return setErrorSubmit("Proveedor no encontrado. Recargá e intentá de nuevo.");

    setSubmitting(true);
    try {
      const res = await saveCompraMulti({
        proveedor_id: String(proveedorSel.id),
        proveedor_nombre: proveedorSel.nombre,
        moneda: header.moneda,
        tipo_cambio: tipoCambioNum,
        tipo_pago: header.tipo_pago,
        plazo_dias: header.tipo_pago === "credito" && header.plazo_dias ? parseInt(header.plazo_dias) : undefined,
        nro_timbrado: header.nro_timbrado.trim().toUpperCase(),
        items,
      });
      if (!res.success) {
        setErrorSubmit(res.error);
        return;
      }
      if (res.warning) alert(res.warning);

      // Subir factura (post-creación, con el compra_id real). Si falla, la
      // compra YA quedó guardada: avisamos pero no la perdemos.
      if (facturaFile) {
        const up = await uploadFacturaCompra(res.compra.id, facturaFile);
        if (!up.success) {
          alert(`La compra se guardó, pero la factura no pudo subirse: ${up.error}\n\nPodés volver a cargarla más tarde.`);
        }
      }
      router.push("/compras");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Handlers inline PROVEEDOR ────────────────────────────────────────────
  function handleProveedorInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.name === "ruc") setErrorRuc(null);
    const { name, value } = e.target;
    let normalized = value;
    if (name === "email") normalized = value.toLowerCase();
    else if (["nombre", "contacto"].includes(name)) normalized = value.toUpperCase();
    setFormProveedor((prev) => ({ ...prev, [name]: normalized }));
  }
  async function handleAgregarProveedor() {
    if (!formProveedor.nombre.trim() || !formProveedor.ruc.trim()) return;
    setErrorRuc(null);
    const dup = await proveedorExiste(formProveedor.ruc);
    if (dup) { setErrorRuc(`RUC ya registrado para "${dup.nombre}".`); return; }
    const resultado = await createProveedor({
      nombre: formProveedor.nombre.trim().toUpperCase(),
      ruc: formProveedor.ruc.trim(),
      telefono: formProveedor.telefono.trim(),
      email: formProveedor.email.trim(),
      contacto: formProveedor.contacto.trim().toUpperCase(),
      direccion: "", estado: "activo",
    });
    if (!resultado.ok) { setErrorRuc(resultado.error); return; }
    const creado = resultado.proveedor;
    await recargarProveedores();
    setHeader((prev) => ({ ...prev, proveedor_id: String(creado.id) }));
    setProveedorCreado(creado.nombre);
    setMostrarFormProveedor(false);
    setFormProveedor({ nombre: "", ruc: "", telefono: "", email: "", contacto: "" });
  }
  function handleCancelarProveedor() {
    setMostrarFormProveedor(false);
    setFormProveedor({ nombre: "", ruc: "", telefono: "", email: "", contacto: "" });
    setErrorRuc(null);
  }

  // ── Handlers inline PRODUCTO ─────────────────────────────────────────────
  function handleProductoInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    if (e.target.name === "sku") setErrorSku(null);
    setFormProducto((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  async function handleAgregarProducto() {
    if (!formProducto.nombre.trim() || !formProducto.sku.trim()) return;
    setErrorSku(null);
    const dup = await productoExiste(formProducto.sku, formProducto.nombre);
    if (dup) { setErrorSku(`Ya existe un producto con ese SKU o nombre ("${dup.nombre}" — ${dup.sku}).`); return; }
    const creado = await saveProducto({
      nombre: formProducto.nombre.trim().toUpperCase(),
      sku: formProducto.sku.trim().toUpperCase(),
      unidad_medida: formProducto.unidad_medida.toUpperCase(),
      metodo_valuacion: formProducto.metodo_valuacion,
      stock_actual: 0,                       // la compra sumará stock via ENTRADA
      stock_minimo: parseInt(formProducto.stock_minimo) || 0,
      costo_promedio: costoPYG || 0,
      // Precio de venta del producto (gestión de inventario, NO impacto de compra).
      precio_minorista: precioSugeridoNum || 0,
      precio_mayorista: precioSugeridoNum || 0,
      precio_venta: precioSugeridoNum || 0,
    });
    if (!creado) return;
    recargarProductos();
    setLinea((prev) => ({ ...prev, producto_id: creado.id }));
    setProductoCreado(creado.nombre);
    setMostrarFormProducto(false);
    setFormProducto({ nombre: "", sku: "", unidad_medida: "Unidad", metodo_valuacion: "CPP", stock_minimo: "0", precio_venta_sugerido: "" });
  }
  function handleCancelarProducto() {
    setMostrarFormProducto(false);
    setFormProducto({ nombre: "", sku: "", unidad_medida: "Unidad", metodo_valuacion: "CPP", stock_minimo: "0", precio_venta_sugerido: "" });
    setErrorSku(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Adquisiciones"
        title="Nueva compra"
        description="Cargá uno o varios productos del mismo proveedor. Al guardar impacta el inventario."
        backHref="/compras"
        backLabel="Compras"
      />

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-3xl">
        <form className="space-y-8" onSubmit={handleSubmit}>

          {/* ── 1. Comprobante ────────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Comprobante</SectionTitle>
            <div>
              <label className={labelClass}>N° de timbrado</label>
              <input
                type="text"
                value={header.nro_timbrado}
                onChange={(e) => setHeader((p) => ({ ...p, nro_timbrado: e.target.value }))}
                placeholder="Ej: 001-001-0000001"
                className={inputClass}
              />
            </div>
          </section>

          {/* ── 2. Proveedor (una sola vez) ───────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle>Proveedor</SectionTitle>
            <div>
              <label className={labelClass}>Proveedor <span className="text-red-500">*</span></label>
              <select
                value={header.proveedor_id}
                onChange={(e) => { setHeader((p) => ({ ...p, proveedor_id: e.target.value })); setProveedorCreado(null); }}
                className={inputClass}
                required
              >
                <option value="">Seleccionar proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} — RUC {p.ruc}</option>
                ))}
              </select>

              {proveedorCreado && (
                <p className="mt-1.5 text-xs text-green-600">✓ Proveedor &quot;{proveedorCreado}&quot; creado y seleccionado.</p>
              )}

              {!mostrarFormProveedor ? (
                <button type="button" onClick={() => { setMostrarFormProveedor(true); setProveedorCreado(null); }}
                  className="mt-2 text-xs text-gray-400 hover:text-gray-700 underline transition-colors">
                  ¿No encontrás el proveedor? Crear nuevo
                </button>
              ) : (
                <InlineFormBox titulo="Nuevo proveedor" onCancel={handleCancelarProveedor} onSave={handleAgregarProveedor}
                  saveDisabled={!formProveedor.nombre.trim() || !formProveedor.ruc.trim()}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelSmClass}>Nombre / Razón social <span className="text-red-500">*</span></label>
                      <input type="text" name="nombre" value={formProveedor.nombre} onChange={handleProveedorInputChange}
                        placeholder="Ej: DISTRIBUIDORA DEL SUR S.A." className={`${inputSmClass} uppercase`} />
                    </div>
                    <div>
                      <label className={labelSmClass}>RUC <span className="text-red-500">*</span></label>
                      <input type="text" name="ruc" value={formProveedor.ruc} onChange={handleProveedorInputChange}
                        placeholder="Ej: 80012345-1" className={`${inputSmClass} ${errorRuc ? "border-red-300 bg-red-50" : ""}`} />
                      {errorRuc && <p className="mt-1 text-xs text-red-600">{errorRuc}</p>}
                    </div>
                    <div>
                      <label className={labelSmClass}>Teléfono</label>
                      <input type="text" name="telefono" value={formProveedor.telefono} onChange={handleProveedorInputChange}
                        placeholder="Ej: 0981 111 222" className={inputSmClass} />
                    </div>
                    <div>
                      <label className={labelSmClass}>Email</label>
                      <input type="email" name="email" value={formProveedor.email} onChange={handleProveedorInputChange}
                        placeholder="Ej: ventas@empresa.com" className={inputSmClass} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelSmClass}>Persona de contacto</label>
                      <input type="text" name="contacto" value={formProveedor.contacto} onChange={handleProveedorInputChange}
                        placeholder="Ej: CARLOS MENDOZA" className={`${inputSmClass} uppercase`} />
                    </div>
                  </div>
                </InlineFormBox>
              )}
            </div>
          </section>

          {/* ── 3. Condiciones (pago + moneda) ────────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Condiciones</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Tipo de pago</label>
                <SegmentedControl<TipoPago>
                  value={header.tipo_pago}
                  options={[{ value: "contado", label: "Contado" }, { value: "credito", label: "Crédito" }]}
                  onChange={(v) => setHeader((p) => ({ ...p, tipo_pago: v }))}
                />
              </div>
              <div>
                <label className={labelClass}>Moneda</label>
                <SegmentedControl<Moneda>
                  value={header.moneda}
                  options={[{ value: "PYG", label: "Guaraníes (₲)" }, { value: "USD", label: "Dólares (USD)" }]}
                  onChange={(v) => setHeader((p) => ({ ...p, moneda: v, tipo_cambio: "" }))}
                />
              </div>
            </div>
            {header.tipo_pago === "credito" && (
              <div>
                <label className={labelClass}>Plazo (días)</label>
                <input type="number" value={header.plazo_dias}
                  onChange={(e) => setHeader((p) => ({ ...p, plazo_dias: e.target.value }))}
                  placeholder="Ej: 30" className={inputClass} min={1} />
              </div>
            )}
            {header.moneda === "USD" && (
              <div>
                <label className={labelClass}>Tipo de cambio (USD → Gs.) <span className="text-red-500">*</span></label>
                <MontoInput value={header.tipo_cambio}
                  onChange={(n) => setHeader((p) => ({ ...p, tipo_cambio: String(n) }))}
                  placeholder="Ej: 7500" className={inputClass} decimals={false} />
              </div>
            )}
          </section>

          {/* ── 4. Líneas de producto ─────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle>Productos de la compra</SectionTitle>

            {/* Constructor de línea */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-5">
                  <label className={labelSmClass}>Producto</label>
                  <select value={linea.producto_id} onChange={handleProductoLineaChange} className={inputClass}>
                    <option value="">Seleccionar producto...</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre} — {p.sku} (stock: {p.stock_actual})</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={labelSmClass}>Cantidad</label>
                  <input type="number" min={1} step={1} value={linea.cantidad}
                    onChange={(e) => { setErrorLinea(null); setLinea((p) => ({ ...p, cantidad: e.target.value })); }}
                    placeholder="Ej: 50" className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelSmClass}>Costo ({header.moneda === "USD" ? "USD" : "Gs."})</label>
                  <MontoInput value={linea.costo_input}
                    onChange={(n) => { setErrorLinea(null); setLinea((p) => ({ ...p, costo_input: String(n) })); }}
                    placeholder={header.moneda === "USD" ? "Ej: 12" : "Ej: 35000"}
                    className={inputClass} decimals={header.moneda === "USD"} />
                </div>
                <div className="md:col-span-3">
                  <label className={labelSmClass}>IVA</label>
                  <SegmentedControl<TipoIva>
                    small
                    value={linea.iva_tipo}
                    options={[{ value: "exenta", label: "Ex" }, { value: "5", label: "5%" }, { value: "10", label: "10%" }]}
                    onChange={(v) => setLinea((p) => ({ ...p, iva_tipo: v }))}
                  />
                </div>
              </div>

              {/* Preview de la línea + agregar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-gray-500 flex gap-3">
                  {header.moneda === "USD" && costoPYG > 0 && <span>≈ {formatGs(costoPYG)}/u</span>}
                  {lineaSubtotal > 0 && (
                    <>
                      <span>Subtotal: <strong className="text-gray-700">{formatGs(lineaSubtotal)}</strong></span>
                      <span>IVA: <strong className="text-gray-700">{linea.iva_tipo === "exenta" ? "—" : formatGs(lineaIvaMonto)}</strong></span>
                      <span>Total: <strong className="text-gray-900">{formatGs(lineaTotal)}</strong></span>
                    </>
                  )}
                </div>
                <button type="button" onClick={agregarLinea} disabled={!lineaValida}
                  className="inline-flex items-center gap-1.5 bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                  </svg>
                  Agregar línea
                </button>
              </div>

              {errorLinea && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  <span>⚠</span><span className="font-medium">{errorLinea}</span>
                </div>
              )}

              {!mostrarFormProducto ? (
                <button type="button" onClick={() => { setMostrarFormProducto(true); setProductoCreado(null); }}
                  className="text-xs text-gray-400 hover:text-gray-700 underline transition-colors">
                  ¿No encontrás el producto? Crear nuevo
                </button>
              ) : (
                <InlineFormBox titulo="Nuevo producto" onCancel={handleCancelarProducto} onSave={handleAgregarProducto}
                  saveDisabled={!formProducto.nombre.trim() || !formProducto.sku.trim()}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelSmClass}>Nombre <span className="text-red-500">*</span></label>
                      <input type="text" name="nombre" value={formProducto.nombre} onChange={handleProductoInputChange}
                        placeholder="Ej: ACEITE GIRASOL 1L" className={`${inputSmClass} uppercase`} />
                    </div>
                    <div>
                      <label className={labelSmClass}>SKU / Código <span className="text-red-500">*</span></label>
                      <input type="text" name="sku" value={formProducto.sku} onChange={handleProductoInputChange}
                        placeholder="Ej: ACE-001" className={`${inputSmClass} uppercase ${errorSku ? "border-red-300 bg-red-50" : ""}`} />
                      {errorSku && <p className="mt-1 text-xs text-red-600">{errorSku}</p>}
                    </div>
                    <div>
                      <label className={labelSmClass}>Unidad de medida</label>
                      <select name="unidad_medida" value={formProducto.unidad_medida} onChange={handleProductoInputChange} className={inputSmClass}>
                        <option value="Unidad">Unidad</option>
                        <option value="Par">Par</option>
                        <option value="Caja">Caja</option>
                        <option value="Kg">Kg</option>
                        <option value="Litro">Litro</option>
                        <option value="Metro">Metro</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelSmClass}>Stock mínimo</label>
                      <input type="number" name="stock_minimo" value={formProducto.stock_minimo} onChange={handleProductoInputChange}
                        placeholder="Ej: 5" min={0} className={inputSmClass} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelSmClass}>Precio de venta sugerido (Gs.)</label>
                      <MontoInput value={formProducto.precio_venta_sugerido}
                        onChange={(n) => setFormProducto((prev) => ({ ...prev, precio_venta_sugerido: String(n) }))}
                        placeholder="Ej: 75000" className={inputSmClass} decimals={false} />
                      {margenPreview !== null && (
                        <p className="mt-1 text-xs text-gray-500">
                          Margen s/venta: {margenPreview.toFixed(2)}% (costo línea: {formatGs(costoPYG)})
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        Se usa solo para crear el producto. La compra no modifica el precio de venta.
                      </p>
                    </div>
                  </div>
                </InlineFormBox>
              )}
            </div>

            {/* Tabla de líneas agregadas */}
            {items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] sm:min-w-0 text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-xs font-semibold">
                      <th className="py-2.5 pr-3 font-medium">Producto</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Cant.</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Costo u.</th>
                      <th className="py-2.5 pr-3 font-medium text-center hidden sm:table-cell">IVA</th>
                      <th className="py-2.5 pr-3 font-medium text-right hidden sm:table-cell">Subtotal</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Total</th>
                      <th className="py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-b border-slate-200 last:border-0">
                        <td className="py-3 pr-3 font-medium text-gray-800">
                          {it.producto_nombre}
                          <span className="ml-1.5 font-mono text-xs text-gray-400">{it.sku}</span>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">{it.cantidad}</td>
                        <td className="py-3 pr-3 text-right tabular-nums text-gray-600 text-xs">{formatGs(it.costo_unitario)}</td>
                        <td className="py-3 pr-3 text-center hidden sm:table-cell">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">{ivaLabel[it.iva_tipo]}</span>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-gray-600 text-xs hidden sm:table-cell">{formatGs(it.subtotal)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums font-semibold text-gray-800">{formatGs(it.total_linea)}</td>
                        <td className="py-3 text-center">
                          <button type="button" onClick={() => quitarLinea(idx)}
                            className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] text-red-400 hover:text-red-700 rounded hover:bg-red-50" title="Quitar línea">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totales de la compra */}
                <div className="mt-4 flex justify-end">
                  <div className="w-full sm:w-72 space-y-1.5">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotal</span><span className="tabular-nums font-medium">{formatGs(totalSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>IVA</span><span className="tabular-nums font-medium">{totalIva > 0 ? formatGs(totalIva) : "—"}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                      <span>TOTAL</span><span className="tabular-nums">{formatGs(totalGeneral)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── 5. Factura del proveedor (opcional) ───────────────────────── */}
          <section className="space-y-3">
            <SectionTitle>Factura del proveedor (opcional)</SectionTitle>
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                {facturaPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={facturaPreview} alt="Vista previa factura" className="w-full h-full object-cover" />
                ) : facturaFile ? (
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">PDF</span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7 text-slate-300">
                    <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0L2.5 11.06ZM12 6.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm px-4 py-2 rounded-lg cursor-pointer transition-colors">
                    {facturaFile ? "Cambiar factura" : "Adjuntar factura"}
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleFacturaChange} />
                  </label>
                  {facturaFile && (
                    <button type="button" onClick={quitarFactura}
                      className="text-sm text-red-600 hover:text-red-800 px-3 py-2 rounded-lg border border-slate-200 hover:bg-red-50">
                      Quitar
                    </button>
                  )}
                </div>
                {facturaFile && (
                  <p className="mt-1.5 text-xs text-slate-500 truncate">{facturaFile.name}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">JPG, PNG, WebP o PDF — máx. 10 MB. Se adjunta al guardar la compra.</p>
                {facturaError && <p className="mt-1.5 text-xs text-red-600">{facturaError}</p>}
              </div>
            </div>
          </section>

          {/* Banner impacto en inventario */}
          {items.length > 0 && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-xs text-green-700">
              <span className="mt-0.5 text-base leading-none">✓</span>
              <span>Al guardar se registrará una entrada de inventario por cada una de las <strong>{items.length} líneas</strong> (stock + costo promedio por producto).</span>
            </div>
          )}

          {errorSubmit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{errorSubmit}</p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-4 pt-2">
            <button type="submit" disabled={!compraValida || submitting}
              className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-5 py-3 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95">
              {submitting ? "Guardando..." : "Guardar compra"}
            </button>
            <button type="button" onClick={() => router.push("/compras")}
              className="border border-slate-200 px-5 py-3 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{children}</h3>;
}

function InlineFormBox({
  titulo, children, onSave, onCancel, saveDisabled,
}: {
  titulo: string;
  children: React.ReactNode;
  onSave: () => void;
  onCancel: () => void;
  saveDisabled: boolean;
}) {
  return (
    <div className="mt-2 border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{titulo}</p>
      {children}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onSave} disabled={saveDisabled}
          className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95">
          Guardar {titulo.toLowerCase()}
        </button>
        <button type="button" onClick={onCancel}
          className="border border-slate-200 px-4 py-2 rounded-lg text-xs hover:bg-white transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  );
}
