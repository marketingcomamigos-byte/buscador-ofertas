-- OFERTAS+ — armazenamento permanente das imagens Amazon
-- Execute uma vez no SQL Editor do Supabase.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('amazon-images', 'amazon-images', true, 1000000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 1000000,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- A gravação é feita exclusivamente pela API usando SUPABASE_SERVICE_ROLE_KEY.
-- O bucket público permite que os cards carreguem as imagens sem depender da Amazon.
