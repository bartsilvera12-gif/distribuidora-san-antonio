/**
 * Aplica las 2 migraciones de carga histórica SOLO en STAGING, con doble guarda
 * para que sea imposible correrlas en producción por error.
 *
 * Requisitos (en .env.local o en el entorno):
 *   - SUPABASE_DB_URL        → connection string de STAGING
 *   - CONFIRM_STAGING_HOST   → el host de staging declarado por el operador;
 *                              debe aparecer dentro del host de SUPABASE_DB_URL.
 *
 * Uso:
 *   CONFIRM_STAGING_HOST=<host-staging> npm run db:apply-carga-historica-staging
 *
 * Las migraciones son aditivas e idempotentes (se pueden re-ejecutar sin daño).
 */
const fs = require("fs");
const path = require("path");
const { config } = require("dotenv");
const pg = require("pg");

config({ path: path.resolve(process.cwd(), ".env.local") });

const url = process.env.SUPABASE_DB_URL?.trim();
const confirmHost = process.env.CONFIRM_STAGING_HOST?.trim();

const MIGRATIONS = [
  "supabase/migrations/20261012120000_carga_historica_saldos_iniciales.sql",
  "supabase/migrations/20261012130000_saldo_inicial_caja_bancos.sql",
];

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(2);
}

if (!url) fail("Falta SUPABASE_DB_URL (connection string de STAGING) en .env.local o el entorno.");
if (!confirmHost) {
  fail(
    "Falta CONFIRM_STAGING_HOST. Declará el host de staging para confirmar el destino.\n" +
    "   Ej: CONFIRM_STAGING_HOST=db.xxxxx.supabase.co npm run db:apply-carga-historica-staging"
  );
}

let targetHost = "";
try {
  targetHost = new URL(url).host;
} catch {
  fail("SUPABASE_DB_URL no es una URL válida.");
}

// Guarda: el host declarado como staging debe coincidir con el de la URL.
if (!targetHost.includes(confirmHost)) {
  fail(
    `El host de SUPABASE_DB_URL ("${targetHost}") NO coincide con CONFIRM_STAGING_HOST ("${confirmHost}").\n` +
    "   Abortado para no tocar un entorno equivocado (p. ej. producción)."
  );
}

async function main() {
  console.log(`→ Aplicando migraciones de carga histórica en: ${targetHost}`);
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
    console.log("✓ Migraciones de carga histórica aplicadas en staging.");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
