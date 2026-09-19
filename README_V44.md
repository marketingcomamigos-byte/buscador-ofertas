# OFERTAS+ V44 — correção da importação Amazon

- Corrigido o erro PostgreSQL/PostgREST `there is no unique or exclusion constraint matching the ON CONFLICT specification`.
- O endpoint `/api/amazon-import` agora localiza o ASIN existente e faz PATCH, ou POST quando não existe, sem depender de `on_conflict`.
- `amazon_products.sql` inclui compatibilidade para garantir unicidade do ASIN em bases anteriores.
