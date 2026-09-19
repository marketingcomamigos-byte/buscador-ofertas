# OFERTAS+ V51 — Amazon com captura de imagem robusta

## Correção
A API agora aceita a imagem capturada pela extensão e salva no Supabase Storage. Se nenhuma imagem puder ser salva, a importação é interrompida em vez de cadastrar uma URL da Amazon que pode falhar no navegador.

## Importante
1. Publique este projeto na Vercel.
2. Mantenha `SUPABASE_SERVICE_ROLE_KEY` configurada.
3. O bucket `amazon-images` pode ser criado pelo `api/amazon-import.js`; o arquivo `amazon-images.sql` também está incluído.
4. Instale a extensão V5.1.
5. Faça uma nova importação de um produto Amazon.

A imagem salva no produto deve ser uma URL do Supabase Storage, não uma URL `images-amazon`/`media-amazon`.
