# OFERTAS+ — Importador Mercado Livre (V19)

Extensão Chrome MV3 para testar a importação automática de produtos do Mercado Livre para o OFERTAS+.

## Como funciona
1. Abra uma página de produto no Mercado Livre.
2. No Mercado Livre, use a **Barra de Afiliados** / **Compartilhar** para gerar o link oficial de afiliado.
3. Quando a extensão detectar um `https://meli.la/...` copiado ou exibido, ela tenta salvar o produto automaticamente no OFERTAS+.
4. O popup da extensão também pode ler o link que você acabou de copiar e enviar manualmente.

A extensão não fabrica links de afiliado e não altera cookies. Ela importa o link `meli.la` que foi gerado pela ferramenta oficial do programa.

## Configuração necessária no Vercel
Adicione uma variável privada:
- `OFERTAS_IMPORT_TOKEN` — escolha um token forte e mantenha igual na tela de Configurações da extensão.
- `SUPABASE_SERVICE_ROLE_KEY` — chave privada do Supabase. **Nunca** coloque essa chave dentro da extensão ou no código do navegador.

O endpoint usado é:
`https://buscador-ofertas-diario.vercel.app/api/mercadolivre-import`

## Configuração do banco
No Supabase, execute o arquivo:
`../mercadolivre_products.sql`

Depois recarregue a página do OFERTAS+ e a busca poderá combinar produtos importados do Mercado Livre com os resultados da Lomadee.

## Instalação no Chrome
1. Abra `chrome://extensions/`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione esta pasta `extensao-ofertas-plus`.
5. Abra/atualize uma página do Mercado Livre para o script ser injetado.

## Limitações do teste
- A captura automática depende da forma como o Mercado Livre apresenta/copia o link de afiliado. Se o link não for exposto à página, use o popup da extensão após copiar o link.
- A extensão foi preparada para Chrome/Chromium com Manifest V3.
