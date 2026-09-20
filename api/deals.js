const { getEligibleBrands, fetchProductPage, normalizeProduct } = require("./_lomadee");
const SUPABASE_URL = process.env.SUPABASE_URL || "https://kpvunszwaqykxrefuktp.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const REFRESH_MS = 3 * 60 * 60 * 1000;
const CACHE_CONTROL = "public, max-age=0, s-maxage=10800, stale-while-revalidate=300";
function discountPercent(p){const o=Number(p.listPrice||0),v=Number(p.price||0);return o>v&&v>0?Math.round(((o-v)/o)*1000)/10:0;}
function ml(row){return {id:`ml-${row.id}`,source:"mercadolivre",name:String(row.name||"Produto").replace(/\s+/g," ").trim(),category:row.category||"Outros",brand:row.brand||"Mercado Livre",seller:row.brand||"Mercado Livre",price:Number(row.price||0),listPrice:Number(row.list_price||0),image:row.image||"",url:row.product_url||"",affiliateUrl:row.affiliate_url||"",updatedAt:row.updated_at||row.created_at||null,discount:discountPercent({price:row.price,listPrice:row.list_price})};}
async function fetchML(limit=300){if(!SUPABASE_KEY)return [];const p=new URLSearchParams({select:"id,name,category,brand,price,list_price,image,product_url,affiliate_url,created_at,updated_at,active",active:"eq.true",order:"updated_at.desc",limit:String(limit)});try{const r=await fetch(`${SUPABASE_URL}/rest/v1/mercadolivre_products?${p}`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Accept:"application/json"}});if(!r.ok)return [];const rows=await r.json();return (Array.isArray(rows)?rows:[]).map(ml).filter(x=>x.name&&x.affiliateUrl);}catch{return [];}}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function shuffle(a,seed){const x=a.slice();let s=seed>>>0;for(let i=x.length-1;i>0;i--){s=(Math.imul(s,1664525)+1013904223)>>>0;const j=s%(i+1);[x[i],x[j]]=[x[j],x[i]];}return x;}
async function getLomadeeCatalog(apiKey){
  if(!apiKey)return {items:[], brands:[]};
  const {brands,byId}=await getEligibleBrands();
  if(!brands.length)return {items:[], brands:[]};
  const orgs=brands.map(b=>b.id).filter(Boolean);
  const first=await fetchProductPage(apiKey,"",1,100,orgs).catch(()=>({items:[],total:0}));
  const total=Math.max(0,Number(first.total||0));
  const totalPages=Math.min(100,Math.max(1,Math.ceil(total/100)));
  const pages=[];
  for(let page=2;page<=totalPages;page++) pages.push(page);
  const results=await Promise.all(pages.map(page=>fetchProductPage(apiKey,"",page,100,orgs).catch(()=>({items:[]}))));
  const all=[first,...results];
  const seen=new Set(),items=[];
  for(const r of all){
    for(const raw of (r.items||[])){
      const oid=String(raw?.organizationId||"");
      if(!byId.has(oid))continue;
      const p=normalizeProduct(raw,byId);
      if(!p.id||!p.url||seen.has(p.id))continue;
      seen.add(p.id);items.push({...p,source:"lomadee",discount:discountPercent(p)});
    }
  }
  const partnerBrands=brands.filter(b=>b.logo).sort((a,b)=>{
    const c=(Number(b.commissionRate||0)-Number(a.commissionRate||0));
    return c||a.name.localeCompare(b.name,'pt-BR');
  }).slice(0,20);
  return {items,brands:partnerBrands};
}

module.exports=async function handler(req,res){if(req.method!=="GET")return res.status(405).json({error:"Método não permitido."});const apiKey=process.env.LOMADEE_API_KEY||"";try{const [lomadeeResult,mercadolivre]=await Promise.all([getLomadeeCatalog(apiKey),fetchML(1000)]);
    const lomadee=lomadeeResult.items;const seed=Math.floor(Date.now()/REFRESH_MS);const all=shuffle([...lomadee,...mercadolivre],hash(String(seed)));const seen=new Set();const final=all.filter(p=>{const k=String(p.id);if(seen.has(k))return false;seen.add(k);return true;});res.setHeader("Cache-Control",CACHE_CONTROL);const priorityNames=new Set(["shopee"]);
    const partnerBrands=[];
    const addPartner=(name,logo,commissionRate=0)=>{if(!name||!logo)return;if(partnerBrands.some(x=>x.name.toLowerCase()===name.toLowerCase()))return;partnerBrands.push({name,logo,commissionRate});};
    addPartner("Mercado Livre","/assets/brand-mercadolivre.png");
    const shopee=lomadeeResult.brands.find(b=>b.name.toLowerCase()==="shopee");
    if(shopee)addPartner(shopee.name,shopee.logo,shopee.commissionRate);
    for(const b of lomadeeResult.brands){ if(partnerBrands.length>=8)break; if(priorityNames.has(b.name.toLowerCase()))continue; addPartner(b.name,b.logo,b.commissionRate); }
    return res.status(200).json({data:final,count:final.length,lomadeeCount:lomadee.length,mercadoLivreCount:mercadolivre.length,partnerBrands:partnerBrands.slice(0,8),generatedAt:new Date().toISOString(),refreshEverySeconds:10800});}catch(e){return res.status(500).json({error:e?.message||"Não foi possível carregar as ofertas."});}};
