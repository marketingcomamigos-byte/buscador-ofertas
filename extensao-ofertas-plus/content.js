(() => {
  const LINK_RE = /https:\/\/meli\.la\/[A-Za-z0-9_-]+/i;
  const seen = new Set();
  let lastMeta = null;

  function clean(v, max=1000) { return String(v || '').trim().slice(0, max); }
  function cleanProductName(v) {
    let name = clean(v, 300).replace(/\s+/g, ' ').trim();
    name = name.replace(/\s*[-–—|]\s*R\$\s*\d[\d.]*,\d{1,2}\s*$/i, '').trim();
    return name;
  }
  function meta(name) {
    return document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content || '';
  }
  function firstStructuredPrice() {
    const nodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (const node of nodes) {
      try {
        const obj = JSON.parse(node.textContent || '{}');
        const list = Array.isArray(obj) ? obj : [obj];
        for (const x of list) {
          const offers = x?.offers;
          const offer = Array.isArray(offers) ? offers[0] : offers;
          const n = Number(offer?.price || x?.price || 0);
          if (Number.isFinite(n) && n > 0) return n;
        }
      } catch (_) {}
    }
    return 0;
  }

  function looksLikeLogoImage(url) {
    const v = String(url || '').toLowerCase();
    return /(logo|mercadolivre|mercado-livre|shopee|sprite|favicon|placeholder)/i.test(v);
  }

  function bestProductImage() {
    const imgs = Array.from(document.images || []);
    const candidates = imgs.map(img => ({
      img,
      url: clean(img.currentSrc || img.src || img.getAttribute('data-src') || '', 2000),
      area: (Number(img.naturalWidth) || 0) * (Number(img.naturalHeight) || 0)
    })).filter(x => x.url && !looksLikeLogoImage(x.url) && x.area >= 20000);

    candidates.sort((a,b) => {
      const aML = /D_NQ_NP_|mlstatic/i.test(a.url) ? 1 : 0;
      const bML = /D_NQ_NP_|mlstatic/i.test(b.url) ? 1 : 0;
      if (bML !== aML) return bML - aML;
      return b.area - a.area;
    });
    return candidates[0]?.url || '';
  }

  function extract() {
    const url = location.href.split('#')[0];
    const item = (url.match(/\bMLB\d+\b/i) || [])[0] || '';
    const productId = (url.match(/\/p\/(MLB\d+)/i) || [])[1] || '';
    const title = clean(meta('og:title') || document.querySelector('h1')?.textContent || document.title, 300);
    const image = bestProductImage() || clean(meta('og:image') || meta('twitter:image'), 2000);
    const price = Number(meta('product:price:amount') || firstStructuredPrice() || 0);
    const listPrice = Number(meta('product:original_price:amount') || 0);
    return {
      productUrl: url,
      itemId: item,
      productId,
      name: cleanProductName(title),
      brand: 'Mercado Livre',
      category: 'Mercado Livre',
      image,
      price: Number.isFinite(price) ? price : 0,
      listPrice: Number.isFinite(listPrice) ? listPrice : 0
    };
  }
  function findAffiliateLink() {
    for (const a of document.querySelectorAll('a[href*="meli.la/"]')) {
      const href = a.href || '';
      const m = href.match(LINK_RE);
      if (m) return m[0];
    }
    const bodyText = document.body?.innerText || '';
    const m = bodyText.match(LINK_RE);
    return m ? m[0] : '';
  }
  function notify(affiliateUrl) {
    const cleanLink = (String(affiliateUrl || '').match(LINK_RE) || [])[0] || '';
    if (!cleanLink || seen.has(cleanLink)) return;
    seen.add(cleanLink);
    const payload = {...extract(), affiliateUrl: cleanLink};
    lastMeta = payload;
    chrome.runtime.sendMessage({type:'IMPORT_ML', payload}, response => {
      const result = response || {};
      const text = result.ok ? '✅ Produto salvo no OFERTAS+' : (result.connectRequired ? '🔐 Conecte a extensão ao OFERTAS+' : `⚠️ ${result.error || 'Não foi possível salvar'}`);
      showToast(text);
    });
  }
  function scan() {
    const link = findAffiliateLink();
    if (link) notify(link);
  }
  function showToast(message) {
    let el = document.getElementById('__ofertas_plus_ml_toast');
    if (!el) {
      el=document.createElement('div');
      el.id='__ofertas_plus_ml_toast';
      el.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#151726;color:#fff;padding:12px 15px;border-radius:12px;font:600 13px Arial,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.25);max-width:340px';
      document.documentElement.appendChild(el);
    }
    el.textContent=message;
    clearTimeout(window.__ofertasPlusMLToastTimer);
    window.__ofertasPlusMLToastTimer=setTimeout(()=>el.remove(),3200);
  }

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data?.__ofertasPlusML) return;
    if (e.data.type === 'AFFILIATE_LINK_COPIED') notify(e.data.value);
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'GET_ML_META') {
      sendResponse({...extract(), affiliateUrl:findAffiliateLink(), lastMeta});
    }
    if (msg?.type === 'IMPORT_COPIED') {
      if (msg.affiliateUrl) notify(msg.affiliateUrl);
      sendResponse({ok:true});
    }
    return true;
  });

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, {childList:true,subtree:true});
  setTimeout(scan, 900);
  setTimeout(scan, 2200);
  setTimeout(scan, 5000);
})();
