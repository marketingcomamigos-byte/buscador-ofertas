# OFERTAS+ — Importador Amazon V4

Esta versão mantém a captura automática do V3 e é compatível com o endpoint V44 do OFERTAS+, que não depende de `ON CONFLICT` no PostgREST para salvar/atualizar o ASIN.

Fluxo: abra produto Amazon → gere/copiar link de associado no SiteStripe → abra a extensão → o link é capturado/importado automaticamente.


V5: captura robusta da imagem principal Amazon (data-a-dynamic-image, data-old-hires, srcset, og:image e fallbacks) e aguarda a imagem carregar antes de importar.


V5.3/V48: captura de imagem Amazon via offscreen + fallback server-side.
