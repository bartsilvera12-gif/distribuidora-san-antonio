import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getProveedoresConCategorias } from "@/lib/proveedores/server/proveedores-service";
import type { Proveedor } from "@/lib/proveedores/types";
import ProveedoresClient from "./ProveedoresClient";

// Datos por sesión (lee cookies) → render dinámico, sin cache estática.
export const dynamic = "force-dynamic";

/**
 * Server Component: resuelve auth + empresa y trae los proveedores DIRECTO de la
 * base (sin round-trip HTTP, sin doble auth, sin waterfall de cliente). Pasa los
 * datos ya listos a la isla cliente.
 *
 * Si la carga server-side falla (p. ej. no se pudo resolver la sesión por cookie),
 * `serverLoaded=false` y el cliente hace el fetch como antes — así nunca queda
 * peor que la versión anterior.
 */
export default async function ProveedoresPage() {
  let initial: Proveedor[] = [];
  let serverLoaded = false;

  try {
    const auth = await getUserAndEmpresa();
    if (auth?.empresa_id) {
      const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
      initial = await getProveedoresConCategorias(schema, auth.empresa_id);
      serverLoaded = true;
    }
  } catch (err) {
    console.error("[proveedores page RSC]", err instanceof Error ? err.message : err);
  }

  return <ProveedoresClient initialProveedores={initial} serverLoaded={serverLoaded} />;
}
