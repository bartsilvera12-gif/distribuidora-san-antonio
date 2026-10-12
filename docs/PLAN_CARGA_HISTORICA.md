# Diagnóstico técnico y plan de implementación — Carga de operaciones históricas

**Proyecto:** ERP Distribuidora San Antonio
**Fecha del análisis:** 2026-10-12
**Estado:** Diagnóstico y plan para aprobación — **sin cambios de código todavía**

> **Contexto:** el cliente adquirió el ERP en junio de 2026 pero recién ahora empieza a usarlo.
> Necesita cargar sus operaciones desde junio hasta hoy manteniendo la integridad de los datos
> (stock, costos, caja, cuentas por cobrar, reportes) y **sin tocar** la facturación electrónica
> que ya funciona contra SIFEN.

---

## 0. Resumen ejecutivo (en simple)

Hoy el sistema **solo** deja poner fecha pasada en **Gastos** y **Pagos**. En **Ventas, Compras
y Movimientos de inventario** la fecha se pone sola en "hoy" y no se puede cambiar. Y aunque se
pudiera, hay un problema de fondo: **el costo promedio y el stock no se reconstruyen hacia atrás**,
así que cargar compras/ventas viejas tal cual rompería los costos.

La recomendación central es **no reconstruir compra por compra desde junio**, sino:

1. Definir una **fecha de corte** (desde cuándo el sistema opera "en vivo").
2. Cargar un **saldo inicial** a esa fecha: stock + costo real por producto, caja y cuentas por cobrar.
3. Permitir **fecha histórica** en las operaciones **solo para que los reportes caigan en el mes
   correcto**, marcándolas como *históricas* para que **no dupliquen** stock ni caja (porque eso ya
   está representado en el saldo inicial).
4. Arreglar el **cálculo del costo promedio** (hoy está mal) para que de acá en adelante sea correcto.
5. Blindar que **ningún documento histórico se mande a SIFEN** ni consuma numeración fiscal.

Esto cumple todas las condiciones obligatorias del pedido y es lo más seguro y rápido de poner en marcha.

---

## 1. Qué funcionalidades YA permiten fechas históricas

| Módulo | ¿Fecha pasada hoy? | Evidencia |
|---|---|---|
| **Gastos** | ✅ Sí (UI + BD) | Selector de fecha en `GastoForm.tsx:154`; se guarda tal cual en `lib/gastos/actions.ts:100` |
| **Pagos** | ✅ Sí (UI + API) | Selector en `RegistrarPagoModal.tsx:124`; API guarda `fecha_pago` sin compararla con hoy en `api/pagos/route.ts:187` |
| **Facturas (CxC)** | 🟡 La API acepta fecha pasada, la UI no la expone | `api/facturas/route.ts:131-153` normaliza y guarda la fecha enviada; los formularios siempre mandan hoy (`clientes/[id]/page.tsx:665`, `clientes/nuevo/page.tsx:363`) |
| **Compras** | ❌ No | Fecha fijada con `now()` en SQL (`compras-pg.ts:460`); la ruta `api/compras/route.ts` ni recibe fecha |
| **Ventas** | ❌ No | Fecha generada con `new Date()` en el servidor (`create-venta-pg.ts:171`) |
| **Mov. inventario / ajustes** | ❌ No | La UI avisa "la fecha se registra automáticamente" (`inventario/movimientos/nuevo/page.tsx:185`) |

**Dato a favor:** las tablas `ventas`, `compras`, `movimientos_inventario`, `pagos`, `gastos` ya
tienen una columna **`fecha` separada de `created_at`** (ver `supabase/migrations/20250312000003_erp_schema.sql`).
O sea, la base ya está preparada para guardar la fecha real de la operación; falta exponerla y dejar
de forzar `now()`.

---

## 2. Archivos y funciones que necesitan modificación

### 2.1 Backend / servidor (lo crítico)

| Archivo:función | Qué hace hoy | Qué hay que cambiar |
|---|---|---|
| `src/lib/compras/server/compras-pg.ts` (insert de compra, ~L373) | Inserta `fecha` con `now()` literal | Aceptar `fecha` como parámetro y usarla si viene |
| `src/lib/compras/server/compras-pg.ts` (insert movimiento ENTRADA, ~L432) | `fecha = now()` | Usar la misma fecha de la compra |
| `src/lib/compras/server/compras-pg.ts` (update producto, **L459-467**) | `costo_promedio = costo_unitario` (lo **pisa**) | Reemplazar por **promedio ponderado móvil** (ver §4) |
| `src/lib/ventas/server/create-venta-pg.ts` (**L171**, L189, L253) | `fechaIso = new Date()` | Aceptar `fecha` opcional del input |
| `src/lib/inventario/storage.ts` (insert movimiento, ~L383) | Recibe `fecha` del front pero el front manda `new Date()` | Dejar que el front mande fecha elegida |
| `src/app/api/compras/route.ts` | No recibe fecha | Validar/pasar `fecha` al server |
| `src/app/api/ventas/route.ts` y `.../create/route.ts` | No recibe fecha | Validar/pasar `fecha` al server |
| `src/app/api/facturas/route.ts` (**L118-153**) | Ya acepta `fecha`/`fecha_vencimiento` | Solo agregar validación de rango (no futuro, ≥ fecha de corte) |

### 2.2 Formularios (UI)

| Archivo | Cambio |
|---|---|
| `src/app/compras/nueva/page.tsx` (estado L73-91, payload L243-252) | Agregar selector de fecha + enviarla |
| `src/app/ventas/nueva/page.tsx` (estado L64-93) | Agregar selector de fecha (solo en "modo carga histórica") |
| `src/app/inventario/movimientos/nuevo/page.tsx` (L72, aviso L185) | Reemplazar `new Date()` por selector; quitar el aviso |
| Facturas (`clientes/[id]/page.tsx`, `clientes/nuevo/page.tsx`, `lib/facturacion/storage.ts`) | Exponer fecha de emisión y vencimiento (solo modo histórico) |

### 2.3 Reportes/Dashboard (revisar, no romper)

| Archivo | Observación |
|---|---|
| `src/lib/reportes/server/reportes-pg.ts` | ✅ Ya filtra por `fecha` de operación — queda bien con carga histórica |
| `src/app/api/dashboard/tenant-tables/route.ts:190-240` | ✅ Filtra por `fecha`/`fecha_pago` |
| `src/app/page.tsx` (altas de clientes L761, leads L665) | ⚠️ Usan `created_at`/`fecha_creacion`; los clientes históricos caerán en el mes de carga, no en junio (ver §6) |
| `src/lib/dashboard/data.ts:303-311` | Trae por defecto los últimos ~13 meses (junio entra) |

---

## 3. Cambios necesarios en Formularios, API y Base de datos

### 3.1 Base de datos (migraciones nuevas, aditivas — se aplican luego de aprobar)

1. **Configuración de corte histórico por empresa** (tabla nueva, singleton):
   `empresa_carga_historica (empresa_id, fecha_corte date, habilitada boolean, cerrada_at timestamptz)`.
   - `fecha_corte`: desde esta fecha el sistema opera "en vivo".
   - `habilitada`: mientras esté en `true`, se permite elegir fechas pasadas; al terminar la carga se
     pone `false` ("cerrar el período de carga") para que nadie vuelva a backdatear por error.

2. **Marca de operación histórica** en las tablas operativas (columna aditiva, default `false`):
   `ventas.es_historico`, `compras.es_historico`, `movimientos_inventario.es_historico`,
   `facturas.es_historico`, `gastos.es_historico`, `pagos.es_historico`.
   - Sirve para distinguir lo cargado para reportes de lo que mueve stock/caja en vivo, y para poder
     revertir/auditar la carga sin tocar lo real.

3. **Serie/numeración separada para documentos históricos no fiscales** (ver §5): que las facturas
   históricas **no consuman** el correlativo fiscal de `next_numero_factura_empresa`.

> Las tres son **aditivas e idempotentes** (mismo patrón que las migraciones existentes). No alteran
> datos ni columnas actuales. **No se ejecutan hasta la aprobación.**

### 3.2 API

- `compras` y `ventas`: aceptar `fecha` (y propagarla al movimiento de inventario).
- Validación común (helper en `lib/fechas`): la fecha debe estar **entre la fecha de corte y hoy**
  (ni futura ni anterior al corte), y solo se acepta si `empresa_carga_historica.habilitada = true`.
- `facturas`: agregar la misma validación de rango y el flag `es_historico` + serie no fiscal.

### 3.3 Formularios

- Selector de fecha visible **solo cuando el modo carga histórica está habilitado** (así la operación
  normal del día a día no cambia y no se presta a errores).
- Banner claro: "Estás cargando una operación con fecha **DD/MM/AAAA** (modo histórico)".

---

## 4. Cómo se resuelve el cálculo histórico de stock y costos

### 4.1 El problema actual (hay que arreglarlo sí o sí)

En `compras-pg.ts:459-467` el costo promedio **no es un promedio**: se **sobrescribe** con el costo
de la última compra guardada:

```sql
SET stock_actual = stock_actual + $1,
    costo_promedio = $2            -- ← pisa el valor con el costo de ESTA compra
```

Consecuencias:
- El costo del producto depende de **cuál fue la última compra insertada**, no del orden cronológico.
- Las ventas capturan el `costo_promedio` **vigente al guardarlas** (`create-venta-pg.ts:250`), no el
  que correspondía a la fecha de la venta → rentabilidad histórica incorrecta.

### 4.2 Solución propuesta para el costo promedio (CPP ponderado móvil)

Reemplazar el "pisado" por la fórmula estándar de **promedio ponderado móvil**:

```
nuevo_costo = (stock_actual · costo_promedio_actual + cantidad_entrante · costo_unitario_entrante)
              ----------------------------------------------------------------------------------
                                  (stock_actual + cantidad_entrante)
```

Esto corrige el costeo **para la operación normal de ahora en adelante** (no solo para lo histórico)
y cumple la condición *"Verificar cómo se calcula el costo promedio y proponer una solución correcta"*.

### 4.3 Estrategia para el stock y costo histórico: **saldo inicial a fecha de corte**

En vez de reconstruir cada compra/venta desde junio (riesgoso y rompe costos), se propone:

1. **Fecha de corte** = fecha desde la que se opera en vivo (a definir con el cliente; p. ej. el día
   en que empiezan a usarlo).
2. **Saldo inicial de inventario**: por cada producto, un movimiento `inventario_inicial` con la
   **cantidad real** y el **costo real** a la fecha de corte. El mecanismo **ya existe**:
   `insertMovimientoInicial` (`productos-pg.ts:385`) y `origen = 'inventario_inicial'`
   (`erp_schema.sql:158`). Solo hay que permitir fecha y exponerlo como "carga de saldo inicial".
3. **Operaciones anteriores al corte** (ventas/compras/gastos de junio–hoy que el cliente quiera ver
   en reportes): se cargan con su fecha real pero marcadas `es_historico = true`, y **no recalculan
   stock ni costo en vivo** (eso ya está en el saldo inicial) → así se cumple *"no generar
   movimientos duplicados de stock o caja"* y *"no usar el costo actual para la rentabilidad
   histórica"* (cada operación histórica lleva su propio costo/precio cargado, no el de hoy).
4. **Operaciones desde el corte en adelante**: funcionan normal y usan el CPP ponderado ya corregido.

> **Opción B (reconstrucción total)**: cargar todas las operaciones desde junio en orden cronológico
> estricto y que el sistema recalcule stock y CPP ponderado. Es más fiel pero mucho más costoso y
> frágil. Se documenta como alternativa; **se recomienda la Opción A (saldo inicial)**.

---

## 5. Cómo se protegen caja, cuentas por cobrar y facturación electrónica

### 5.1 Caja
- Los movimientos de caja históricos se cargan con `es_historico = true` y **no impactan el saldo de
  caja en vivo** (el saldo de caja arranca del saldo inicial a la fecha de corte).
- Validación: ninguna carga puede dejar caja o stock **en negativo** (se rechaza con mensaje claro).

### 5.2 Cuentas por cobrar
- El backend ya acepta `fecha` y `fecha_vencimiento` pasadas (`api/facturas/route.ts:131`), y el estado
  **"Vencido"** se deriva comparando el vencimiento contra hoy (`estado-factura-ui.ts:23`). Entonces
  una factura histórica con saldo pendiente aparecerá correctamente como vencida con su mora real.
- El **saldo** tras un pago depende solo de montos, no de la fecha (`api/pagos/route.ts:167-178`), así
  que los pagos históricos cierran bien los saldos.
- ⚠️ **Mora/días de atraso**: siempre se calculan contra "hoy" (`gestion-clientes/page.tsx:776`). Es
  correcto para saldos aún pendientes. Para facturas que ya se cobraron en el pasado, cargar también
  el pago histórico para que queden en "Pagado" y no figuren con mora.

### 5.3 Facturación electrónica (SIFEN) — **la más delicada**
Hallazgos:
- SIFEN es **real**: firma con el `.p12` de la empresa y postea a los WS de la SET
  (`sifen-ws-urls.ts`, `enviar-lote-sifen-test.ts`, `sign-xml.ts`).
- **Crear una factura NO la manda a SIFEN**: la emisión es un flujo aparte y manual
  (`borrador → firmado → enviado`, `handle-sifen-enviar-post.ts`). Esa es la **protección natural**.
- La fecha del documento electrónico sale de `facturas.fecha` y va al CDC y a `dFeEmiDE`
  (`map-to-sifen.ts:34`, `rde-xml.ts:99`, `sifen-cdc.ts:184`). El ERP **no** bloquea fechas viejas,
  pero la **SET rechaza** por transmisión extemporánea (regla ~72 h).
- La **numeración fiscal es correlativa por orden de carga, no por fecha**
  (`next_numero_factura_empresa`): una factura de junio cargada hoy tomaría un número posterior a los
  de octubre, rompiendo la correlación que exige la SET.

**Protecciones a implementar:**
1. Los documentos históricos se crean con **`es_historico = true`** y **nunca entran al flujo de envío
   a SIFEN** (se filtran en la pantalla/endpoint de emisión).
2. No consumen el **correlativo fiscal**: usan una **serie interna separada** (o quedan sin número
   fiscal), para no romper la numeración de SIFEN.
3. Se aprovecha `empresa_facturacion_modo` (`sin_factura_fiscal | sifen | autoimpresor`): los históricos
   son **comprobantes internos** (`sin_factura_fiscal`), visualmente diferenciados en la UI.
4. **No se toca nada del módulo SIFEN existente** (cumple *"no alterar la facturación electrónica"*).

---

## 6. Riesgos y cómo se evitan

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Costo promedio corrupto** (hoy se pisa, no se promedia) | Implementar CPP ponderado móvil (§4.2) + estrategia de saldo inicial (§4.3) |
| 2 | **Stock duplicado** si se carga saldo inicial *y* compras históricas | Marca `es_historico`: lo histórico no recalcula stock/caja en vivo (§4.3) |
| 3 | **Documento histórico enviado a SIFEN por error** | Filtro por `es_historico` en el flujo de emisión + modo `sin_factura_fiscal` (§5.3) |
| 4 | **Numeración fiscal rota** (correlativo por carga, no por fecha) | Serie interna separada para históricos (§5.3) |
| 5 | **Saldos negativos** (vender más de lo que había) | Validación: ninguna carga deja stock/caja en negativo |
| 6 | **Rentabilidad histórica con costo de hoy** | Cada operación histórica lleva su propio costo/precio cargado; no se lee el costo actual |
| 7 | **Altas de clientes/leads caen en el mes equivocado** | Usan `created_at`/`fecha_creacion` (`page.tsx:761`); decidir si se agrega una `fecha_alta` editable o se asume que no es crítico para este cliente |
| 8 | **Backdating accidental en el día a día** | Selector de fecha visible solo con "modo carga histórica" habilitado; se cierra el período al terminar |
| 9 | **Romper operación actual** | Todos los cambios son aditivos y con default que preserva el comportamiento de hoy |
| 10 | **Tocar datos de producción** | Nada se ejecuta hasta aprobar; migraciones aditivas e idempotentes; probar primero en entorno de prueba |

---

## 7. Plan de implementación por etapas (con pruebas de validación)

> Cada etapa se entrega y valida por separado. **Ninguna** se despliega a producción sin aprobación.

### Etapa 0 — Acuerdos previos (con el cliente)
- Definir **fecha de corte** y qué datos históricos se quieren (¿solo reportes? ¿stock inicial? ¿CxC abiertas?).
- Confirmar si las altas de clientes/leads necesitan fecha real o no.
- **Validación:** documento de alcance firmado.

### Etapa 1 — Corregir el costo promedio (independiente de lo histórico)
- Reemplazar el "pisado" de `costo_promedio` por el ponderado móvil (`compras-pg.ts:459-467`).
- **Pruebas:** comprar 10 u a 100 y luego 10 u a 200 → costo promedio = 150 (no 200). Verificar que
  ventas posteriores usan 150. Regresión: una sola compra sigue dando su costo.

### Etapa 2 — Infra de carga histórica (BD + helpers)
- Migraciones aditivas: `empresa_carga_historica`, columnas `es_historico`, serie interna.
- Helper de validación de fecha (rango corte–hoy) en `lib/fechas`.
- **Pruebas:** migraciones idempotentes (correr dos veces sin error); con `habilitada=false` la API
  rechaza fechas pasadas.

### Etapa 3 — Saldo inicial de inventario, caja y CxC
- UI de "Saldo inicial" por producto (cantidad + costo real a la fecha de corte) reutilizando
  `insertMovimientoInicial`. Carga de saldo de caja y de facturas abiertas (CxC) a la fecha de corte.
- **Pruebas:** stock y costo del producto quedan en los valores cargados; caja y CxC coinciden con lo
  informado; nada en negativo.

### Etapa 4 — Fecha histórica en Compras
- Selector de fecha + propagar al movimiento; marcar `es_historico`; no recalcular stock en vivo si es
  anterior al corte.
- **Pruebas:** compra con fecha de junio aparece en el reporte de **junio**; no duplica stock; su costo
  es el cargado, no el de hoy.

### Etapa 5 — Fecha histórica en Ventas e Inventario
- Igual que compras; las ventas históricas guardan su **costo/precio de esa fecha** (no el actual).
- **Pruebas:** venta de junio en el reporte de junio con su margen correcto; movimiento trazable; sin
  saldo negativo.

### Etapa 6 — Facturas / CxC históricas + protección SIFEN
- Exponer fecha de emisión/vencimiento; serie interna; **excluir `es_historico` del flujo SIFEN**.
- **Pruebas (clave):** una factura histórica **no** puede enviarse a SIFEN; no consume número fiscal;
  aparece como vencida/pagada según corresponda; el flujo SIFEN normal sigue intacto.

### Etapa 7 — Reportes y cierre
- Verificar compras/ventas/gastos/cobranzas/caja/inventario en sus períodos (junio→hoy).
- "Cerrar" el período de carga (`habilitada=false`).
- **Pruebas de aceptación integral:** cuadrar stock, caja y CxC a la fecha de hoy contra los números
  reales del cliente. Revisar dashboard mes a mes.

### Entorno
- Todo se prueba primero en **entorno de prueba / base de staging**, nunca directo en producción.
- Respaldo antes de cada migración.

---

## 8. Cumplimiento de las condiciones obligatorias

| Condición | Cómo se cumple |
|---|---|
| No modificar ni eliminar info existente | Cambios aditivos; `es_historico` separa lo cargado; nada se borra |
| No alterar la facturación electrónica actual | No se toca el módulo SIFEN; históricos excluidos del envío |
| No duplicar stock/caja | Saldo inicial + marca `es_historico` que no recalcula en vivo |
| No usar el costo actual para rentabilidad histórica | Cada operación histórica lleva su propio costo/precio |
| Verificar y corregir el costo promedio | §4.1–4.2: hoy se "pisa"; se propone ponderado móvil |
| Mantener compatibilidad con operación actual | Selector visible solo en modo histórico; defaults preservan comportamiento |
| Evaluar saldo inicial y fecha de corte | Es el eje del plan (§4.3, Etapas 0 y 3) |
| Evitar saldos negativos/inconsistencias | Validaciones de no-negativo y de rango de fecha |
| No ejecutar migraciones ni tocar producción | Nada se ejecuta hasta aprobar; staging + respaldo |

---

## 9. Qué necesito de vos para arrancar

1. **Fecha de corte** definitiva.
2. ¿Alcance = solo reportes, o también stock inicial + CxC abiertas? (recomiendo las tres).
3. ¿Las altas de clientes/leads necesitan fecha real en reportes? (riesgo #7).
4. Aprobación de la **Opción A (saldo inicial)** vs. Opción B (reconstrucción total).

Con eso aprobado, empiezo por la **Etapa 1 (corregir el costo promedio)**, que es útil sí o sí e
independiente del resto.
