const ENDPOINT='https://buscador-ofertas-diario.vercel.app/api/amazon-import';
const CONNECT_URL='https://buscador-ofertas-diario.vercel.app/admin.html?ofertas_plus_amazon_connect=1';
const tabMeta=new Map();
const inflight=new Map();
function messageTabContext(msg,sender){
  const tabId=Number.isInteger(Number(msg?.tabId)) ? Number(msg.tabId) : (sender?.tab?.id || null);
  const windowId=Number.isInteger(Number(msg?.windowId)) ? Number(msg.windowId) : (sender?.tab?.windowId || null);
  return {tabId,windowId};
}
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type==='STORE_AMAZON_SESSION'){
    chrome.storage.local.set({amazonAccessToken:String(msg.accessToken||''),amazonExpiresAt:Number(msg.expiresAt||0),amazonTokenKind:String(msg.tokenKind||'extension-jwt'),connectedAt:Date.now()}).then(()=>sendResponse({ok:true}));return true;
  }
  if(msg?.type==='AMAZON_META_UPDATE'){
    if(sender?.tab?.id&&msg.meta?.asin)tabMeta.set(sender.tab.id,msg.meta);return false;
  }
  if(msg?.type==='REQUEST_CLIPBOARD_IMPORT'){
    const ctx=messageTabContext(msg,sender);
    const baseMeta=ctx.tabId?(tabMeta.get(ctx.tabId)||{}):{};const meta={...baseMeta,...(msg?.meta||{})};
    (async()=>{const result=await importFromClipboard(meta,Number(msg?.attempts||7),ctx.tabId,ctx.windowId);notify(ctx.tabId,result);sendResponse(result)})();return true;
  }
  if(msg?.type==='AMAZON_AFFILIATE_LINK_FOUND'||msg?.type==='AUTO_IMPORT_AMAZON'){
    const ctx=messageTabContext(msg,sender);
    const baseMeta=ctx.tabId?(tabMeta.get(ctx.tabId)||{}):{};const payload=msg?.payload||{...baseMeta,...(msg?.meta||{}),affiliateUrl:msg?.affiliateUrl||''};
    handleImport(payload,ctx.tabId,ctx.windowId).then(result=>{notify(ctx.tabId,result);sendResponse(result)}).catch(err=>{const result={ok:false,error:err?.message||'Erro inesperado.'};notify(ctx.tabId,result);sendResponse(result)});return true;
  }
});
function notify(tabId,result){if(tabId)chrome.tabs.sendMessage(tabId,{type:'AUTO_IMPORT_STATUS',...result}).catch(()=>{});chrome.storage.local.set({lastAmazonImport:{at:Date.now(),...result}}).catch(()=>{});}
async function getSession(){const d=await chrome.storage.local.get({amazonAccessToken:'',amazonExpiresAt:0,amazonTokenKind:'extension-jwt'});const t=String(d.amazonAccessToken||'').trim();const e=Number(d.amazonExpiresAt||0);return t&&e&&Date.now()<e*1000?{token:t,kind:String(d.amazonTokenKind||'extension-jwt')}:null}
function validAffiliate(url){try{const u=new URL(String(url||'').trim());const h=u.hostname.toLowerCase();return h==='link.amazon'||h==='amzn.to'||(h.endsWith('amazon.com.br')&&(u.searchParams.has('tag')||u.searchParams.has('tag0')||u.searchParams.has('ascsubtag')))}catch(_){return false}}
async function ensureOffscreen(){if(!chrome.offscreen?.createDocument)return false;const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}).catch(()=>[]);if(contexts.length)return true;await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['CLIPBOARD'],justification:'Ler o link de associado copiado pelo usuário na página da Amazon para importar o produto automaticamente.'});return true}
async function readClipboard(){try{if(!await ensureOffscreen())return{ok:false,error:'Leitura automática da área de transferência não disponível.'};return await chrome.runtime.sendMessage({type:'READ_CLIPBOARD'});}catch(err){return{ok:false,error:err?.message||'Não foi possível ler a área de transferência.'}}}
async function importFromClipboard(meta,attempts,tabId,windowId){for(let i=0;i<Math.max(1,attempts);i++){const clip=await readClipboard();if(clip?.ok&&validAffiliate(clip.text))return handleImport({...meta,affiliateUrl:clip.text}, tabId, windowId);if(i<attempts-1)await new Promise(r=>setTimeout(r,300));}return{ok:false,error:'Link Amazon não encontrado na área de transferência. Clique em “Copiar link de associado” e tente novamente.'}}
async function fetchImageDataUrl(url){
  const raw=String(url||'').trim();
  if(!/^https:\/\/(?:[^/]+\.)?(?:[^/]+\.)?(?:amazon\.com|amazon\.com\.br|media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com|images\.amazon\.com)\//i.test(raw)) return '';
  try{
    if(await ensureOffscreen()){
      const result=await chrome.runtime.sendMessage({type:'FETCH_IMAGE_DATA_URL',url:raw});
      if(result?.ok && /^data:image\//i.test(result.dataUrl||'')) return result.dataUrl;
    }
  }catch(_){ }
  return '';
}

async function captureImageFromVisibleAmazonTab(tabId,windowId){
  if(!tabId || !chrome.tabs?.captureVisibleTab) return '';
  try{
    const tab=await chrome.tabs.get(tabId).catch(()=>null);
    if(!tab) return '';
    const rect=await chrome.tabs.sendMessage(tabId,{type:'GET_AMAZON_IMAGE_RECT'});
    if(!rect?.ok) return '';
    // Amazon frequently updates the main image immediately after scrolling.
    await new Promise(r=>setTimeout(r,350));
    const shot=await chrome.tabs.captureVisibleTab(Number.isInteger(windowId)?windowId:tab.windowId,{format:'jpeg',quality:95});
    if(!shot || !await ensureOffscreen()) return '';
    const result=await chrome.runtime.sendMessage({type:'CROP_SCREENSHOT_TO_DATA_URL',screenshot:shot,rect:rect.rect,dpr:Number(rect.dpr||1)});
    return result?.ok && /^data:image\/jpeg;base64,/i.test(result.dataUrl||'') ? result.dataUrl : '';
  }catch(err){ return ''; }
}

async function handleImport(payload,tabId,windowId){
  const session=await getSession();
  if(!session)return{ok:false,connectRequired:true,error:'Conecte a extensão ao OFERTAS+.'};
  if(!/^https:\/\/(www\.)?amazon\.com\.br\//i.test(String(payload?.productUrl||'')))return{ok:false,error:'Abra uma página de produto da Amazon Brasil.'};
  if(!validAffiliate(payload?.affiliateUrl))return{ok:false,error:'Link de associado Amazon não detectado. Gere-o pelo SiteStripe.'};
  const key=`${String(payload?.asin||'')}:${String(payload?.affiliateUrl||'')}`;
  if(inflight.has(key))return inflight.get(key);
  const promise=(async()=>{
    try{
      const enriched={...payload, imageCaptureVersion:'5.2', imageCaptureAttempted:true};
      if(!String(enriched.imageDataUrl||'').startsWith('data:image/') && enriched.image){
        const embedded=await fetchImageDataUrl(enriched.image);
        if(embedded) enriched.imageDataUrl=embedded;
      }
      if(!String(enriched.imageDataUrl||'').startsWith('data:image/') && tabId){
        const screenshotImage=await captureImageFromVisibleAmazonTab(tabId,windowId);
        if(screenshotImage) enriched.imageDataUrl=screenshotImage;
      }
      const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token}`},body:JSON.stringify(enriched)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        if(response.status===401){chrome.tabs.create({url:CONNECT_URL}).catch(()=>{});return{ok:false,connectRequired:true,error:'A autorização da extensão expirou. O painel de conexão foi aberto. Faça login nele e volte à Amazon.'};}
        return{ok:false,error:data?.error||data?.details?.message||`Erro ${response.status}`};
      }
      return{ok:true,data:data?.data||null};
    } finally {inflight.delete(key)}
  })();
  inflight.set(key,promise);return promise;
}
