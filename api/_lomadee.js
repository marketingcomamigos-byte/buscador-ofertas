const API_BASE = "https://api.lomadee.com.br";
const CACHE_TTL_MS = 30 * 60 * 1000;

let brandCache = {
  expiresAt: 0,
  brands: [],
  byId: new Map(),
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function isAdminRequest(req) {
  const authHeader = String(req?.headers?.authorization || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const supabaseUrl = String(process.env.SUPABASE_URL || "https://kpvunszwaqykxrefuktp.supabase.co").replace(/\/$/, "");
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdnVuc3p3YXF5a3hyZWZ1a3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjQyMDEsImV4cCI6MjEwNTMwMDIwMX0.Al3Mz1uQ855tHzOdjN6UAvNCqTy5eLkjHJQum77KwoA";

  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${match[1]}`,
        Accept: "application/json",
      },
    });
    if (!userResp.ok) return false;
    const user = await userResp.json();
    const userId = String(user?.id || "");
    if (!userId) return false;

    const adminResp = await fetch(`${supabaseUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${match[1]}`,
        Accept: "application/json",
      },
    });
    if (!adminResp.ok) return false;
    const rows = await adminResp.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (_) {
    return false;
  }
}

function pageMeta(payload) {
  return payload?.pagination || payload?.meta || {};
}

function isSiteChannel(channel) {
  const names = [
    channel?.name,
    channel?.availableChannel?.name,
  ].filter(Boolean).map((v) => String(v).toLowerCase());

  return names.some((name) =>
    /(site|blog|website|web)/i.test(name)
  );
}

function hasRestriction(channel) {
  const message = String(channel?.message || "").trim();
  return Boolean(message);
}

function isEligibleBrand(brand) {
  const networkActive = brand?.network?.active === true;
  const commission = Number(brand?.commission?.value);
  const hasCommission = Number.isFinite(commission) && commission > 0;
  const channels = asArray(brand?.channels);

  // Prefer the user's verified Site/Blog channel. When the API doesn't expose
  // a recognizable name, an unrestricted channel is accepted as a fallback so
  // the system doesn't hide a brand unnecessarily.
  const siteChannels = channels.filter(isSiteChannel);
  const compatibleChannel = siteChannels.length
    ? siteChannels.some((c) => !hasRestriction(c))
    : channels.some((c) => !hasRestriction(c));

  return networkActive && hasCommission && compatibleChannel;
}

async function fetchBrandPage(apiKey, page) {
  const url = new URL(`${API_BASE}/affiliate/brands`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", "20");

  const response = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || "Erro ao consultar marcas Lomadee.");
    error.status = response.status;
    error.code = payload?.code || null;
    throw error;
  }
  return {
    items: asArray(payload?.data),
    totalPages: Math.max(1, Number(pageMeta(payload).totalPages || 1)),
  };
}

async function getAllBrands(apiKey) {
  // One request discovers the number of pages; the remaining pages are fetched
  // in parallel instead of sequentially, substantially reducing cold-start latency.
  const first = await fetchBrandPage(apiKey, 1);
  if (first.totalPages <= 1) return first.items;

  const pages = [];
  for (let page = 2; page <= Math.min(first.totalPages, 50); page += 1) {
    pages.push(page);
  }

  const concurrency = 6;
  const results = [];
  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((page) => fetchBrandPage(apiKey, page)));
    results.push(...batchResults);
  }

  return [first.items, ...results.map((r) => r.items)].flat();
}

async function getEligibleBrands({ force = false } = {}) {
  const apiKey = process.env.LOMADEE_API_KEY;
  if (!apiKey) throw new Error("LOMADEE_API_KEY não configurada no Vercel.");

  const now = Date.now();
  if (!force && brandCache.expiresAt > now && brandCache.brands.length) {
    return { brands: brandCache.brands, byId: brandCache.byId, cached: true };
  }

  const all = await getAllBrands(apiKey);
  const eligible = all
    .filter(isEligibleBrand)
    .map((brand) => ({
      id: String(brand.id || ""),
      name: String(brand.name || ""),
      logo: String(brand.logo || ""),
      site: String(brand.site || ""),
      segment: String(brand.segment || ""),
      commissionRate: Number(brand?.commission?.value || 0),
      commissionModel: String(brand?.commission?.transfer || ""),
      channels: asArray(brand.channels).map((c) => ({
        id: String(c?.id || ""),
        name: String(c?.name || c?.availableChannel?.name || ""),
        message: String(c?.message || ""),
      })),
    }))
    .filter((brand) => brand.id && brand.name);

  eligible.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const byId = new Map(eligible.map((brand) => [brand.id, brand]));

  brandCache = {
    expiresAt: now + CACHE_TTL_MS,
    brands: eligible,
    byId,
  };

  return { brands: eligible, byId, cached: false };
}

async function fetchProductPage(apiKey, q, page, limit, organizationIds = []) {
  const url = new URL(`${API_BASE}/affiliate/products`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  if (String(q || "").trim()) {
    url.searchParams.set("search", String(q).trim());
  }
  url.searchParams.set("isAvailable", "true");
  if (organizationIds.length) {
    url.searchParams.set("organizationIds", organizationIds.join(","));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || "Erro na API de produtos Lomadee.");
    error.status = response.status;
    error.code = payload?.code || null;
    throw error;
  }

  return {
    items: asArray(payload?.data),
    total: Number(payload?.count || 0),
  };
}

function normalizeProduct(p, brandMap) {
  const option = asArray(p.options)[0] || null;
  const pricing = asArray(option?.pricing)[0] || null;

  // Evita que logos/ícones da loja sejam usados como foto principal do produto.
  // Quando houver várias imagens, prioriza as que não parecem ser logos e, se a API
  // informar dimensões, favorece a maior área.
  const imageCandidates = [
    ...asArray(option?.images),
    ...asArray(p.images),
  ].map((img) => ({
    url: String(img?.url || "").trim(),
    area: Number(img?.width || 0) * Number(img?.height || 0),
  })).filter((img) => img.url);

  const logoLike = (url) => /(logo|brand|sprite|favicon|placeholder|store-logo|merchant-logo)/i.test(url);
  imageCandidates.sort((a, b) => {
    const aBad = logoLike(a.url) ? 1 : 0;
    const bBad = logoLike(b.url) ? 1 : 0;
    if (aBad !== bBad) return aBad - bBad;
    return (b.area || 0) - (a.area || 0);
  });
  const image = imageCandidates[0]?.url || "";
  const brands = asArray(option?.brands).length ? option.brands : asArray(p.brands);
  const categories = asArray(option?.categories).length ? option.categories : asArray(p.categories);
  const organizationId = String(p.organizationId || "");
  const eligibleBrand = brandMap.get(organizationId);

  const priceValue = Number(pricing?.price ?? 0);
  const listPriceValue = Number(pricing?.listPrice ?? 0);

  return {
    id: String(p.id || ""),
    organizationId,
    name: String(p.name || option?.name || "Produto"),
    description: String(p.description || ""),
    url: String(p.url || ""),
    image,
    available: Boolean(p.available ?? option?.available ?? true),
    seller: String(option?.seller || ""),
    price: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
    listPrice: Number.isFinite(listPriceValue) && listPriceValue > 0 ? listPriceValue : null,
    brand: eligibleBrand?.name || (brands[0]?.name ? String(brands[0].name) : (typeof brands[0] === "string" ? brands[0] : "")),
    brandLogo: eligibleBrand?.logo || "",
    category: categories[0]?.name ? String(categories[0].name) : (typeof categories[0] === "string" ? categories[0] : ""),
    updatedAt: p.updatedAt || option?.updatedAt || null,
    eligible: true,
  };
}

module.exports = {
  API_BASE,
  getEligibleBrands,
  fetchProductPage,
  normalizeProduct,
  isAdminRequest,
};
