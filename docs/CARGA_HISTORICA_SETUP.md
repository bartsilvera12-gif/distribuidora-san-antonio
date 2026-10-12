# Runbook — Configuración de carga histórica (San Antonio)

> **No ejecutar en producción.** Primero aplicar en staging y validar.

## 0. Entorno de staging y credenciales (de forma segura)

> **Estado:** el repositorio **no tiene** un entorno de staging configurado ni
> credenciales (no hay `.env*`, no hay CI, `vercel.json` es mínimo). Para probar
> sin riesgo hay que crear/usar un **proyecto de Supabase separado del de
> producción** y pasar su connection string.

Pasos seguros:
1. Crear (o usar) un **proyecto Supabase de STAGING distinto** del de producción
   (otra base, otras keys). Nunca apuntar a la base productiva.
2. Copiar su connection string (Supabase → Project Settings → Database →
   Connection string, modo *session*).
3. Crear un archivo **`.env.local`** en la raíz (ya está en `.gitignore`, **no se
   commitea**) con:
   ```
   SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref-staging>.supabase.co:5432/postgres
   ```
4. No pegar la contraseña en el chat, commits, ni en otros archivos. Rotarla si
   se expone. En Vercel/Hostinger, cargar la variable como *secret* del entorno
   de Preview/Staging, nunca en el de Production.

## 0.b. Aplicación automática al mergear (CI)

Hay un workflow que aplica las 2 migraciones **al mergear a `main`**:
`.github/workflows/apply-carga-historica-migrations.yml`.

**Setup único (una sola vez, lo hacés vos en GitHub):**
1. Repo → **Settings → Environments → New environment** → nombre exacto
   **`database-migrations`**.
2. En ese environment, **Required reviewers** → agregate vos. Así, aunque el
   merge ya ocurrió, la aplicación **queda en espera de tu aprobación** (es la
   autorización de despliegue).
3. En ese environment, **Secrets → New secret** → `SUPABASE_DB_URL` con la
   connection string del entorno elegido (staging primero).

Comportamiento:
- Merge a `main` que toque las migraciones (o **Actions → Run workflow**) dispara
  el job, que **espera tu aprobación** y recién entonces aplica.
- Si el secret `SUPABASE_DB_URL` no está cargado, el job **no hace nada** (no-op):
  nada corre contra ninguna base por accidente.
- Migraciones aditivas e idempotentes → re-ejecutar es seguro.

> **Orden:** Vercel despliega el código de `main` en paralelo. Como las columnas
> nuevas son aditivas, aprobá la migración **apenas** se dispare el job para que
> las columnas existan antes de que el tráfico use el código nuevo.

## 1. Aplicar migraciones manualmente (SOLO staging)

> **Requisito:** `SUPABASE_DB_URL` de **STAGING** en `.env.local` (ver arriba).

Forma recomendada (con doble guarda anti-producción — exige declarar el host de
staging y verifica que coincida con la URL):

```bash
CONFIRM_STAGING_HOST=db.<ref-staging>.supabase.co npm run db:apply-carga-historica-staging
```

Alternativa manual (una por archivo):

```bash
npm run db:apply-sql-file supabase/migrations/20261012120000_carga_historica_saldos_iniciales.sql
npm run db:apply-sql-file supabase/migrations/20261012130000_saldo_inicial_caja_bancos.sql
```

Son **aditivas e idempotentes**: agregan tablas/columnas, no modifican datos existentes.

**Validación de sintaxis ya realizada:** ambas migraciones y sus 13 fragmentos de DDL
dinámico (dentro de `format(...)`) se parsearon con el grammar real de PostgreSQL
(libpg_query) sin errores. Falta únicamente ejecutarlas contra una base de staging real.

### Verificación post-aplicación (staging)

```sql
-- Debe listar las columnas/tablas nuevas en el schema del tenant:
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = '<schema>'
   AND (column_name = 'es_historico'
        OR table_name IN ('empresa_carga_historica', 'empresa_saldo_inicial'))
 ORDER BY table_name, column_name;
```

## 2. Configurar la fecha de corte (provisional: 01/10/2026)

Opción A — por API (logueado como usuario de la empresa):

```
PUT /api/carga-historica
{ "fechaCorte": "2026-10-01", "habilitada": true }
```

Opción B — SQL directo en staging (reemplazar `<EMPRESA_ID>` y el schema del tenant):

```sql
INSERT INTO <schema>.empresa_carga_historica (empresa_id, fecha_corte, habilitada)
VALUES ('<EMPRESA_ID>'::uuid, '2026-10-01', true)
ON CONFLICT (empresa_id) DO UPDATE
  SET fecha_corte = EXCLUDED.fecha_corte, habilitada = true, cerrada_at = NULL, updated_at = now();
```

Con `habilitada = true` se permite elegir fechas anteriores a hoy en los formularios.
Al terminar la carga, poner `habilitada = false` para **cerrar** el período.

## 3. Cargar saldos iniciales a la fecha de corte

### Stock inicial (por producto)
Ya existe el mecanismo `inventario_inicial` (movimiento de entrada con costo real).
Cargar el stock y costo real de cada producto a la fecha de corte.

### Caja y bancos
```
PUT /api/carga-historica/saldo-inicial
{
  "fechaCorte": "2026-10-01",
  "cajaInicial": 0,
  "bancos": [ { "nombre": "Banco X", "saldo": 0 } ],
  "observaciones": "Saldo de apertura"
}
```

### Cuentas por cobrar (CxC) iniciales
Se cargan como **facturas históricas abiertas**: crear cada factura pendiente con su
`fecha`/`fecha_vencimiento` reales (anteriores al corte) y su `monto`/`saldo`. Al ser
históricas quedan con **numeración interna `HIST-…`** (no fiscal) y **no se emiten a SIFEN**.
Los pagos ya cobrados en el pasado se cargan como pagos históricos para que la factura
quede saldada.

## 4. Orden sugerido de carga

1. Fecha de corte + habilitar.
2. Stock inicial (inventario_inicial) + caja/bancos + CxC abiertas.
3. Operaciones históricas que se quieran ver en reportes (compras/ventas/gastos/pagos
   con su fecha real). No impactan stock/caja en vivo (ya están en el saldo inicial).
4. Verificar reportes por período (junio→hoy) y cuadrar stock/caja/CxC.
5. **Cerrar** el período (`habilitada = false`).

## 5. Reglas de protección (ya implementadas)

- Fechas anteriores a hoy sólo se aceptan si la carga histórica está **habilitada**.
- Operaciones **anteriores al corte** se marcan `es_historico = true` y **no mueven**
  stock ni caja en vivo (evita duplicaciones).
- **Ventas históricas**: exigen **costo unitario manual** por producto (no se usa el
  costo actual para la rentabilidad histórica).
- **SIFEN**: un documento `es_historico` **no puede emitirse electrónicamente** ni
  consume numeración fiscal.
- No se permiten saldos iniciales negativos.
