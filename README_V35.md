# OFERTAS+ V35

## Principais ajustes
- Mesmo padrão visual de card para **Ofertas do Dia** e **Buscar Ofertas**.
- Desktop em 3 colunas e mobile em 1 coluna abaixo de 600px, evitando cortes de fotos e textos.
- Imagens de produto usam `object-fit: contain` e não são cortadas.
- Detecta e oculta logos de loja usados indevidamente como foto de produto, incluindo assinaturas de dimensões conhecidas.
- Mercado Livre: contorno amarelo.
- Shopee: contorno laranja/vermelho.
- Demais lojas: contorno verde escuro.
- Amazon: contorno cinza escuro e botão cinza escuro.
- Logo Amazon adicionada em `assets/brand-amazon.png`.
- Amazon integrada ao `/api/search`.
- Amazon integrada às Ofertas do Dia como parte do conjunto de até 13 ofertas parceiras com desconto real de 5% a 95%.
- Mantidos 7 produtos Mercado Livre na seleção de Ofertas do Dia quando houver ao menos 7 ativos.
- Atualização das Ofertas do Dia a cada 3 horas.
- Fluxo de redirecionamento usa `affiliateUrl` para Mercado Livre e Amazon.
- Incluída declaração de transparência exigida para o Programa de Associados Amazon.

## Banco Amazon
A V34/V35 já contém `amazon_products.sql`. Execute no Supabase caso a tabela ainda não exista.

V37: logotipos pequenos ao lado do preço; removidos do topo do card; 2 colunas mobile.
