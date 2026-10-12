# Runbook — Configuración de carga histórica (San Antonio)

> **No ejecutar en producción.** Primero aplicar en staging y validar.

## 1. Aplicar migraciones (staging)

```bash
npm run db:apply-sql-file supabase/migrations/20261012120000_carga_historica_saldos_iniciales.sql
npm run db:apply-sql-file supabase/migrations/20261012130000_saldo_inicial_caja_bancos.sql
```

Son **aditivas e idempotentes**: agregan tablas/columnas, no modifican datos existentes.

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
