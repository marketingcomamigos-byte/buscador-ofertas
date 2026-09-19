# OFERTAS+ Amazon V2 — importação automática do SiteStripe

### Fluxo principal
1. Abra um produto da Amazon Brasil.
2. No SiteStripe, clique em **Copiar link de associado** / **Link curto** / **Gerar link**.
3. A extensão captura o link no **MAIN world** da página, interceptando os métodos de escrita de clipboard usados pela própria página, incluindo `writeText`, `write`, e `execCommand('copy')`.
4. A extensão também monitora o DOM do SiteStripe após os cliques para encontrar o link diretamente.
5. O link é enviado ao `/api/amazon-import` e o produto é salvo em `amazon_products`.

### Fallback
O popup ainda mantém **Plano B: importar link copiado**. Ele só é necessário quando a Amazon não expõe o link em nenhuma das formas capturáveis.

### Segurança
A extensão nunca recebe a chave secreta do Supabase. O backend continua responsável pela autorização e gravação.
