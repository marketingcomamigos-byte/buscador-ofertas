const { getEligibleBrands, fetchProductPage, normalizeProduct } = require('./_lomadee');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kpvunszwaqykxrefuktp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const PAGE_SIZE = 30;
const HALF = 15;

function discountPercent(p){
  const old=Number(p.listPrice||0), price=Number(p.price||0);
  return old>price&&price>0 ? Math.round(((old-price)/old)*1000)/10 : 0;
}

function normalizeML(row){
  return {
    id:`ml-${row.id}`, source:'mercadolivre',
    name:String(row.name||'Produto').replace(/\s+/g,' ').trim(),
    category:row.category||'Outros', brand:row.brand||'Mercado Livre', seller:row.brand||'Mercado Livre',
    price:Number(row.price||0), listPrice:Number(row.list_price||0), image:row.image||'',
    url:row.product_url||'', affiliateUrl:row.affiliate_url||'',
    updatedAt:row.updated_at||row.created_at||null,
    discount:discountPercent({price:row.price,listPrice:row.list_price})
  };
}

async function fetchMLRange(start, end){
  if(!SUPABASE_KEY || end < start) return {items:[],total:0};
  const params=new URLSearchParams({
    select:'id,name,category,brand,price,list_price,image,product_url,affiliate_url,created_at,updated_at,active',
    active:'eq.true', order:'updated_at.desc'
  });
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/mercadolivre_products?${params.toString()}`,{
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Accept:'application/json',Prefer:'count=exact',Range:`${start}-${end}`}
    });
    if(!r.ok) return {items:[],total:0};
    const rows=await r.json();
    const contentRange=String(r.headers.get('content-range')||'');
    const match=contentRange.match(/\/(\d+)$/);
    const total=match?Number(match[1]):(Array.isArray(rows)?Math.max(start+rows.length,0):0);
    const items=(Array.isArray(rows)?rows:[]).map(normalizeML).filter(x=>x.name&&x.affiliateUrl);
    return {items,total};
  }catch(e){
    return {items:[],total:0};
  }
}

async function getLomadeeTotals(apiKey){
  const {brands,byId}=await getEligibleBrands();
  const orgs=brands.map(b=>b.id).filter(Boolean);
  // First try the filtered request. If Lomadee rejects a long organizationIds
  // parameter, retry without it and filter the returned products locally.
  let first;
  try{
    first=await fetchProductPage(apiKey,'',1,HALF,orgs);
  }catch(e){
    first=await fetchProductPage(apiKey,'',1,HALF,[]);
  }
  return {brands,byId,orgs,first};
}

async function fetchLomadeePage(apiKey, byId, orgs, page, limit, fallbackFirst){
  let result;
  try{
    result = (page===1 && fallbackFirst) ? fallbackFirst : await fetchProductPage(apiKey,'',page,limit,orgs);
  }catch(e){
    // Retry without organizationIds. This prevents a large list of eligible
    // brands from breaking the whole catalog because of URL/API limits.
    try{
      result = await fetchProductPage(apiKey,'',page,limit,[]);
    }catch(_){
      return {items:[],total:0};
    }
  }
  const items=[];
  const seen=new Set();
  for(const raw of (result.items||[])){
    const oid=String(raw?.organizationId||'');
    if(byId.size && !byId.has(oid)) continue;
    const product=normalizeProduct(raw,byId);
    if(!product.id || !product.url || seen.has(product.id)) continue;
    seen.add(product.id);
    items.push({...product,source:'lomadee',discount:discountPercent(product)});
  }
  return {items,total:Number(result.total||0)};
}

function allocation(page,lTotal,mTotal){
  const lPages=Math.ceil(lTotal/HALF);
  const mPages=Math.ceil(mTotal/HALF);
  const shared=Math.min(lPages,mPages);
  if(page<=shared){
    return {lPages:[page],mStart:(page-1)*HALF,mLimit:HALF};
  }
  if(lPages>mPages){
    const n=page-shared;
    return {lPages:[shared+(2*n-1),shared+(2*n)],mStart:mTotal,mLimit:0};
  }
  if(mPages>lPages){
    const n=page-shared;
    // IMPORTANT: continue after the ML rows already consumed in the shared pages.
    return {lPages:[],mStart:shared*HALF+(n-1)*PAGE_SIZE,mLimit:PAGE_SIZE};
  }
  return {lPages:[],mStart:mTotal,mLimit:0};
}

module.exports=async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método não permitido.'});
  const apiKey=process.env.LOMADEE_API_KEY||'';
  if(!apiKey) return res.status(500).json({error:'LOMADEE_API_KEY não configurada no Vercel.'});
  const requested=Number(req.query.page||1);
  const page=Number.isFinite(requested)?Math.max(1,Math.floor(requested)):1;
  try{
    // Fetch both sources independently. If one source is temporarily unavailable,
    // the other can still populate the catalog instead of returning a blank page.
    let lom={brands:[],byId:new Map(),orgs:[],first:{items:[],total:0}};
    try{ lom=await getLomadeeTotals(apiKey); }catch(e){ /* ML can still work */ }

    const firstML=await fetchMLRange(0,HALF-1);
    const lTotal=Number(lom.first?.total||0);
    const mTotal=Number(firstML.total||0);
    const lPages=Math.ceil(lTotal/HALF), mPages=Math.ceil(mTotal/HALF);
    const totalPages=Math.max(1,Math.ceil((lTotal+mTotal)/PAGE_SIZE));

    if(page>totalPages){
      return res.status(200).json({data:[],page,pageSize:PAGE_SIZE,totalProducts:lTotal+mTotal,totalPages,lomadeeTotal:lTotal,mercadoLivreTotal:mTotal,hasMore:false});
    }

    const a=allocation(page,lTotal,mTotal);
    const lRequests=a.lPages.map(lp=>fetchLomadeePage(apiKey,lom.byId,lom.orgs,lp,HALF,lp===1?lom.first:null));
    const mlRequest = a.mLimit
      ? (page===1 ? Promise.resolve(firstML) : fetchMLRange(a.mStart,a.mStart+a.mLimit-1))
      : Promise.resolve({items:[],total:mTotal});

    const [lResults,mlResult]=await Promise.all([Promise.all(lRequests),mlRequest]);
    let data=[];
    for(const r of lResults) data.push(...r.items);
    data.push(...mlResult.items);

    // In case one side returned fewer rows than expected, fill the page from the
    // other source. This keeps the catalog useful even when a source has sparse pages.
    if(data.length<PAGE_SIZE){
      if(lTotal>0 && a.lPages.length){
        const nextLp=Math.max(...a.lPages)+1;
        if(nextLp<=lPages){
          const extra=await fetchLomadeePage(apiKey,lom.byId,lom.orgs,nextLp,HALF,null);
          data.push(...extra.items);
        }
      }
      if(data.length<PAGE_SIZE && mTotal>0 && a.mLimit){
        const extraStart=Math.min(mTotal, (a.mStart||0)+a.mLimit);
        if(extraStart<mTotal){
          const extra=await fetchMLRange(extraStart,Math.min(mTotal-1,extraStart+(PAGE_SIZE-data.length)-1));
          data.push(...extra.items);
        }
      }
    }

    // Remove accidental duplicates while preserving source order.
    const seen=new Set();
    data=data.filter(p=>{const k=String(p.id);if(seen.has(k))return false;seen.add(k);return true;}).slice(0,PAGE_SIZE);

    res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      data,page,pageSize:PAGE_SIZE,totalProducts:lTotal+mTotal,totalPages,
      lomadeeTotal:lTotal,mercadoLivreTotal:mTotal,hasMore:page<totalPages,
      sources:{lomadee:'catálogo elegível da Lomadee',mercadoLivre:'produtos ativos importados pela extensão com link afiliado'}
    });
  }catch(e){
    return res.status(500).json({error:e?.message||'Não foi possível carregar o catálogo.'});
  }
};
