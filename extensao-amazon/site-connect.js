(() => {
  let requested=false;
  function show(text,ok=true){
    let box=document.getElementById('ofertas-plus-amazon-connect-box');
    if(!box){box=document.createElement('div');box.id='ofertas-plus-amazon-connect-box';box.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:500px;padding:14px 16px;border-radius:14px;background:#fff;box-shadow:0 12px 35px rgba(0,0,0,.18);border:1px solid #e5e7eb;font:600 14px Arial,sans-serif;color:#171923;';document.body.appendChild(box)}
    box.style.borderColor=ok?'#b7ebd5':'#fecaca';
    box.innerHTML=`<strong style="color:${ok?'#087f5b':'#b42318'}">OFERTAS+ Amazon</strong><div style="margin-top:6px;font-weight:400;line-height:1.4">${text}</div>`;
  }
  function requestSession(){
    if(requested)return;
    requested=true;show('🔄 Atualizando a sessão do OFERTAS+ e gerando uma autorização exclusiva para a extensão…',true);
    window.postMessage({type:'OFERTAS_PLUS_AMAZON_GET_SESSION',source:'ofertas-plus-amazon-extension',nonce:crypto.randomUUID?.()||String(Date.now())},'*');
    setTimeout(()=>{if(requested){requested=false;show('⏳ O painel ainda não respondeu. Verifique se você está conectado como administrador e clique em Atualizar.',false)}},5000);
  }
  window.addEventListener('message',event=>{
    if(event.source!==window)return;const data=event.data||{};if(data.type!=='OFERTAS_PLUS_AMAZON_SESSION'||data.source!=='ofertas-plus-amazon-page')return;
    requested=false;
    if(!data.extensionToken||!data.expiresAt){show(data.error||'Não foi possível gerar a autorização da extensão.',false);return;}
    chrome.runtime.sendMessage({type:'STORE_AMAZON_SESSION',accessToken:String(data.extensionToken),expiresAt:Number(data.expiresAt),tokenKind:'extension-jwt'}).then(()=>show('✅ Extensão Amazon conectada. Agora volte à Amazon e clique em “Copiar link de associado”. A extensão fará o restante automaticamente.',true)).catch(()=>show('❌ Não foi possível salvar a autorização na extensão. Recarregue a extensão em chrome://extensions e tente novamente.',false));
  });
  requestSession();
})();
