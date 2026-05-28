# Bootstrap manual `sanantonio`

Estos archivos `.sql` están preparados para **copiar y pegar en el SQL Editor
de Supabase**, en orden. **Nadie los ejecuta automáticamente.**

## Reglas de uso

- Cada archivo es SQL puro. Los comentarios usan `--` (compatible con el SQL Editor de Supabase).
- Cualquier sentencia destructiva o de alto riesgo va **comentada (`--`)** por defecto y debe descomentarse a mano sólo cuando esté listo.
- Los placeholders entre `< >` (`<EMPRESA_ID>`, `<ADMIN_EMAIL>`, `<AUTH_USER_ID>`, `<LISTA_ACTUAL_COMPLETA_PGRST_DB_SCHEMAS>`, `<SUPABASE_DB_URL>`, `<TEMP_PASSWORD>`) hay que reemplazarlos antes de ejecutar.
- **Read-only** vs **modificador** está indicado en el header de cada archivo.

## Orden recomendado

| # | Archivo | Tipo | Riesgo |
|---|---|---|---|
| 01 | [01_preflight_readonly.sql](01_preflight_readonly.sql) | read-only | seguro |
| 02 | [02_create_schema_sanantonio.sql](02_create_schema_sanantonio.sql) | modificador | bajo |
| 03 | [03_clone_structure_sanantonio.sql](03_clone_structure_sanantonio.sql) | procedimiento `pg_dump` (manual, fuera de SQL Editor) | medio |
| 04 | [04_validate_clone_counts.sql](04_validate_clone_counts.sql) | read-only | seguro |
| 05 | [05_postgrest_append_only.sql](05_postgrest_append_only.sql) | modificador (`ALTER ROLE` + `NOTIFY pgrst`) | **alto** |
| 06 | [06_seed_empresa_sanantonio.sql](06_seed_empresa_sanantonio.sql) | modificador (INSERT comentado) | bajo |
| 07 | [07_seed_admin_sanantonio.sql](07_seed_admin_sanantonio.sql) | modificador (requiere `auth.users` creado vía Dashboard) | medio |
| 08 | [08_auditoria_final.sql](08_auditoria_final.sql) | read-only | seguro |

## Cuándo parar y avisar

- Antes de descomentar el `ALTER ROLE authenticator` del paso 05.
- Si el conteo de paso 04 difiere entre `enlodemari` y `sanantonio` (clonado incompleto).
- Si el `DO $$` de auditoría cross-schema del paso 07 reporta `AUTH_USER_ID presente fuera de sanantonio`.
