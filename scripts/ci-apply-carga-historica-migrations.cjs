/**
 * Aplica las 2 migraciones de carga histórica en CI (al mergear a main).
 *
 * - Toma la connection string de la variable de entorno SUPABASE_DB_URL
 *   (inyectada por el workflow desde un GitHub Secret).
 * - Si NO está definida, NO falla: informa y termina (no-op). Así el workflow
 *   solo actúa cuando el secret fue cargado a propósito.
 * - Las migraciones son aditivas e idempotentes → re-ejecutarlas es seguro.
 *
 * La autorización humana se gestiona fuera de este script, mediante el
 * GitHub Environment protegido (required reviewers) que usa el workflow.
 */
const fs = require("fs");
const path = require("path");
const pg = require("pg");

const url = process.env.SUPABASE_DB_URL?.trim();

const MIGRATIONS = [
  "supabase/migrations/20261012120000_carga_historica_saldos_iniciales.sql",
  "supabase/migrations/20261012130000_saldo_inicial_caja_bancos.sql",
];

if (!url) {
  console.log("ℹ SUPABASE_DB_URL no está definido → se omite la aplicación de migraciones (no-op).");
  console.log("  Cargá el secret SUPABASE_DB_URL en el repositorio para habilitar la aplicación automática.");
  process.exit(0);
}

let host = "(desconocido)";
try { host = new URL(url).host; } catch { /* connection string no estándar */ }

async function main() {
  console.log(`→ Aplicando migraciones de carga histórica en: ${host}`);
  const c = new pg.Client({
    connectionString: url,
    ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  try {
    for (const rel of MIGRATIONS) {
      const sql = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      await c.query(sql);
      console.log("  ✓ aplicada:", rel);
    }
    console.log("✓ Migraciones de carga histórica aplicadas.");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("✗ Error aplicando migraciones:", e.message || e);
  process.exit(1);
});
