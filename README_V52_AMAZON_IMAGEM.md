# OFERTAS+ V52 — correção definitiva do importador Amazon

- A extensão passa explicitamente o ID/janela da aba Amazon para o service worker quando o importador é acionado pelo popup.
- Isso permite executar o fallback de captura visível da imagem mesmo quando a mensagem não veio diretamente do content script.
- A extensão recebeu a permissão `activeTab` e espera a renderização da imagem após o scroll antes de capturar.
- O logo Amazon usado nos cards foi atualizado para o arquivo fornecido pelo usuário.
