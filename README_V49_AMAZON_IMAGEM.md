# OFERTAS+ V49 — correção definitiva da imagem Amazon

A imagem não fica mais dependente da URL da Amazon no card.

Fluxo:
1. A extensão captura a imagem da página Amazon.
2. A extensão converte a imagem para JPEG otimizado (até ~900 KB).
3. `/api/amazon-import.js` recebe a imagem.
4. A API grava a imagem no bucket público `amazon-images` do Supabase Storage.
5. A tabela `amazon_products.image` recebe a URL permanente do Storage.
6. O card carrega a imagem diretamente do Supabase.

Execute `amazon-images.sql` uma vez no SQL Editor do Supabase.
