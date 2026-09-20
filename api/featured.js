const { getEligibleBrands, fetchProductPage, normalizeProduct } = require('./_lomadee');
const SUPABASE_URL=process.env.SUPABASE_URL||'https://kpvunszwaqykxrefuktp.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'';
const TERMS=[
  ['smart tv',['smart tv','televisao','televisão','tv']],
  ['smartphone',['smartphone','celular','iphone','galaxy','redmi','xiaomi']],
  ['eletronicos',['eletronico','eletrônico','eletronicos','eletrônicos','tablet','notebook','computador','monitor','camera','câmera']],
  ['fones',['fone','fones','headset','earbuds','bluetooth']],
  ['ferramentas',['ferramenta','furadeira','parafusadeira','serra','esmerilhadeira']],
  ['aspiradores',['aspirador','aspiradores','robo aspirador','robô aspirador']],
  ['roupas',['roupa','vestido','camiseta','calca','calça','jaqueta','moletom']],
  ['sapatos',['sapato','sapatos','tenis','tênis','sandalia','sandália','chinelo','bota']]
];
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function score(p){
  const t=norm([p.name,p.category,p.brand].join(' ')); let s=0;
  for(let i=0;i<TERMS.length;i++) if(TERMS[i][1].some(k=>t.includes(norm(k)))) s+=100-i;
  const d=Number(p.discount||0); if(d>0)s+=Math.min(30,d);
  if(p.source==='mercadolivre')s+=2;
  return s;
}
function ml(row){const old=Number(row.list_price||0),price=Number(row.price||0);return {id:`ml-${row.id}`,source:'mercadolivre',name:String(row.name||'Produto').replace(/\s+/g,' ').trim(),category:row.category||'Outros',brand:row.brand||'Mercado Livre',seller:'Mercado Livre',price,listPrice:old,image:row.image||'',url:row.product_url||'',affiliateUrl:row.affiliate_url||'',discount:old>price&&price>0?Math.round((1-price/old)*100):0};}
async function mlRows(){if(!SUPABASE_KEY)return[];const p=new URLSearchParams({select:'id,name,category,brand,price,list_price,image,product_url,affiliate_url,updated_at,created_at,active',active:'eq.true',order:'updated_at.desc',limit:'500'});try{const r=await fetch(`${SUPABASE_URL}/rest/v1/mercadolivre_products?${p}`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Accept:'application/json'}});if(!r.ok)return[];const rows=await r.json();return(Array.isArray(rows)?rows:[]).map(ml).filter(x=>x.name&&x.affiliateUrl)}catch{return[]}}
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
 const apiKey=process.env.LOMADEE_API_KEY||''; if(!apiKey)return res.status(500).json({error:'LOMADEE_API_KEY não configurada no Vercel.'});
 try{
  const {brands,byId}=await getEligibleBrands(); const orgs=brands.map(b=>b.id).filter(Boolean);
  const lom=await Promise.all(TERMS.map(async([_,keys])=>{
    const q=keys[0]; const r=await fetchProductPage(apiKey,q,1,30,orgs).catch(()=>({items:[]})); const out=[]; const seen=new Set();
    for(const raw of(r.items||[])){const oid=String(raw?.organizationId||'');if(!byId.has(oid))continue;const p=normalizeProduct(raw,byId);if(!p.id||!p.url||seen.has(p.id))continue;seen.add(p.id);out.push({...p,source:'lomadee',discount:(Number(p.listPrice||0)>Number(p.price||0)?Math.round((1-p.price/p.listPrice)*100):0)})} return out;
  }));
  const pool=[...lom.flat(),...(await mlRows())]; const unique=new Map(); for(const p of pool)unique.set(String(p.id),p);
  const selected=[]; const used=new Set();
  // Garante presença das categorias pedidas e depois completa com as melhores pontuações.
  for(const [label,keys] of TERMS){
    const candidates=[...unique.values()].filter(p=>!used.has(p.id)&&keys.some(k=>norm([p.name,p.category,p.brand].join(' ')).includes(norm(k)))).sort((a,b)=>score(b)-score(a));
    for(const p of candidates.slice(0,4)){selected.push(p);used.add(p.id)}
  }
  const rest=[...unique.values()].filter(p=>!used.has(p.id)).sort((a,b)=>score(b)-score(a));
  selected.push(...rest);
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({data:selected.slice(0,30),count:Math.min(30,selected.length),categories:TERMS.map(x=>x[0])});
 }catch(e){return res.status(500).json({error:e?.message||'Não foi possível montar as ofertas em destaque.'})}
};
