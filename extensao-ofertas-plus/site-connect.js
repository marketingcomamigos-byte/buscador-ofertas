window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data || {};
  if (data.type !== 'OFERTAS_PLUS_EXTENSION_TOKEN' || typeof data.token !== 'string') return;
  chrome.runtime.sendMessage({type:'STORE_EXTENSION_TOKEN', token:data.token, expiresAt:Number(data.expiresAt||0)}, ()=>{});
});
