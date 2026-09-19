const { getEligibleBrands, fetchProductPage, normalizeProduct } = require("./_lomadee");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kpvunszwaqykxrefuktp.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdnVuc3p3YXF5a3hyZWZ1a3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjQyMDEsImV4cCI6MjEwNTMwMDIwMX0.Al3Mz1uQ855tHzOdjN6UAvNCqTy5eLkjHJQum77KwoA";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function fetchMercadoLivreImports(q, limit=20){
  const params = new URLSearchParams();
  params.set("select", "id,dedupe_key,item_id,product_id,name,category,brand,price,list_price,image,product_url,affiliate_url,affiliate_code,created_at,updated_at,active");
  params.set("active", "eq.true");
  params.set("order", "updated_at.desc");
  params.set("limit", String(limit));
  if(q){
    const term=String(q).replace(/[%_]/g, m=>`\\${m}`);
    params.set("or", `(name.ilike.*${term}*,item_id.ilike.*${term}*,product_id.ilike.*${term}*)`);
  }
  const key=SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/mercadolivre_products?${params.toString()}`, {
    headers:{apikey:key, Authorization:`Bearer ${key}`, Accept:"application/json"}
  });
  if(!r.ok) return [];
  const rows=await r.json().catch(()=>[]);
  return Array.isArray(rows)?rows.map(row=>({
    id:`ml-${row.id}`,
    source:"mercadolivre",
    name:String(row.name||"").replace(/\s+/g,' ').replace(/\s*[-–—|]\s*R\$\s*\d[\d.]*,\d{1,2}\s*$/i,'').trim(),
    category:row.category||"Mercado Livre",
    brand:row.brand||"Mercado Livre",
    seller:"Mercado Livre",
    price:Number(row.price||0),
    listPrice:Number(row.list_price||0),
    image:row.image||"",
    url:row.product_url||"",
    affiliateUrl:row.affiliate_url||"",
    affiliateCode:row.affiliate_code||"",
    itemId:row.item_id||"",
    productId:row.product_id||"",
    updatedAt:row.updated_at||row.created_at||null
  })).filter(x=>x.name&&x.affiliateUrl):[];
}


async function fetchAmazonImports(q, limit=12){
  const params = new URLSearchParams();
  params.set("select", "id,asin,name,category,brand,price,list_price,image,product_url,affiliate_url,affiliate_code,created_at,updated_at,active");
  params.set("active", "eq.true");
  params.set("order", "updated_at.desc");
  params.set("limit", String(limit));
  if(q){
    const term=String(q).replace(/[%_]/g, m=>`\\${m}`);
    params.set("or", `(name.ilike.*${term}*,asin.ilike.*${term}*,brand.ilike.*${term}*)`);
  }
  const key=SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/amazon_products?${params.toString()}`,{
    headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"}
  });
  if(!r.ok) return [];
  const rows=await r.json().catch(()=>[]);
  return Array.isArray(rows)?rows.map(row=>({
    id:`amazon-${row.id}`,
    source:"amazon",
    name:String(row.name||"").replace(/\s+/g,' ').trim(),
    category:row.category||"Amazon",
    brand:row.brand||"Amazon",
    seller:"Amazon",
    price:Number(row.price||0),
    listPrice:Number(row.list_price||0),
    image:row.image||"",
    url:row.product_url||"",
    affiliateUrl:row.affiliate_url||"",
    affiliateCode:row.affiliate_code||"",
    asin:row.asin||"",
    updatedAt:row.updated_at||row.created_at||null
  })).filter(x=>x.name&&x.affiliateUrl):[];
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido." });

  const apiKey = process.env.LOMADEE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "LOMADEE_API_KEY não configurada no Vercel." });

  const q = String(req.query.q || "").trim().slice(0, 120);
  if (q.length < 2) return res.status(400).json({ error: "Digite pelo menos 2 caracteres." });

  const requestedPage = Number(req.query.page || 1);
  const page = Number.isFinite(requestedPage) ? Math.max(Math.floor(requestedPage), 1) : 1;
  const limit = 100;
  const startedAt = Date.now();

  try {
    // Eligibility is cached in the function instance for 30 minutes. The brand
    // pages themselves are fetched in parallel on a cold cache.
    const { brands, byId } = await getEligibleBrands();
    if (!brands.length && page > 1) {
      return res.status(200).json({
        data: [], count: 0, query: q, page, hasMore: false,
        eligibleBrandCount: 0, automaticCommissionFilter: true,
        timingMs: Date.now() - startedAt,
      });
    }

    // Important performance improvement: ask Lomadee to return only the eligible
    // organizations instead of downloading generic products and filtering them
    // locally afterward.
    const organizationIds = brands.map((b) => b.id).filter(Boolean);
    // Consulta Lomadee e o catálogo importado do Mercado Livre em paralelo.
    // No modo de relevância, o Mercado Livre vem primeiro para não ficar escondido
    // atrás de dezenas de resultados Lomadee. Nos filtros de preço/desconto, a
    // ordenação do frontend continua valendo normalmente.
    const [source, mercadoLivreProducts, amazonProducts] = await Promise.all([
      brands.length ? fetchProductPage(apiKey, q, page, limit, organizationIds) : Promise.resolve({items:[],total:0}),
      page===1 ? fetchMercadoLivreImports(q, 20).catch(()=>[]) : Promise.resolve([]),
      page===1 ? fetchAmazonImports(q, 12).catch(()=>[]) : Promise.resolve([])
    ]);

    const lomadeeProducts = [];
    const lomadeeSeen = new Set();

    for (const raw of source.items) {
      const organizationId = String(raw?.organizationId || "");
      if (!byId.has(organizationId)) continue;
      const normalized = normalizeProduct(raw, byId);
      if (!normalized.id || !normalized.url || lomadeeSeen.has(normalized.id)) continue;
      lomadeeSeen.add(normalized.id);
      lomadeeProducts.push(normalized);
    }

    // Catálogos importados aparecem no início da primeira página para ficarem visíveis,
    // depois seguem os resultados elegíveis da Lomadee.
    const importedProducts = [...mercadoLivreProducts, ...amazonProducts];
    const products = [...importedProducts];
    const existingKeys = new Set(importedProducts.map(p=>String(p.itemId||p.productId||p.asin||p.affiliateUrl||p.id).toLowerCase()));
    for(const product of lomadeeProducts){
      const key=String(product.id||"").toLowerCase();
      if(existingKeys.has(key)) continue;
      products.push(product);
      existingKeys.add(key);
    }

    res.setHeader("Cache-Control", "public, s-maxage=180, stale-while-revalidate=600");
    res.setHeader("Server-Timing", `lomadee;dur=${Date.now() - startedAt}`);
    return res.status(200).json({
      data: products,
      count: Number(source.total || 0) + importedProducts.length || products.length,
      page,
      pageSize: limit,
      hasMore: (page * limit) < Number(source.total || products.length),
      eligibleBrandCount: brands.length,
      mercadoLivreCount: mercadoLivreProducts.length,
      amazonCount: amazonProducts.length,
      automaticCommissionFilter: true,
      query: q,
      timingMs: Date.now() - startedAt,
    });
  } catch (err) {
    const status = Number(err?.status || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: err?.message || "Não foi possível consultar o catálogo Lomadee.",
      code: err?.code || null,
    });
  }
};
