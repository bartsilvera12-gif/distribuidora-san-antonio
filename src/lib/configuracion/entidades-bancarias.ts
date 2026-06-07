import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/** Entidad bancaria del catálogo (banco / financiera / billetera). */
export interface EntidadBancaria {
  id: string;
  codigo: string | null;
  nombre: string;
  tipo: string | null;
  activo: boolean;
}

export type EntidadBancariaInput = {
  nombre: string;
  codigo?: string | null;
  tipo?: string | null;
};

/** Lista entidades. Por defecto solo activas; `todas=true` incluye inactivas (pantalla de config). */
export async function getEntidadesBancarias(todas = false): Promise<EntidadBancaria[]> {
  try {
    const res = await fetchWithSupabaseSession(
      `/api/configuracion/entidades-bancarias${todas ? "?todas=1" : ""}`,
      { cache: "no-store" }
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { entidades?: EntidadBancaria[] };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.entidades) {
      console.error("[entidades-bancarias] list:", json.error ?? res.statusText);
      return [];
    }
    return json.data.entidades;
  } catch (e) {
    console.error("[entidades-bancarias] list:", e);
    return [];
  }
}

export type ResultadoEntidad =
  | { success: true; entidad: EntidadBancaria }
  | { success: false; error: string };

export async function crearEntidadBancaria(input: EntidadBancariaInput): Promise<ResultadoEntidad> {
  try {
    const res = await fetchWithSupabaseSession("/api/configuracion/entidades-bancarias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { entidad?: EntidadBancaria };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.entidad) {
      return { success: false, error: json.error ?? `No se pudo crear (${res.status}).` };
    }
    return { success: true, entidad: json.data.entidad };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

export async function actualizarEntidadBancaria(
  id: string,
  input: Partial<EntidadBancariaInput> & { activo?: boolean }
): Promise<ResultadoEntidad> {
  try {
    const res = await fetchWithSupabaseSession(`/api/configuracion/entidades-bancarias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { entidad?: EntidadBancaria };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.entidad) {
      return { success: false, error: json.error ?? `No se pudo actualizar (${res.status}).` };
    }
    return { success: true, entidad: json.data.entidad };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}
