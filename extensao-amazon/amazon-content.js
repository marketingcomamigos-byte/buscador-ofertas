(() => {
  const AFF_RE = /https:\/\/(?:link\.amazon|amzn\.to)\/[A-Za-z0-9_-]+/ig;
  const BRIDGE_SOURCE = 'ofertas-plus-amazon-main-v2';
  const clean = (v,max=2000)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
  const meta = sel => document.querySelector(sel)?.getAttribute('content') || '';
  function numberFromText(v){const t=clean(v);const m=t.match(/(?:R\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);return m?Number(m[1].replace(/\./g,'').replace(',','.'))||0:0;}
  function numberFromJsonLd(){for(const n of document.querySelectorAll('script[type="application/ld+json"]')){try{const raw=JSON.parse(n.textContent||'{}');for(const item of (Array.isArray(raw)?raw:[raw])){const offer=Array.isArray(item?.offers)?item.offers[0]:item?.offers;const v=Number(offer?.price||0);if(Number.isFinite(v)&&v>0)return v}}catch(_){} }return 0;}
  function getAsin(url=location.href){for(const re of [/\/(?:dp|gp\/product|d)\/(B0[A-Z0-9]{8}|[A-Z0-9]{10})(?:[\/?#]|$)/i,/[?&]asin=(B0[A-Z0-9]{8}|[A-Z0-9]{10})\b/i,/(\bB0[A-Z0-9]{8}\b)/i]){const m=String(url).match(re);if(m)return m[1].toUpperCase()}const input=document.querySelector('input[name="ASIN"],input#ASIN');return clean(input?.value,20).toUpperCase();}
  function decodeDynamicImage(raw){
    try{
      const obj=JSON.parse(String(raw||''));
      const entries=Object.entries(obj||{});
      entries.sort((a,b)=>{
        const ax=Array.isArray(a[1])?Number(a[1][0]||0)*Number(a[1][1]||0):0;
        const bx=Array.isArray(b[1])?Number(b[1][0]||0)*Number(b[1][1]||0):0;
        return bx-ax;
      });
      return clean(entries[0]?.[0]||'');
    }catch(_){return '';}
  }
  function imageFromPageData(){
    try{
      const html=document.documentElement?.innerHTML||'';
      // Amazon frequently keeps the real image in colorImages/initial, even when
      // the visible <img> only contains a small placeholder. Prefer hiRes/large.
      const blocks=[
        html.match(/\"colorImages\"\s*:\s*(\{.*?\})\s*,\s*\"/s)?.[1]||'',
        html
      ];
      for(const block of blocks){
        const re=/(?:\"|&quot;)?(?:hiRes|large|mainUrl)(?:\"|&quot;)?\s*:\s*(?:\"|&quot;)([^\"&]+)(?:\"|&quot;)/gi;
        let m;
        while((m=re.exec(block))){
          const u=String(m[1]||'').replace(/\\u002F/g,'/').replace(/\\\//g,'/').replace(/\\u0026/g,'&');
          if(/^https?:\/\//i.test(u) && /(?:media-amazon|ssl-images-amazon|images-amazon)/i.test(u)) return u;
        }
      }
    }catch(_){}
    return '';
  }
  function imageFromSrcset(srcset){
    const parts=String(srcset||'').split(',').map(x=>x.trim()).filter(Boolean);
    let best=''; let score=0;
    for(const p of parts){const m=p.match(/^(\S+)\s+(\d+)w/i);if(!m)continue;const n=Number(m[2]);if(n>score){score=n;best=m[1];}}
    return clean(best);
  }
  function asinFallbackImage(asin){
    const a=String(asin||'').trim().toUpperCase();
    return /^[A-Z0-9]{10}$/.test(a) ? `https://images-na.ssl-images-amazon.com/images/P/${a}.01.LZZZZZZZ.jpg` : '';
  }
  function bestImage(){
    const sels=[
      '#landingImage','#imgBlkFront','#imgTagWrapperId img','#main-image-container img',
      '#imageBlock_feature_div img','#imageBlock img','#imageBlockContainer img',
      '[data-a-image-name=\"landingImage\"]'
    ];
    for(const sel of sels){
      const el=document.querySelector(sel); if(!el) continue;
      const dynamic=decodeDynamicImage(el.getAttribute('data-a-dynamic-image'));
      const candidates=[
        el.getAttribute('data-old-hires'),el.getAttribute('data-hires'),
        el.getAttribute('data-src'),el.getAttribute('data-lazy-src'),
        dynamic,el.getAttribute('src'),imageFromSrcset(el.getAttribute('srcset'))
      ].map(clean).filter(Boolean);
      if(candidates[0]) return candidates[0];
    }
    const pageData=imageFromPageData();
    if(pageData) return pageData;
    const metas=[meta('meta[property=\"og:image\"]'),meta('meta[name=\"twitter:image\"]')].map(clean).filter(Boolean);
    if(metas[0]) return metas[0];
    // Fallback: pick the largest likely product image from the Amazon image area.
    try{
      const imgs=[...document.querySelectorAll('#imageBlock img, #imageBlock_feature_div img, #landingImage, img')];
      const candidates=imgs.map(img=>{
        const src=decodeDynamicImage(img.getAttribute('data-a-dynamic-image'))||img.getAttribute('data-old-hires')||img.currentSrc||img.src;
        const w=Number(img.naturalWidth||img.width||0),h=Number(img.naturalHeight||img.height||0);
        return {src:clean(src),score:w*h};
      }).filter(x=>x.src && /^https?:/i.test(x.src) && /images-amazon|ssl-images|media-amazon/i.test(x.src));
      candidates.sort((a,b)=>b.score-a.score);
      if(candidates[0]?.src) return candidates[0].src;
    }catch(_){}
    return asinFallbackImage(getAsin(location.href));
  }
  function extractProduct(){const url=location.href.split('#')[0];return{marketplace:'amazon',asin:getAsin(url),name:clean(document.querySelector('#productTitle')?.textContent||meta('meta[property=\"og:title\"]')||document.querySelector('h1')?.textContent||document.title,320),brand:'Amazon',category:'Amazon',price:numberFromText(document.querySelector('.a-price .a-offscreen')?.textContent)||numberFromText(document.querySelector('#corePrice_feature_div .a-offscreen')?.textContent)||numberFromText(document.querySelector('#priceblock_ourprice')?.textContent)||numberFromJsonLd(),listPrice:numberFromText(document.querySelector('.basisPrice .a-offscreen')?.textContent)||numberFromText(document.querySelector('#listPrice')?.textContent)||numberFromText(document.querySelector('#priceblock_listprice')?.textContent),image:bestImage(),productUrl:url,source:'amazon-page'};}
  function hasRealAmazonImage(){
    try{
      const els=[...document.querySelectorAll('#landingImage,#imgBlkFront,#imageBlock_feature_div img,#imageBlock img')];
      return els.some(el=>{
        const u=decodeDynamicImage(el.getAttribute('data-a-dynamic-image'))||el.getAttribute('data-old-hires')||el.getAttribute('data-hires')||el.currentSrc||el.src||'';
        return /^https?:\/\//i.test(u) && /(?:images-amazon|ssl-images|media-amazon)/i.test(u);
      });
    }catch(_){return false;}
  }
  async function waitForImage(maxMs=7000){const start=Date.now();let m=extractProduct();while(Date.now()-start<maxMs){if(hasRealAmazonImage()) m=extractProduct();if(m.asin && m.name && hasRealAmazonImage()) return m;await new Promise(r=>setTimeout(r,300));m=extractProduct();}return m;}
  function findAffiliateInDom(extra=''){const hits=[];const root=document;try{const nodes=root.querySelectorAll('a[href],input,textarea,button,[data-url],[data-href],[data-link],[data-clipboard-text],[value],[contenteditable="true"]');for(const el of nodes){for(const v of [el.value,el.href,el.getAttribute?.('data-url'),el.getAttribute?.('data-href'),el.getAttribute?.('data-link'),el.getAttribute?.('data-clipboard-text'),el.textContent]){const m=String(v||'').match(AFF_RE);if(m)hits.push(...m)}}}catch(_){} const m=String(extra||'').match(AFF_RE);if(m)hits.push(...m);const body=(document.body?.innerText||'').match(AFF_RE);if(body)hits.push(...body);return hits[0]||'';}
  let last='';let timer=0;
  async function importLink(link,kind='dom'){if(!link||link===last)return;last=link;const m=await waitForImage();chrome.runtime.sendMessage({type:'AMAZON_AFFILIATE_LINK_FOUND',affiliateUrl:link,meta:m,captureKind:kind}).catch(()=>{});}
  function announce(){const m=extractProduct();chrome.runtime.sendMessage({type:'AMAZON_META_UPDATE',meta:m}).catch(()=>{});const link=findAffiliateInDom();if(link)importLink(link,'isolated-dom');}
  window.addEventListener('message',event=>{if(event.source!==window)return;const d=event.data||{};if(d.source!==BRIDGE_SOURCE||d.type!=='AMAZON_AFFILIATE_FOUND_V2'||!d.text)return;importLink(String(d.text),String(d.captureKind||'main-world'));});
  document.addEventListener('copy',e=>{try{const text=e.clipboardData?.getData('text/plain')||'';if(text)importLink(text,'copy-event')}catch(_){}},true);
  document.addEventListener('click',e=>{const el=e.target?.closest?.('button,a,[role="button"],input');if(!el)return;const label=String(el.innerText||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').toLowerCase();if(/copiar|copy|link de associado|link curto|gerar link|obter link/.test(label)){[80,180,400,800,1400,2200].forEach(ms=>setTimeout(announce,ms));}},true);
  const mo=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(announce,150)});try{mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});}catch(_){}
  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg?.type==='GET_AMAZON_IMAGE_RECT'){
      try{
        const el=document.querySelector('#landingImage,#imgBlkFront,#imageBlock_feature_div img,#imageBlock img');
        if(!el){sendResponse({ok:false,error:'Imagem principal não encontrada na página.'});return false;}
        el.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
        const r=el.getBoundingClientRect();
        const vw=window.innerWidth, vh=window.innerHeight;
        const x=Math.max(0,r.left), y=Math.max(0,r.top), right=Math.min(vw,r.right), bottom=Math.min(vh,r.bottom);
        const width=Math.max(0,right-x), height=Math.max(0,bottom-y);
        if(width<80 || height<80){sendResponse({ok:false,error:'Imagem principal não está visível.'});return false;}
        sendResponse({ok:true,rect:{x,y,width,height},dpr:window.devicePixelRatio||1,viewport:{width:vw,height:vh}});
      }catch(err){sendResponse({ok:false,error:err?.message||'Não foi possível localizar a imagem.'});}
      return false;
    }
    if(msg?.type==='GET_AMAZON_META'){sendResponse({...extractProduct(),affiliateUrl:findAffiliateInDom()});return false;}
  });
  announce();
})();
