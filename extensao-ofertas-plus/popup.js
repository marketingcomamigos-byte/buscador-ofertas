const $=id=>document.getElementById(id);
let meta=null;
function show(html){$('content').innerHTML=html;}
function openConnect(){ chrome.tabs.create({url:'https://buscador-ofertas-diario.vercel.app/extension-connect.html'}); }
async function isConnected(){
  const x=await chrome.storage.local.get({extensionToken:'',tokenExpiresAt:0});
  return !!x.extensionToken && Number(x.tokenExpiresAt)>Math.floor(Date.now()/1000);
}
function run(){
  chrome.tabs.query({active:true,currentWindow:true}, async tabs=>{
    const tab=tabs[0];
    const connected=await isConnected();
    $('connect').style.display=connected?'none':'block';
    if(!tab?.url?.startsWith('https://www.mercadolivre.com.br/')){ show('<div class="warn"><b>Abra uma página de produto do Mercado Livre.</b></div><div class="muted" style="margin-top:6px">A extensão detecta o produto e usa o link oficial meli.la gerado pela Barra de Afiliados.</div>'); return; }
    chrome.tabs.sendMessage(tab.id,{type:'GET_ML_META'},async result=>{
      if(chrome.runtime.lastError){show('<div class="err">Recarregue a página do Mercado Livre e tente novamente.</div>');return;}
      meta=result||{};
      let clip='';
      try{clip=await navigator.clipboard.readText();}catch(_){ }
      if(!meta.affiliateUrl && /https:\/\/meli\.la\/[A-Za-z0-9_-]+/i.test(clip||'')) meta.affiliateUrl=(clip.match(/https:\/\/meli\.la\/[A-Za-z0-9_-]+/i)||[])[0];
      if(!meta.affiliateUrl){
        show('<div><div class="name">'+esc(meta.name||tab.title||'Produto')+'</div><div class="muted">Nenhum link <b>meli.la</b> foi detectado ainda. Clique em <b>Compartilhar</b> na Barra de Afiliados do Mercado Livre.</div></div>');
        $('save').style.display='none'; return;
      }
      show('<div class="label">Produto detectado</div><div class="name">'+esc(meta.name||'Produto')+'</div><div class="muted">Item: '+esc(meta.itemId||'—')+'</div><div class="muted" style="margin-top:5px">Link: '+esc(meta.affiliateUrl)+'</div>');
      $('save').style.display=connected?'block':'none';
      if(!connected) $('connect').style.display='block';
    });
  });
}
$('save').addEventListener('click',()=>{
  chrome.tabs.query({active:true,currentWindow:true},tabs=>{
    chrome.tabs.sendMessage(tabs[0].id,{type:'IMPORT_COPIED',affiliateUrl:meta?.affiliateUrl},resp=>{
      if(chrome.runtime.lastError){show('<div class="err">Não foi possível comunicar com a página.</div>');return;}
      if(resp?.ok!==true){show('<div class="err">'+esc(resp?.error||'Não foi possível iniciar a importação.')+'</div>');return;}
      show('<div class="ok"><b>✅ Enviado para o OFERTAS+.</b><div class="muted" style="margin-top:5px">O produto será atualizado no catálogo.</div></div>');
      $('save').style.display='none';
    });
  });
});
$('connect').addEventListener('click',openConnect);
$('settings').addEventListener('click',openConnect);
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
run();
