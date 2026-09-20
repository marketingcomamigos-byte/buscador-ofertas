-- ============================================================
-- RASTREAMENTO DE CLIQUES NAS OFERTAS
-- Projeto: Buscador de Ofertas
-- ============================================================

create table if not exists public.offer_clicks (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  product_title text not null,
  product_category text,
  destination_url text,
  session_id text,
  created_at timestamptz not null default now()
);

alter table public.offer_clicks enable row level security;

create index if not exists offer_clicks_created_at_idx
  on public.offer_clicks (created_at desc);

create index if not exists offer_clicks_product_key_idx
  on public.offer_clicks (product_key);

drop policy if exists "public_can_insert_offer_clicks" on public.offer_clicks;

create policy "public_can_insert_offer_clicks"
on public.offer_clicks
for insert
to anon, authenticated
with check (true);

drop policy if exists "admin_can_read_offer_clicks" on public.offer_clicks;

create policy "admin_can_read_offer_clicks"
on public.offer_clicks
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);
