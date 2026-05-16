"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import { getProducto, productoExiste, updateProducto } from "@/lib/inventario/storage";
import type { MetodoValuacion } from "@/lib/inventario/types";
import ProductImageUploader from "@/components/inventario/ProductImageUploader";

export default function EditarProductoPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) ?? "";

  const [cargando, setCargando] = useState(true);
  const [errorDuplicado, setErrorDuplicado] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombre: "",
    sku: "",
    codigo_barras: "",
    codigo_barras_interno: false,
    costo_promedio: "",
    markup: "",
    precio_venta: "",
    stock_actual: "",
    stock_minimo: "",
    unidad_medida: "",
    metodo_valuacion: "CPP" as MetodoValuacion,
  });
  const [imagenPath, setImagenPath] = useState<string | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [codigoOriginal, setCodigoOriginal] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getProducto(id).then((p) => {
      if (cancelled || !p) return;
      const costo = p.costo_promedio;
      const precio = p.precio_venta;
      const markup = costo > 0 ? ((precio - costo) / costo) * 100 : 0;
      setForm({
        nombre: p.nombre,
        sku: p.sku,
        codigo_barras: p.codigo_barras ?? "",
        codigo_barras_interno: p.codigo_barras_interno === true,
        costo_promedio: String(p.costo_promedio),
        markup: markup.toFixed(2),
        precio_venta: String(p.precio_venta),
        stock_actual: String(p.stock_actual),
        stock_minimo: String(p.stock_minimo),
        unidad_medida: p.unidad_medida,
        metodo_valuacion: p.metodo_valuacion,
      });
      setCodigoOriginal(p.codigo_barras ?? null);
      setImagenPath(p.imagen_path ?? null);
      setImagenUrl(p.imagen_url ?? null);
    }).finally(() => {
      if (!cancelled) setCargando(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setErrorDuplicado(null);
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleCostoChange(costo: number) {
    setErrorDuplicado(null);
    const markup = parseFloat(form.markup);
    const precio = parseFloat(form.precio_venta);
    if (!isNaN(costo) && costo > 0 && !isNaN(markup)) {
      const nuevoPrecio = costo * (1 + markup / 100);
      setForm((prev) => ({ ...prev, costo_promedio: String(costo), precio_venta: nuevoPrecio.toFixed(0) }));
    } else if (!isNaN(costo) && costo > 0 && !isNaN(precio)) {
      const nuevoMarkup = ((precio - costo) / costo) * 100;
      setForm((prev) => ({ ...prev, costo_promedio: String(costo), markup: nuevoMarkup.toFixed(2) }));
    } else {
      setForm((prev) => ({ ...prev, costo_promedio: String(costo) }));
    }
  }

  function handleMarkupChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorDuplicado(null);
    const markup = parseFloat(e.target.value);
    const costo = parseFloat(form.costo_promedio);
    if (!isNaN(markup) && !isNaN(costo) && costo > 0) {
      const nuevoPrecio = costo * (1 + markup / 100);
      setForm((prev) => ({ ...prev, markup: e.target.value, precio_venta: nuevoPrecio.toFixed(0) }));
    } else {
      setForm((prev) => ({ ...prev, markup: e.target.value }));
    }
  }

  function handlePrecioChange(precio: number) {
    setErrorDuplicado(null);
    const costo = parseFloat(form.costo_promedio);
    if (!isNaN(precio) && !isNaN(costo) && costo > 0) {
      const nuevoMarkup = ((precio - costo) / costo) * 100;
      setForm((prev) => ({ ...prev, precio_venta: String(precio), markup: nuevoMarkup.toFixed(2) }));
    } else {
      setForm((prev) => ({ ...prev, precio_venta: String(precio) }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErrorDuplicado(null);

    const codigoIngresado = form.codigo_barras.trim();
    // Validar: si cambio el codigo y empieza con INT-, rechazar (reservado)
    if (codigoIngresado && codigoIngresado !== codigoOriginal && /^INT-/i.test(codigoIngresado)) {
      setErrorDuplicado('El prefijo "INT-" está reservado para códigos generados por el sistema. Usá otro código o dejá el actual.');
      return;
    }

    const duplicado = await productoExiste(form.sku, form.nombre);
    if (duplicado && duplicado.id !== id) {
      setErrorDuplicado(`Ya existe "${duplicado.nombre}" con SKU ${duplicado.sku}.`);
      return;
    }

    setSubmitting(true);
    try {
      // Reglas de codigo en edicion:
      // - Si quedo igual al original -> no tocar el campo (preservar codigo_barras_interno).
      // - Si cambio y no esta vacio -> codigo_barras_interno = false (manual).
      // - Si quedo vacio -> codigo_barras = null, codigo_barras_interno = false.
      //   (No auto-regeneramos en edicion: evita sorprender al usuario.)
      const cambioCodigo = codigoIngresado !== (codigoOriginal ?? "");
      const updatePayload: Parameters<typeof updateProducto>[1] = {
        nombre: form.nombre.trim().toUpperCase(),
        sku: form.sku.trim().toUpperCase(),
        costo_promedio: parseFloat(form.costo_promedio) || 0,
        precio_venta: parseFloat(form.precio_venta) || 0,
        stock_actual: parseInt(form.stock_actual) || 0,
        stock_minimo: parseInt(form.stock_minimo) || 0,
        unidad_medida: form.unidad_medida.trim().toUpperCase(),
        metodo_valuacion: form.metodo_valuacion,
      };
      if (cambioCodigo) {
        updatePayload.codigo_barras = codigoIngresado || null;
        updatePayload.codigo_barras_interno = false;
      }

      const actualizado = await updateProducto(id, updatePayload);
      if (actualizado) router.push("/inventario");
    } finally {
      setSubmitting(false);
    }
  }

  const costo = parseFloat(form.costo_promedio);
  const precio = parseFloat(form.precio_venta);
  const tieneAmbos = !isNaN(costo) && !isNaN(precio) && costo > 0 && precio > 0;
  const markupCalc = tieneAmbos ? ((precio - costo) / costo) * 100 : null;
  const margenVentaCalc = tieneAmbos ? ((precio - costo) / precio) * 100 : null;
  const esPerdida = markupCalc !== null && markupCalc < 0;

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-gray-500 transition-colors text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-2";

  if (cargando) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-gray-800">Editar producto</h1>
        <p className="text-gray-500 animate-pulse">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Editar producto</h1>
        <p className="text-gray-600">Modifica los datos del producto</p>
      </div>

      <div className="bg-white rounded-xl shadow p-6 max-w-3xl">
        <form className="space-y-6" onSubmit={handleSubmit}>
          {errorDuplicado && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-700">{errorDuplicado}</p>
            </div>
          )}

          <div>
            <label className={labelClass}>Nombre del producto</label>
            <input
              type="text"
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              className={`${inputClass} uppercase`}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>SKU</label>
              <input
                type="text"
                name="sku"
                value={form.sku}
                onChange={handleChange}
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
                className={`${inputClass} uppercase`}
                required
              />
            </div>
          </div>

          {/* Codigo de barras */}
          <div>
            <label className={labelClass}>
              Código de barras
              {form.codigo_barras_interno && form.codigo_barras && form.codigo_barras === codigoOriginal && (
                <span className="ml-2 align-middle text-[10px] uppercase tracking-wider bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">
                  Interno
                </span>
              )}
            </label>
            <input
              type="text"
              name="codigo_barras"
              value={form.codigo_barras}
              onChange={handleChange}
              placeholder="Escaneá o escribí un código real"
              className={inputClass}
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              {form.codigo_barras_interno && form.codigo_barras === codigoOriginal
                ? "Código interno generado por el sistema. Podés reemplazarlo por uno real (no puede empezar con \"INT-\")."
                : "Podés escanearlo o escribirlo. El prefijo \"INT-\" queda reservado para códigos del sistema."}
            </p>
          </div>

          {/* Imagen del producto */}
          <div>
            <label className={labelClass}>Imagen del producto</label>
            <ProductImageUploader
              productoId={id}
              initialUrl={imagenUrl}
              initialPath={imagenPath}
              onChange={(info) => {
                setImagenPath(info.imagen_path);
                setImagenUrl(info.imagen_url);
              }}
            />
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">Precios</p>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className={labelClass}>Costo promedio (Gs.)</label>
                <MontoInput
                  value={form.costo_promedio}
                  onChange={handleCostoChange}
                  className={inputClass}
                  decimals={false}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Markup s/costo (%)</label>
                <input
                  type="number"
                  name="markup"
                  value={form.markup}
                  onChange={handleMarkupChange}
                  className={inputClass}
                  step="0.01"
                />
              </div>
              <div>
                <label className={labelClass}>Precio de venta (Gs.)</label>
                <MontoInput
                  value={form.precio_venta}
                  onChange={handlePrecioChange}
                  className={inputClass}
                  decimals={false}
                  required
                />
              </div>
            </div>
            {tieneAmbos && markupCalc !== null && margenVentaCalc !== null && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className={`border rounded-lg px-4 py-3 ${esPerdida ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-100"}`}>
                  <p className={`text-xs font-medium mb-1 ${esPerdida ? "text-red-500" : "text-blue-500"}`}>Markup</p>
                  <p className={`text-lg font-bold tabular-nums ${esPerdida ? "text-red-700" : "text-blue-700"}`}>
                    {markupCalc.toFixed(2)}%
                  </p>
                </div>
                <div className={`border rounded-lg px-4 py-3 ${esPerdida ? "bg-red-50 border-red-200" : "bg-green-50 border-green-100"}`}>
                  <p className={`text-xs font-medium mb-1 ${esPerdida ? "text-red-500" : "text-green-500"}`}>Margen s/venta</p>
                  <p className={`text-lg font-bold tabular-nums ${esPerdida ? "text-red-700" : "text-green-700"}`}>
                    {margenVentaCalc.toFixed(2)}%
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Stock actual</label>
              <input
                type="number"
                name="stock_actual"
                value={form.stock_actual}
                onChange={handleChange}
                className={inputClass}
                min={0}
                required
              />
              <p className="mt-1 text-xs text-gray-400">
                Para ajustes de stock, preferí registrar un <Link href="/inventario/movimientos/nuevo" className="underline">movimiento</Link>.
              </p>
            </div>
            <div>
              <label className={labelClass}>Stock mínimo</label>
              <input
                type="number"
                name="stock_minimo"
                value={form.stock_minimo}
                onChange={handleChange}
                className={inputClass}
                min={0}
                required
              />
            </div>
          </div>

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

          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-gray-900 text-white px-5 py-3 rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/inventario")}
              className="border border-gray-300 px-5 py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
