# Extensão Amazon V5.2 — captura e armazenamento da imagem

A extensão captura a imagem principal do produto Amazon, converte para JPEG otimizado e envia a imagem junto com a importação.

O OFERTAS+ V49 grava a imagem no Supabase Storage (`amazon-images`) e o card passa a usar uma URL permanente do seu próprio projeto, sem depender do carregamento direto da Amazon.

## Instalação
1. Remova a versão anterior em `chrome://extensions/`.
2. Ative o Modo do desenvolvedor.
3. Use **Carregar sem compactação** e selecione esta pasta.


## V5.2
A captura de imagem agora possui fallback por captura da tela: a extensão localiza a imagem principal, rola até ela, captura a viewport e recorta somente a área do produto. Isso evita dependência de CORS/hotlink da Amazon.
