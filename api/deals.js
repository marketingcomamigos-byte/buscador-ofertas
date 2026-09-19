const { getEligibleBrands, fetchProductPage, normalizeProduct } = require("./_lomadee");

const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 3 * 60 * 60;
const CACHE_CONTROL = `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`;

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kpvunszwaqykxrefuktp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdnVuc3p3YXF5a3hyZWZ1a3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjQyMDEsImV4cCI6MjEwNTMwMDIwMX0.Al3Mz1uQ855tHzOdjN6UAvNCqTy5eLkjHJQum77KwoA";

function discountPercent(product) {
  const oldPrice = Number(product.listPrice || 0);
  const price = Number(product.price || 0);
  if (!(oldPrice > price && price > 0)) return 0;
  const value = ((oldPrice - price) / oldPrice) * 100;
  return Math.round(value * 10) / 10;
}

function normalizeMercadoLivre(row) {
  const cleanName = String(row?.name || "Produto Mercado Livre")
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—|]\s*R\$\s*\d[\d.]*,\d{1,2}\s*$/i, "")
    .trim();

  return {
    id: `ml-${row.id}`,
    source: "mercadolivre",
    name: cleanName,
    category: row.category || "Mercado Livre",
    brand: row.brand || "Mercado Livre",
    seller: "Mercado Livre",
    price: Number(row.price || 0),
    listPrice: Number(row.list_price || 0),
    image: row.image || "",
    url: row.product_url || "",
    affiliateUrl: row.affiliate_url || "",
    affiliateCode: row.affiliate_code || "",
    itemId: row.item_id || "",
    productId: row.product_id || "",
    updatedAt: row.updated_at || row.created_at || null,
    discount: discountPercent({ price: row.price, listPrice: row.list_price }),
  };
}

async function fetchMercadoLivrePool() {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!key) return [];

  const params = new URLSearchParams({
    select: "id,item_id,product_id,name,category,brand,price,list_price,image,product_url,affiliate_url,affiliate_code,created_at,updated_at,active",
    active: "eq.true",
    order: "updated_at.desc",
    limit: "100",
  });

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/mercadolivre_products?${params.toString()}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return [];

    const rows = await response.json().catch(() => []);
    return (Array.isArray(rows) ? rows : [])
      .map(normalizeMercadoLivre)
      .filter((p) => p.name && p.affiliateUrl);
  } catch (_) {
    return [];
  }
}


function normalizeAmazon(row) {
  return {
    id: `amazon-${row.id}`,
    source: "amazon",
    name: String(row.name || "Produto Amazon").replace(/\s+/g, " ").trim(),
    category: row.category || "Amazon",
    brand: row.brand || "Amazon",
    seller: "Amazon",
    price: Number(row.price || 0),
    listPrice: Number(row.list_price || 0),
    image: row.image || "",
    url: row.product_url || "",
    affiliateUrl: row.affiliate_url || "",
    affiliateCode: row.affiliate_code || "",
    asin: row.asin || "",
    updatedAt: row.updated_at || row.created_at || null,
    discount: discountPercent({ price: row.price, listPrice: row.list_price }),
  };
}

async function fetchAmazonPool() {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    select: "id,asin,name,category,brand,price,list_price,image,product_url,affiliate_url,affiliate_code,created_at,updated_at,active",
    active: "eq.true",
    order: "updated_at.desc",
    limit: "100",
  });
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/amazon_products?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!response.ok) return [];
    const rows = await response.json().catch(() => []);
    return (Array.isArray(rows) ? rows : [])
      .map(normalizeAmazon)
      .filter((p) => p.name && p.affiliateUrl);
  } catch (_) {
    return [];
  }
}

function selectRotating(pool, count, slotOffset = 0) {
  if (!pool.length) return [];
  const slot = Math.floor(Date.now() / REFRESH_INTERVAL_MS) + slotOffset;
  const take = Math.min(count, pool.length);
  const start = Math.abs(slot * take) % pool.length;
  const selected = [];
  for (let i = 0; i < take; i += 1) selected.push(pool[(start + i) % pool.length]);
  return selected;
}

function stableHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle(items, seed) {
  const out = items.slice();
  let state = seed >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function selectDiverseRandom(pool, count) {
  if (!pool.length) return [];
  const slot = Math.floor(Date.now() / REFRESH_INTERVAL_MS);
  const shuffled = seededShuffle(pool, stableHash(String(slot)));
  const selected = [];
  const usedStores = new Set();
  for (const product of shuffled) {
    const store = String(product.brand || product.seller || product.organizationId || product.id || '').trim().toLowerCase();
    if (!usedStores.has(store)) {
      selected.push(product);
      usedStores.add(store);
      if (selected.length >= Math.min(count, pool.length)) return selected;
    }
  }
  for (const product of shuffled) {
    if (!selected.includes(product)) selected.push(product);
    if (selected.length >= Math.min(count, pool.length)) break;
  }
  return selected;
}

async function getLomadeeDeals(apiKey) {
  if (!apiKey) return [];

  const { brands, byId } = await getEligibleBrands();
  if (!brands.length) return [];

  const organizationIds = brands.map((b) => b.id).filter(Boolean);

  // Mantém a regra atual: varrer 5 páginas e considerar somente descontos reais
  // entre 5% e 95%, ordenando pelos maiores descontos.
  const pagesToScan = 5;
  const limit = 100;
  const pageResults = await Promise.all(
    Array.from({ length: pagesToScan }, (_, i) =>
      fetchProductPage(apiKey, "", i + 1, limit, organizationIds)
    )
  );

  const seen = new Set();
  const candidates = [];

  for (const source of pageResults) {
    for (const raw of source.items || []) {
      const organizationId = String(raw?.organizationId || "");
      if (!byId.has(organizationId)) continue;
      const product = normalizeProduct(raw, byId);
      const key = `${organizationId}:${product.id}`;
      if (!product.id || !product.url || seen.has(key)) continue;
      seen.add(key);

      const discount = discountPercent(product);
      if (discount < 5 || discount > 95) continue;
      candidates.push({ ...product, discount, source: "lomadee" });
    }
  }

  candidates.sort((a, b) => {
    if (b.discount !== a.discount) return b.discount - a.discount;
    const priceA = Number(a.price || Number.MAX_SAFE_INTEGER);
    const priceB = Number(b.price || Number.MAX_SAFE_INTEGER);
    return priceA - priceB;
  });

  return candidates.slice(0, 150);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido." });

  const apiKey = process.env.LOMADEE_API_KEY || "";
  const startedAt = Date.now();

  try {
    // As duas fontes são tratadas separadamente. Assim, produtos Mercado Livre
    // continuam aparecendo mesmo quando a Lomadee estiver momentaneamente sem
    // marcas elegíveis.
    const [mercadoLivrePool, lomadeeResult, amazonPool] = await Promise.all([
      fetchMercadoLivrePool(),
      getLomadeeDeals(apiKey).catch((err) => ({ error: err, data: [] })),
      fetchAmazonPool(),
    ]);

    const ml = selectRotating(mercadoLivrePool, 10, 11);
    const amazon = selectRotating(amazonPool, 10, 23);
    const lomadee = Array.isArray(lomadeeResult) ? lomadeeResult : lomadeeResult.data;
    const allLomadee = Array.isArray(lomadee) ? lomadee : [];

    const shopeePool = allLomadee
      .filter((p) => /shopee/i.test(String(p.brand || p.seller || p.name || "")))
      .sort((a, b) => {
        if (b.discount !== a.discount) return b.discount - a.discount;
        return Number(a.price || Number.MAX_SAFE_INTEGER) - Number(b.price || Number.MAX_SAFE_INTEGER);
      });

    const otherPool = allLomadee
      .filter((p) => !/shopee|mercado\s*livre|amazon/i.test(String(p.brand || p.seller || p.name || "")))
      .filter((p) => !ml.some((m) => String(m.id) === String(p.id)))
      .sort((a, b) => b.discount - a.discount);

    const shopee = selectRotating(shopeePool, 10, 37);
    const others = selectDiverseRandom(otherPool, 10);

    // Mantém 10 por grupo quando o catálogo tem itens suficientes.
    // Se algum grupo tiver menos de 10, completa até 40 com outros produtos
    // elegíveis que ainda não foram selecionados, preservando a intercalação.
    const selectedIds = new Set([...ml, ...amazon, ...shopee, ...others].map(p => String(p.id)));
    const fillerPool = seededShuffle(
      allLomadee.filter(p => !selectedIds.has(String(p.id))),
      stableHash(`filler-${Math.floor(Date.now() / REFRESH_INTERVAL_MS)}`)
    );
    const targetTotal = 40;
    const currentTotal = ml.length + amazon.length + shopee.length + others.length;
    const fillCount = Math.max(0, Math.min(targetTotal - currentTotal, fillerPool.length));
    const filler = fillerPool.slice(0, fillCount);

    const buckets = [ml, amazon, shopee, others, filler];
    const data = [];
    const max = Math.max(...buckets.map((b) => b.length), 0);
    // Intercala os 4 grupos para criar uma vitrine única, mantendo diversidade visual.
    for (let i = 0; i < max; i += 1) {
      for (const bucket of buckets) if (bucket[i]) data.push(bucket[i]);
    }

    const mercadoLivreCount = data.filter((p) => p.source === "mercadolivre").length;
    const lomadeeCount = data.filter((p) => p.source === "lomadee" || !p.source).length;
    const amazonCount = data.filter((p) => p.source === "amazon").length;
    const shopeeCount = data.filter((p) => /shopee/i.test(String(p.brand || p.seller || ""))).length;
    const otherCount = data.length - mercadoLivreCount - amazonCount - shopeeCount;

    if (!data.length && lomadeeResult?.error) {
      const status = Number(lomadeeResult.error?.status || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: lomadeeResult.error?.message || "Não foi possível carregar as ofertas do dia.",
        code: lomadeeResult.error?.code || null,
      });
    }

    const generatedAt = new Date().toISOString();
    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.setHeader("Server-Timing", `deals;dur=${Date.now() - startedAt}`);
    res.setHeader("X-Ofertas-Refresh", "3h");

    return res.status(200).json({
      data,
      count: data.length,
      mercadoLivreCount,
      lomadeeCount,
      amazonCount,
      partnerRule: "Até 40 ofertas intercaladas; meta de 10 Mercado Livre + 10 Amazon + 10 Shopee + 10 outras lojas, completando eventuais faltas com o restante do catálogo",
      shopeeCount,
      otherCount,
      refreshEverySeconds: CACHE_TTL_SECONDS,
      generatedAt,
      timingMs: Date.now() - startedAt,
    });
  } catch (err) {
    const status = Number(err?.status || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: err?.message || "Não foi possível carregar as ofertas do dia.",
      code: err?.code || null,
    });
  }
};
