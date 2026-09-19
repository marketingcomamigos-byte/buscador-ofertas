const DEFAULT_ENDPOINT = 'https://buscador-ofertas-diario.vercel.app/api/mercadolivre-import';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'STORE_EXTENSION_TOKEN') {
    chrome.storage.local.set({extensionToken:String(msg.token||''), tokenExpiresAt:Number(msg.expiresAt||0)}).then(()=>sendResponse({ok:true}));
    return true;
  }
  if (msg?.type === 'IMPORT_ML') {
    handleImport(msg.payload).then(sendResponse).catch(err => sendResponse({ok:false,error:err.message||'Erro inesperado'}));
    return true;
  }
});

async function getAuth(){
  const data = await chrome.storage.local.get({extensionToken:'',tokenExpiresAt:0});
  const token=String(data.extensionToken||'').trim();
  const exp=Number(data.tokenExpiresAt||0);
  if(!token || !exp || Date.now() >= exp*1000) return '';
  return token;
}

async function handleImport(payload){
  const token=await getAuth();
  if(!token) return {ok:false,connectRequired:true,error:'Conecte a extensão ao OFERTAS+.'};
  if(!/^https:\/\/www\.mercadolivre\.com\.br\//i.test(String(payload?.productUrl||''))) return {ok:false,error:'Abra uma página de produto do Mercado Livre.'};
  if(!/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/i.test(String(payload?.affiliateUrl||''))) return {ok:false,error:'Link meli.la não encontrado. Clique em Compartilhar no Mercado Livre.'};

  const r=await fetch(DEFAULT_ENDPOINT,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
    body:JSON.stringify(payload)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) return {ok:false,error:data?.error||`Erro ${r.status}`};
  return {ok:true,data:data?.data||null};
}
