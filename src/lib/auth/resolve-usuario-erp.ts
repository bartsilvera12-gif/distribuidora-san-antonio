import type { User } from "@supabase/supabase-js";
import type { ModulosSupabase } from "@/lib/modulos/resolve-effective-modules";

export type UsuarioErpBasico = {
  id: string;
  empresa_id: string | null;
  rol: string | null;
};

/**
 * Resuelve la fila `zentra_erp.usuarios` para la sesión de Auth.
 * Prioridad: `auth_user_id` (robusto) → email case-insensitive → alias conocido typo super admin.
 */
export async function resolveUsuarioErpFromAuthUser(
  supabase: ModulosSupabase,
  user: User | null
): Promise<UsuarioErpBasico | null> {
  if (!user) return null;

  if (user.id) {
    const { data: byAuth, error: errAuth } = await supabase
      .from("usuarios")
      .select("id, empresa_id, rol")
      .eq("auth_user_id", user.id)
      .limit(1);
    if (errAuth) {
      console.error("[resolveUsuarioErpFromAuthUser] auth_user_id:", errAuth.message);
    }
    const r = byAuth?.[0] as UsuarioErpBasico | undefined;
    if (r) return r;
  }

  const emailRaw = user.email?.trim();
  if (!emailRaw) return null;

  const lower = emailRaw.toLowerCase();
  const candidates = Array.from(
    new Set([
      lower,
      lower.replace(/neuratomations/gi, "neurautomations"),
      lower.replace(/neurautomations/gi, "neuratomations"),
    ])
  );

  for (const em of candidates) {
    const { data: rows, error } = await supabase
      .from("usuarios")
      .select("id, empresa_id, rol")
      .ilike("email", em)
      .limit(1);
    if (error) {
      console.error("[resolveUsuarioErpFromAuthUser] email:", error.message);
      continue;
    }
    const r = rows?.[0] as UsuarioErpBasico | undefined;
    if (r) return r;
  }

  return null;
}
