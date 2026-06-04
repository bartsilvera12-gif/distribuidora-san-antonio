import type { Proveedor, ProveedorCategoria } from "@/lib/proveedores/types";
import {
  listProveedores,
  listCategoriasMin,
  listRelaciones,
  type ProveedorRow,
} from "./proveedores-pg";

/** Mapea una fila cruda de `proveedores` (PG) al tipo de dominio `Proveedor`. */
export function mapProveedorRow(r: ProveedorRow): Proveedor {
  return {
    id: r.id,
    empresa_id: r.empresa_id,
    nombre: r.nombre ?? "",
    nombre_comercial: r.nombre_comercial ?? null,
    razon_social: r.razon_social ?? null,
    ruc: r.ruc ?? null,
    telefono: r.telefono ?? null,
    email: r.email ?? null,
    direccion: r.direccion ?? null,
    contacto: r.contacto ?? null,
    estado: r.estado === "inactivo" ? "inactivo" : "activo",
    condicion_pago:
      r.condicion_pago === "contado" || r.condicion_pago === "credito" || r.condicion_pago === "mixto"
        ? r.condicion_pago
        : null,
    plazo_pago_dias: r.plazo_pago_dias != null ? Number(r.plazo_pago_dias) : null,
    moneda_preferida:
      r.moneda_preferida === "USD" ? "USD" : r.moneda_preferida === "GS" ? "GS" : null,
    observaciones: r.observaciones ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * Lista proveedores con sus categorías resueltas (3 lecturas en paralelo + join
 * en memoria). Lógica COMPARTIDA entre el route handler `/api/proveedores` (GET)
 * y el Server Component de la página `/proveedores`, para que ambos devuelvan
 * exactamente la misma forma sin duplicar el mapeo.
 */
export async function getProveedoresConCategorias(
  schema: string,
  empresaId: string
): Promise<Proveedor[]> {
  const [provs, cats, rels] = await Promise.all([
    listProveedores(schema, empresaId),
    listCategoriasMin(schema, empresaId),
    listRelaciones(schema, empresaId),
  ]);

  const catById = new Map<string, Pick<ProveedorCategoria, "id" | "nombre" | "activo">>();
  for (const c of cats) catById.set(c.id, { id: c.id, nombre: c.nombre, activo: c.activo });

  const catsByProveedor = new Map<string, Pick<ProveedorCategoria, "id" | "nombre" | "activo">[]>();
  for (const rel of rels) {
    const cat = catById.get(rel.categoria_id);
    if (!cat) continue;
    const list = catsByProveedor.get(rel.proveedor_id) ?? [];
    list.push(cat);
    catsByProveedor.set(rel.proveedor_id, list);
  }

  return provs.map((row) => {
    const p = mapProveedorRow(row);
    p.categorias = catsByProveedor.get(p.id) ?? [];
    return p;
  });
}
