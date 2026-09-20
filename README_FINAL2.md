# OFERTAS+ — correção FINAL 2

## O que foi corrigido

### TODOS OS PRODUTOS
A tela inicial agora usa `/api/catalog` com paginação no servidor. Cada página traz até 30 produtos e a paginação continua até o fim do catálogo disponível.

- Lomadee: produtos de marcas elegíveis (campanha ativa, comissão positiva e canal compatível).
- Mercado Livre: produtos ativos que foram importados pela extensão e possuem `affiliate_url`.
- Não existe mais o limite antigo de carregar somente 1.000 produtos do Mercado Livre no primeiro carregamento.
- O site não tenta carregar milhares de produtos de uma vez no navegador.

### 30 OFERTAS
O botão agora chama `/api/featured` e monta exatamente uma vitrine de até 30 produtos, priorizando:

- Smart TVs
- Smartphones/celulares
- Eletrônicos
- Fones/headsets
- Ferramentas
- Aspiradores
- Roupas
- Sapatos/tênis/sandálias

São produtos em destaque do catálogo disponível; não são apresentados como um ranking oficial de vendas quando essa informação não está disponível nas fontes.

### BUSCA
A busca agora consulta diretamente o endpoint do catálogo pesquisável, em vez de depender apenas dos produtos que estavam previamente carregados na tela.

### COMPARAÇÃO
O botão `COMPARAR PREÇOS` permanece nos cards e usa o catálogo da página + busca remota para encontrar ofertas semelhantes.

### PARCEIROS
A seção de principais parceiros mostra somente:

- Mercado Livre
- Shopee

## Importante sobre Mercado Livre

O OFERTAS+ não recebe automaticamente o catálogo inteiro do Mercado Livre apenas por usar a extensão. A extensão é responsável por importar produtos para a tabela `mercadolivre_products`; somente esses produtos, com link afiliado válido, entram no catálogo do site.

Portanto, `TODOS OS PRODUTOS` significa todos os produtos **disponíveis no catálogo do OFERTAS+**, e não todos os milhões de anúncios existentes no Mercado Livre.
