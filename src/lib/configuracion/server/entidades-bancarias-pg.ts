/**
 * Acceso raw-PG al catálogo `sanantonio.entidades_bancarias`.
 * Mismo patrón que reportes-pg / compras-pg (pool postgres con BYPASSRLS, owner
 * de la tabla → no depende del schema cache de PostgREST).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import type { EntidadBancaria } from "@/lib/configuracion/entidades-bancarias";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

const clean = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
};

export async function listEntidadesBancarias(
  schemaRaw: string,
  empresaId: string,
  opts?: { incluirInactivas?: boolean }
): Promise<EntidadBancaria[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "entidades_bancarias");
  const where = opts?.incluirInactivas
    ? "empresa_id=$1::uuid"
    : "empresa_id=$1::uuid AND activo=true";
  const r = await pool().query<EntidadBancaria>(
    `SELECT id, codigo, nombre, tipo, activo FROM ${t}
      WHERE ${where}
      ORDER BY activo DESC, lower(nombre) ASC`,
    [empresaId]
  );
  return r.rows;
}

export async function createEntidadBancaria(
  schemaRaw: string,
  empresaId: string,
  input: { nombre: string; codigo?: string | null; tipo?: string | null }
): Promise<EntidadBancaria> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "entidades_bancarias");
  const nombre = clean(input.nombre);
  if (!nombre) throw new Error("El nombre de la entidad es obligatorio.");
  try {
    const r = await pool().query<EntidadBancaria>(
      `INSERT INTO ${t} (empresa_id, nombre, codigo, tipo)
       VALUES ($1::uuid, $2, $3, $4)
       RETURNING id, codigo, nombre, tipo, activo`,
      [empresaId, nombre, clean(input.codigo), clean(input.tipo)]
    );
    return r.rows[0];
  } catch (e) {
    throw mapUniqueError(e);
  }
}

export async function updateEntidadBancaria(
  schemaRaw: string,
  empresaId: string,
  id: string,
  input: { nombre?: string; codigo?: string | null; tipo?: string | null; activo?: boolean }
): Promise<EntidadBancaria> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "entidades_bancarias");
  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (input.nombre !== undefined) {
    const n = clean(input.nombre);
    if (!n) throw new Error("El nombre no puede quedar vacío.");
    sets.push(`nombre=$${i++}`);
    args.push(n);
  }
  if (input.codigo !== undefined) {
    sets.push(`codigo=$${i++}`);
    args.push(clean(input.codigo));
  }
  if (input.tipo !== undefined) {
    sets.push(`tipo=$${i++}`);
    args.push(clean(input.tipo));
  }
  if (input.activo !== undefined) {
    sets.push(`activo=$${i++}`);
    args.push(input.activo);
  }
  if (!sets.length) throw new Error("Nada para actualizar.");
  sets.push("updated_at=now()");
  const idIdx = i++;
  args.push(id);
  const empIdx = i++;
  args.push(empresaId);
  try {
    const r = await pool().query<EntidadBancaria>(
      `UPDATE ${t} SET ${sets.join(", ")}
        WHERE id=$${idIdx}::uuid AND empresa_id=$${empIdx}::uuid
        RETURNING id, codigo, nombre, tipo, activo`,
      args
    );
    if (!r.rows.length) throw new Error("Entidad no encontrada.");
    return r.rows[0];
  } catch (e) {
    throw mapUniqueError(e);
  }
}

function mapUniqueError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/uq_entidades_bancarias_empresa_nombre/.test(msg)) {
    return new Error("Ya existe una entidad con ese nombre.");
  }
  if (/uq_entidades_bancarias_empresa_codigo/.test(msg)) {
    return new Error("Ya existe una entidad con ese código.");
  }
  return e instanceof Error ? e : new Error(msg);
}
