(() => {
  if (window.__OFERTAS_PLUS_ML_HOOK__) return;
  window.__OFERTAS_PLUS_ML_HOOK__ = true;
  try {
    const original = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText.bind(navigator.clipboard)
      : null;
    if (!original) return;
    navigator.clipboard.writeText = async function(text) {
      try {
        const value = String(text || '');
        if (/https:\/\/meli\.la\/[A-Za-z0-9_-]+/i.test(value)) {
          window.postMessage({
            __ofertasPlusML: true,
            type: 'AFFILIATE_LINK_COPIED',
            value
          }, '*');
        }
      } catch (_) {}
      return original(text);
    };
  } catch (_) {}
})();
