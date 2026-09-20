-- OFERTAS+ V19 — catálogo importado do Mercado Livre
create table if not exists public.mercadolivre_products (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  item_id text,
  product_id text,
  name text not null,
  category text,
  brand text default 'Mercado Livre',
  price numeric(12,2),
  list_price numeric(12,2),
  image text,
  product_url text not null,
  affiliate_url text not null,
  affiliate_code text,
  raw jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ml_products_active_updated
  on public.mercadolivre_products (active, updated_at desc);
create index if not exists idx_ml_products_item_id
  on public.mercadolivre_products (item_id);
create index if not exists idx_ml_products_product_id
  on public.mercadolivre_products (product_id);

alter table public.mercadolivre_products enable row level security;

drop policy if exists "public can read active ml products" on public.mercadolivre_products;
create policy "public can read active ml products"
on public.mercadolivre_products
for select
to anon, authenticated
using (active = true);

drop policy if exists "admins can read all ml products" on public.mercadolivre_products;
create policy "admins can read all ml products"
on public.mercadolivre_products
for select
to authenticated
using (exists (
  select 1 from public.admin_users au
  where au.user_id = auth.uid()
));

-- Não crie política pública de INSERT.
-- A extensão grava por /api/mercadolivre-import usando SUPABASE_SERVICE_ROLE_KEY,
-- que deve ficar exclusivamente nas variáveis privadas do Vercel.
