-- OFERTAS+ — catálogo importado da Amazon
create table if not exists public.amazon_products (
  id uuid primary key default gen_random_uuid(),
  asin text not null unique,
  name text not null,
  category text default 'Amazon',
  brand text default 'Amazon',
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

create index if not exists idx_amazon_products_active_updated
  on public.amazon_products (active, updated_at desc);
create unique index if not exists uq_amazon_products_asin
  on public.amazon_products (asin);

alter table public.amazon_products enable row level security;

drop policy if exists "public can read active amazon products" on public.amazon_products;
create policy "public can read active amazon products"
on public.amazon_products
for select
to anon, authenticated
using (active = true);

drop policy if exists "admins can read all amazon products" on public.amazon_products;
create policy "admins can read all amazon products"
on public.amazon_products
for select
to authenticated
using (exists (
  select 1 from public.admin_users au
  where au.user_id = auth.uid()
));

-- Não criar INSERT público. A gravação é feita pelo endpoint /api/amazon-import
-- usando SUPABASE_SERVICE_ROLE_KEY em variável privada do Vercel.


-- Compatibilidade com bases criadas em versões anteriores.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.amazon_products'::regclass
      AND conname = 'amazon_products_asin_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.amazon_products
        ADD CONSTRAINT amazon_products_asin_unique UNIQUE (asin);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- Imagens permanentes: execute também amazon-images.sql para criar o bucket de Storage.
