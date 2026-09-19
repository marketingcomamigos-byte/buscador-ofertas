(() => {
  // MAIN world: sees exactly the same page JS context used by Amazon/SiteStripe.
  // This avoids relying on navigator.clipboard.readText(), which often fails
  // outside the original user gesture.
  const SOURCE = 'ofertas-plus-amazon-main-v2';
  const AFF_RE = /https:\/\/(?:link\.amazon|amzn\.to)\/[A-Za-z0-9_-]+/ig;
  const AMAZON_TAG_RE = /https:\/\/(?:www\.)?amazon\.com\.br\/[^\s"'<>]+[?&](?:tag|tag0|ascsubtag)=[^\s"'<>]+/ig;
  let last = '';

  function isAffiliate(value) {
    try {
      const u = new URL(String(value || '').trim());
      const h = u.hostname.toLowerCase();
      return h === 'link.amazon' || h === 'amzn.to' ||
        (h.endsWith('amazon.com.br') && (u.searchParams.has('tag') || u.searchParams.has('tag0') || u.searchParams.has('ascsubtag')));
    } catch (_) { return false; }
  }

  function publish(value, kind) {
    const text = String(value || '').trim();
    if (!isAffiliate(text) || text === last) return;
    last = text;
    window.postMessage({ source: SOURCE, type: 'AMAZON_AFFILIATE_FOUND_V2', text, captureKind: kind || 'main-world' }, '*');
  }

  function scanText(text, kind = 'dom') {
    const s = String(text || '');
    for (const m of s.matchAll(AFF_RE)) publish(m[0], kind);
    for (const m of s.matchAll(AMAZON_TAG_RE)) publish(m[0], kind);
  }

  function scanNode(root = document) {
    try {
      const nodes = root.querySelectorAll?.('a[href],input,textarea,button,[data-url],[data-href],[data-link],[data-clipboard-text],[value],[contenteditable="true"]') || [];
      for (const el of nodes) {
        for (const value of [el.value, el.href, el.getAttribute?.('data-url'), el.getAttribute?.('data-href'), el.getAttribute?.('data-link'), el.getAttribute?.('data-clipboard-text'), el.textContent]) {
          scanText(value);
        }
        try { if (el.shadowRoot) scanNode(el.shadowRoot); } catch (_) {}
      }
      scanText(root.body?.innerText || '');
    } catch (_) {}
  }

  // Patch Clipboard.prototype rather than the instance: SiteStripe may call
  // navigator.clipboard.writeText/write from a different component.
  try {
    const clipboard = navigator.clipboard;
    if (clipboard) {
      const proto = Object.getPrototypeOf(clipboard);
      if (proto && typeof proto.writeText === 'function') {
        const original = proto.writeText;
        if (!original.__ofertasPlusWrapped) {
          const wrapped = function(text) {
            scanText(text, 'clipboard.writeText');
            return Promise.resolve(original.apply(this, arguments)).then(result => {
              scanText(text, 'clipboard.writeText');
              return result;
            });
          };
          Object.defineProperty(wrapped, '__ofertasPlusWrapped', { value: true });
          try { proto.writeText = wrapped; } catch (_) {}
        }
      }
      if (proto && typeof proto.write === 'function') {
        const originalWrite = proto.write;
        if (!originalWrite.__ofertasPlusWrapped) {
          const wrappedWrite = function(items) {
            try {
              Promise.all(Array.from(items || []).map(async item => {
                for (const type of Array.from(item?.types || [])) {
                  if (type !== 'text/plain') continue;
                  const blob = await item.getType(type);
                  scanText(await blob.text(), 'clipboard.write');
                }
              })).catch(() => {});
            } catch (_) {}
            return originalWrite.apply(this, arguments);
          };
          Object.defineProperty(wrappedWrite, '__ofertasPlusWrapped', { value: true });
          try { proto.write = wrappedWrite; } catch (_) {}
        }
      }
    }
  } catch (_) {}

  // Capture old copy flows based on selection + execCommand.
  try {
    const originalExec = document.execCommand?.bind(document);
    if (originalExec) {
      document.execCommand = function(command, ...args) {
        const result = originalExec(command, ...args);
        if (String(command).toLowerCase() === 'copy') {
          setTimeout(() => scanText(window.getSelection?.()?.toString() || '', 'execCommand(copy)'), 0);
        }
        return result;
      };
    }
  } catch (_) {}

  // When the user clicks SiteStripe, scan after its UI finishes rendering.
  document.addEventListener('click', event => {
    const el = event.target?.closest?.('button,a,[role="button"],input');
    if (!el) return;
    const label = String(el.innerText || el.value || el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '').toLowerCase();
    if (/copiar|copy|link de associado|link curto|gerar link|obter link/.test(label)) {
      [80, 180, 400, 800, 1400, 2200].forEach(ms => setTimeout(() => scanNode(document), ms));
    }
  }, true);

  try {
    const observer = new MutationObserver(() => scanNode(document));
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  } catch (_) {}

  scanNode(document);
  setInterval(() => scanNode(document), 1000);
})();
