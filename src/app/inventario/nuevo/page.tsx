"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import { productoExiste, saveProducto } from "@/lib/inventario/storage";
import type { MetodoValuacion } from "@/lib/inventario/types";

export default function NuevoProductoPage() {
  const router = useRouter();
  const [errorDuplicado, setErrorDuplicado] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombre: "",
    sku: "",
    codigo_barras: "",
    costo_promedio: "",
    markup: "",
    precio_venta: "",
    stock_actual: "",
    stock_minimo: "",
    unidad_medida: "",
    metodo_valuacion: "CPP" as MetodoValuacion,
  });
  const [submitting, setSubmitting] = useState(false);

  // Campos sin lógica reactiva
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setErrorDuplicado(null);
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  /**
   * Al cambiar costo:
   * - si hay markup → recalcula precio_venta = costo * (1 + markup/100)
   * - si no hay markup pero hay precio → recalcula markup = ((precio-costo)/costo)*100
   */
  function handleCostoChange(costo: number) {
    setErrorDuplicado(null);
    const markup = parseFloat(form.markup);
    const precio = parseFloat(form.precio_venta);

    if (!isNaN(costo) && costo > 0 && !isNaN(markup)) {
      const nuevoPrecio = costo * (1 + markup / 100);
      setForm((prev) => ({
        ...prev,
        costo_promedio: String(costo),
        precio_venta: nuevoPrecio.toFixed(0),
      }));
    } else if (!isNaN(costo) && costo > 0 && !isNaN(precio)) {
      const nuevoMarkup = ((precio - costo) / costo) * 100;
      setForm((prev) => ({
        ...prev,
        costo_promedio: String(costo),
        markup: nuevoMarkup.toFixed(2),
      }));
    } else {
      setForm((prev) => ({ ...prev, costo_promedio: String(costo) }));
    }
  }

  /**
   * Al cambiar markup → recalcula precio_venta (permite markup negativo = venta a pérdida)
   */
  function handleMarkupChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorDuplicado(null);
    const markup = parseFloat(e.target.value);
    const costo = parseFloat(form.costo_promedio);

    if (!isNaN(markup) && !isNaN(costo) && costo > 0) {
      const nuevoPrecio = costo * (1 + markup / 100);
      setForm((prev) => ({
        ...prev,
        markup: e.target.value,
        precio_venta: nuevoPrecio.toFixed(0),
      }));
    } else {
      setForm((prev) => ({ ...prev, markup: e.target.value }));
    }
  }

  /**
   * Al cambiar precio → recalcula markup (puede resultar negativo si precio < costo)
   */
  function handlePrecioChange(precio: number) {
    setErrorDuplicado(null);
    const costo = parseFloat(form.costo_promedio);

    if (!isNaN(precio) && !isNaN(costo) && costo > 0) {
      const nuevoMarkup = ((precio - costo) / costo) * 100;
      setForm((prev) => ({
        ...prev,
        precio_venta: String(precio),
        markup: nuevoMarkup.toFixed(2),
      }));
    } else {
      setForm((prev) => ({ ...prev, precio_venta: String(precio) }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErrorDuplicado(null);

    const codigoManual = form.codigo_barras.trim();
    if (codigoManual && /^INT-/i.test(codigoManual)) {
      setErrorDuplicado('El prefijo "INT-" está reservado para códigos generados por el sistema. Dejá el campo vacío para autogenerar uno, o ingresá otro código.');
      return;
    }

    const duplicado = await productoExiste(form.sku, form.nombre);
    if (duplicado) {
      setErrorDuplicado(
        `Ya existe "${duplicado.nombre}" con SKU ${duplicado.sku}.`
      );
      return;
    }

    setSubmitting(true);
    try {
      // Si no hay codigo manual, pedir uno interno al backend (atomico, unico por empresa)
      let codigo: string | null = codigoManual || null;
      let interno = false;
      if (!codigo) {
        try {
          const res = await fetch("/api/productos/codigo-interno", {
            method: "POST",
            credentials: "include",
          });
          const json = await res.json();
          if (res.ok && json?.success && json.data?.codigo) {
            codigo = json.data.codigo as string;
            interno = true;
          }
        } catch {
          // si falla, continuamos sin codigo (queda en NULL)
          codigo = null;
        }
      }

      const guardado = await saveProducto({
        nombre: form.nombre.trim().toUpperCase(),
        sku: form.sku.trim().toUpperCase(),
        costo_promedio: parseFloat(form.costo_promedio) || 0,
        precio_venta: parseFloat(form.precio_venta) || 0,
        stock_actual: parseInt(form.stock_actual) || 0,
        stock_minimo: parseInt(form.stock_minimo) || 0,
        unidad_medida: form.unidad_medida.trim().toUpperCase(),
        metodo_valuacion: form.metodo_valuacion,
        codigo_barras: codigo,
        codigo_barras_interno: interno,
      });

      if (guardado) {
        // Si quiere subir imagen, ir directo a editar
        router.push(`/inventario/${guardado.id}/editar`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Cálculos en tiempo real ──────────────────────────────────────────────────
  const costo = parseFloat(form.costo_promedio);
  const precio = parseFloat(form.precio_venta);
  const tieneAmbos = !isNaN(costo) && !isNaN(precio) && costo > 0 && precio > 0;
  const markupCalc = tieneAmbos ? ((precio - costo) / costo) * 100 : null;
  const margenVentaCalc = tieneAmbos ? ((precio - costo) / precio) * 100 : null;
  const esPerdida = markupCalc !== null && markupCalc < 0;

  const inputClass =
    "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none bg-white text-sm";
  const labelClass = "block text-sm font-medium text-slate-700 mb-2";

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-3xl font-bold text-gray-800">Nuevo producto</h1>
        <p className="text-gray-600">
          Completa los datos para registrar un producto en inventario
        </p>
      </div>

      <div className="bg-white rounded-xl shadow p-6 max-w-3xl">
        <form className="space-y-6" onSubmit={handleSubmit}>

          {/* Error de duplicado */}
          {errorDuplicado && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-1">
              <p className="text-sm font-semibold text-red-700">
                Este producto ya existe en el inventario.
              </p>
              <p className="text-xs text-red-600">{errorDuplicado}</p>
              <p className="text-xs text-red-500">
                Para modificar su stock debés registrar un movimiento de inventario.
              </p>
              <Link
                href="/inventario/movimientos"
                className="inline-block mt-2 text-xs text-red-700 underline hover:text-red-900"
              >
                Ir a Movimientos →
              </Link>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className={labelClass}>Nombre del producto</label>
            <input
              type="text"
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              placeholder="Ej: REMERA OVERSIZE BLANCA"
              className={`${inputClass} uppercase`}
              required
            />
          </div>

          {/* SKU + Unidad de medida */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>SKU</label>
              <input
                type="text"
                name="sku"
                value={form.sku}
                onChange={handleChange}
                placeholder="Ej: OOTD-001"
                className={`${inputClass} uppercase`}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Unidad de medida</label>
              <input
                type="text"
                name="unidad_medida"
                value={form.unidad_medida}
                onChange={handleChange}
                placeholder="Ej: UNIDAD, KG, LT"
                className={`${inputClass} uppercase`}
                required
              />
            </div>
          </div>

          {/* Código de barras */}
          <div>
            <label className={labelClass}>Código de barras</label>
            <input
              type="text"
              name="codigo_barras"
              value={form.codigo_barras}
              onChange={handleChange}
              placeholder="Escaneá o escribí — dejá vacío para autogenerar"
              className={inputClass}
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Si dejás vacío este campo, el sistema generará un código interno automáticamente
              (formato <code className="font-mono">INT-XXX-YYYYMM-NNNNNN</code>).
              El prefijo <code className="font-mono">INT-</code> queda reservado para códigos internos.
            </p>
          </div>

          {/* Costo + Markup + Precio — bloque reactivo */}
          <div>
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">
              Precios — los tres campos son reactivos entre sí
            </p>
            <div className="grid grid-cols-3 gap-6">

              <div>
                <label className={labelClass}>Costo promedio (Gs.)</label>
                <MontoInput
                  value={form.costo_promedio}
                  onChange={handleCostoChange}
                  placeholder="Ej: 52000"
                  className={inputClass}
                  decimals={false}
                  required
                />
              </div>

              <div>
                <label className={labelClass}>Markup s/costo (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    name="markup"
                    value={form.markup}
                    onChange={handleMarkupChange}
                    placeholder="Ej: 50.00"
                    className={`${inputClass} pr-8`}
                    step="0.01"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                    %
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">(precio − costo) / costo</p>
              </div>

              <div>
                <label className={labelClass}>Precio de venta (Gs.)</label>
                <MontoInput
                  value={form.precio_venta}
                  onChange={handlePrecioChange}
                  placeholder="Ej: 78000"
                  className={inputClass}
                  decimals={false}
                  required
                />
              </div>

            </div>

            {/* Indicadores de rentabilidad en tiempo real */}
            {tieneAmbos && markupCalc !== null && margenVentaCalc !== null && (
              <div className="mt-4 space-y-3">

                {/* Advertencia de pérdida */}
                {esPerdida && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-600">
                    <span className="mt-0.5 text-base leading-none">⚠</span>
                    <span>
                      El precio de venta es <strong>menor al costo</strong>. Cada unidad vendida generará una pérdida neta.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* Markup */}
                  <div className={`border rounded-lg px-4 py-3 ${esPerdida ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-100"}`}>
                    <p className={`text-xs font-medium mb-1 ${esPerdida ? "text-red-500" : "text-blue-500"}`}>
                      Markup sobre costo
                    </p>
                    <p className={`text-lg font-bold tabular-nums ${esPerdida ? "text-red-700" : "text-blue-700"}`}>
                      {markupCalc.toFixed(2)}%
                    </p>
                    <p className={`text-xs mt-0.5 ${esPerdida ? "text-red-400" : "text-blue-400"}`}>
                      {esPerdida
                        ? `Se vende ${Math.abs(markupCalc).toFixed(0)}% por debajo del costo`
                        : `Se agrega ${markupCalc.toFixed(0)}% encima del costo`}
                    </p>
                  </div>

                  {/* Margen sobre venta */}
                  <div className={`border rounded-lg px-4 py-3 ${esPerdida ? "bg-red-50 border-red-200" : "bg-green-50 border-green-100"}`}>
                    <p className={`text-xs font-medium mb-1 ${esPerdida ? "text-red-500" : "text-green-500"}`}>
                      Margen sobre venta
                    </p>
                    <p className={`text-lg font-bold tabular-nums ${esPerdida ? "text-red-700" : "text-green-700"}`}>
                      {margenVentaCalc.toFixed(2)}%
                    </p>
                    <p className={`text-xs mt-0.5 ${esPerdida ? "text-red-400" : "text-green-400"}`}>
                      {esPerdida
                        ? "Este precio genera pérdida neta en cada venta"
                        : `De cada Gs. vendido, ${margenVentaCalc.toFixed(0)}% es ganancia`}
                    </p>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Stock actual + Stock mínimo */}
          <div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Stock actual</label>
                <input
                  type="number"
                  name="stock_actual"
                  value={form.stock_actual}
                  onChange={handleChange}
                  placeholder="Ej: 50"
                  className={inputClass}
                  min={0}
                  required
                />
              </div>

              <div>
                <label className={labelClass}>Stock mínimo</label>
                <input
                  type="number"
                  name="stock_minimo"
                  value={form.stock_minimo}
                  onChange={handleChange}
                  placeholder="Ej: 10"
                  className={inputClass}
                  min={0}
                  required
                />
              </div>
            </div>
            {parseInt(form.stock_actual) > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                Se generará automáticamente un movimiento de inventario inicial con {form.stock_actual} unidades al guardar.
              </p>
            )}
          </div>

          {/* Método de valuación */}
          <div>
            <label className={labelClass}>Método de valuación</label>
            <select
              name="metodo_valuacion"
              value={form.metodo_valuacion}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="CPP">CPP — Costo Promedio Ponderado</option>
              <option value="FIFO">FIFO — Primero en entrar, primero en salir</option>
              <option value="LIFO">LIFO — Último en entrar, primero en salir</option>
            </select>
          </div>

          {/* Acciones */}
          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-5 py-3 rounded-lg text-sm font-medium transition-colors shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando..." : "Guardar producto"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/inventario")}
              className="border border-slate-200 px-5 py-3 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
          </div>

        </form>
      </div>

    </div>
  );
}
