const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function openConnect(){chrome.tabs.create({url:'https://buscador-ofertas-diario.vercel.app/admin.html?ofertas_plus_amazon_connect=1'});}
async function sessionState(){const x=await chrome.storage.local.get({amazonAccessToken:'',amazonExpiresAt:0,lastAmazonImport:null});const valid=!!x.amazonAccessToken&&Number(x.amazonExpiresAt)>Math.floor(Date.now()/1000);return {...x,valid};}
function validAffiliate(url){try{const u=new URL(String(url||'').trim());const h=u.hostname.toLowerCase();return h==='link.amazon'||h==='amzn.to'||(h.endsWith('amazon.com.br')&&(u.searchParams.has('tag')||u.searchParams.has('tag0')||u.searchParams.has('ascsubtag')))}catch(_){return false}}
async function activeAmazonTab(){const tabs=await chrome.tabs.query({active:true,currentWindow:true});return tabs[0];}
async function readMeta(tab){return await new Promise(resolve=>chrome.tabs.sendMessage(tab.id,{type:'GET_AMAZON_META'},r=>resolve(r||{})));}
async function readClipboardDirect(){
  try{
    if(!navigator.clipboard?.readText) throw new Error('Clipboard API indisponível');
    const text=String(await navigator.clipboard.readText()||'').trim();
    return {ok:true,text};
  }catch(err){return {ok:false,error:err?.message||'Não foi possível ler a área de transferência.'};}
}
async function importLinkNow(meta,link,kind='popup-clipboard'){
  if(!validAffiliate(link)) return {ok:false,error:'O conteúdo copiado não parece ser um link de associado Amazon.'};
  const r=await new Promise(resolve=>chrome.runtime.sendMessage({type:'AMAZON_AFFILIATE_LINK_FOUND',affiliateUrl:link,meta,captureKind:kind},resolve));
  return r||{ok:false,error:'A extensão não retornou resposta.'};
}
let autoBusy=false;
async function autoClipboardImport(meta){
  if(autoBusy)return false;
  autoBusy=true;
  try{
    const attempts=[0,350,800,1500,2500,4000];
    for(const ms of attempts){if(ms) await new Promise(r=>setTimeout(r,ms));const clip=await readClipboardDirect();if(clip.ok&&validAffiliate(clip.text)){
        $('affiliate').value=clip.text; $('live').textContent='🟢 Link de associado detectado na área de transferência.';
        const r=await importLinkNow(meta,clip.text,'popup-clipboard-auto');
        $('live').className='small '+(r?.ok?'ok':'err');
        $('live').textContent=r?.ok?'✅ Produto enviado para o OFERTAS+.':'❌ '+(r?.error||'Não foi possível importar. Verifique o endpoint do OFERTAS+.');
        return true;
      }}
    return false;
  } finally {autoBusy=false;}
}
async function render(){
  const tab=await activeAmazonTab();
  const state=await sessionState();
  $('connection').innerHTML=`<span class="dot ${state.valid?'ok':'warn'}"></span><span>${state.valid?'✅ Conectada':'⚠️ Não conectada'}</span>`;
  $('connectionInfo').textContent=state.valid?`Conexão válida por mais de ${Math.max(1,Math.ceil((Number(state.amazonExpiresAt)-Date.now()/1000)/86400))} dia(s).`:'Clique em Conectar ao OFERTAS+ e deixe a página administrativa concluir a conexão.';
  $('connect').style.display=state.valid?'none':'block';
  if(!/^https:\/\/(www\.)?amazon\.com\.br\//i.test(tab?.url||'')){
    $('content').innerHTML='<b>Abra um produto da Amazon Brasil.</b><div class="muted" style="margin-top:6px">A extensão captura o ASIN, nome, imagem e preço. Depois de copiar o link do SiteStripe, basta abrir a extensão: ela tenta importar automaticamente.</div>';
    return;
  }
  let meta=await readMeta(tab); meta.__tabId=tab?.id||null; meta.__windowId=tab?.windowId||null;
  if(!meta.image){await new Promise(r=>setTimeout(r,700));meta=await readMeta(tab);}
  $('content').innerHTML=`<div class="label">Produto detectado</div><div class="name">${esc(meta.name||'Produto Amazon')}</div><div class="muted">ASIN: ${esc(meta.asin||'—')}</div><div class="muted">Preço: ${meta.price?('R$ '+Number(meta.price).toFixed(2).replace('.',',')):'não detectado'}</div><div id="live" class="small">${meta.affiliateUrl?'🟢 Link de associado detectado.':'🟡 Procurando link Amazon…'}</div><input id="affiliate" class="linkbox" placeholder="Link Amazon detectado" value="${esc(meta.affiliateUrl||'')}" readonly />`;
  if(meta.affiliateUrl&&validAffiliate(meta.affiliateUrl)&&state.valid){
    $('live').textContent='⏳ Enviando link detectado…';
    const r=await importLinkNow(meta,meta.affiliateUrl,'content-dom');
    $('live').className='small '+(r?.ok?'ok':'err');$('live').textContent=r?.ok?'✅ Produto enviado para o OFERTAS+.':'❌ '+(r?.error||'Não foi possível importar. Verifique o endpoint do OFERTAS+.');
  } else if(state.valid){
    await autoClipboardImport(meta);
  }
}
$('connect').addEventListener('click',openConnect);
$('importNow').addEventListener('click',async()=>{
  const tab=await activeAmazonTab();
  if(!tab?.id){$('content').insertAdjacentHTML('beforeend','<div class="err small">Não encontrei a aba Amazon ativa.</div>');return;}
  const meta=await readMeta(tab); meta.__tabId=tab.id; meta.__windowId=tab.windowId;
  $('live').textContent='🔄 Lendo a área de transferência…';
  let clip=await readClipboardDirect();
  if(!clip.ok||!validAffiliate(clip.text)){
    const r=await new Promise(resolve=>chrome.runtime.sendMessage({type:'REQUEST_CLIPBOARD_IMPORT',meta,attempts:5,tabId:tab.id,windowId:tab.windowId},resolve));
    $('live').className='small '+(r?.ok?'ok':'err'); $('live').textContent=r?.ok?'✅ Produto enviado para o OFERTAS+.':'❌ '+(r?.error||'Não foi possível importar o link copiado.');return;
  }
  $('affiliate').value=clip.text;
  const r=await importLinkNow(meta,clip.text,'popup-clipboard-button');
  $('live').className='small '+(r?.ok?'ok':'err'); $('live').textContent=r?.ok?'✅ Produto enviado para o OFERTAS+.':'❌ '+(r?.error||'Não foi possível importar. Verifique o endpoint do OFERTAS+.');
});
$('help').addEventListener('click',()=>chrome.tabs.create({url:'https://associados.amazon.com.br/help/node/topic/GJMMT7G4C8K4Y3AY'}));
chrome.runtime.onMessage.addListener(msg=>{if(msg?.type==='AUTO_IMPORT_STATUS') render();});
render().catch(err=>{$('content').innerHTML=`<div class="err">Erro da extensão: ${esc(err?.message||'desconhecido')}</div>`});
setInterval(()=>render().catch(()=>{}),2200);
