const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kpvunszwaqykxrefuktp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function sameSecret(a,b){
  if(!a || !b) return false;
  const A=Buffer.from(String(a)); const B=Buffer.from(String(b));
  return A.length===B.length && crypto.timingSafeEqual(A,B);
}
function b64urlDecode(s){
  const pad = s.length % 4 ? '='.repeat(4-(s.length%4)) : '';
  return Buffer.from(String(s).replace(/-/g,'+').replace(/_/g,'/')+pad,'base64');
}
function verifyJwt(token, secret){
  const parts=String(token||'').split('.');
  if(parts.length!==3) return null;
  const [h,p,s]=parts;
  const expected=crypto.createHmac('sha256',secret).update(`${h}.${p}`).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  if(!sameSecret(s,expected)) return null;
  try{
    const header=JSON.parse(b64urlDecode(h).toString('utf8'));
    const payload=JSON.parse(b64urlDecode(p).toString('utf8'));
    const now=Math.floor(Date.now()/1000);
    if(header?.alg!=='HS256' || payload?.aud!=='ofertas-plus-extension' || payload?.scope!=='mercadolivre:import') return null;
    if(!payload?.exp || Number(payload.exp)<=now) return null;
    return payload;
  }catch(_){ return null; }
}
function json(res,status,payload){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  return res.status(status).json(payload);
}

module.exports = async function handler(req,res){
  if(req.method === "OPTIONS") return json(res,204,{});
  if(req.method !== "POST") return json(res,405,{error:"Método não permitido."});

  const expected=process.env.OFERTAS_IMPORT_TOKEN || "";
  const auth=String(req.headers.authorization||"");
  const bearer=auth.replace(/^Bearer\s+/i,"").trim();
  const staticOk = expected && sameSecret(bearer,expected);
  const extensionClaims = !staticOk && expected ? verifyJwt(bearer,expected) : null;
  if(!staticOk && !extensionClaims) return json(res,401,{error:"Autorização inválida. Conecte a extensão pelo OFERTAS+."});
  if(!SUPABASE_SERVICE_ROLE_KEY) return json(res,500,{error:"SUPABASE_SERVICE_ROLE_KEY não configurada no Vercel."});

  let body=req.body;
  if(typeof body === "string") { try{ body=JSON.parse(body); }catch(_){body={};} }
  const affiliateUrl=String(body?.affiliateUrl||"").trim();
  const productUrl=String(body?.productUrl||"").trim();
  const rawName=String(body?.name||"").trim();
  const name=rawName.replace(/\s+/g,' ').replace(/\s*[-–—|]\s*R\$\s*\d[\d.]*,\d{1,2}\s*$/i,'').trim();
  if(!/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/i.test(affiliateUrl)) return json(res,400,{error:"Link afiliado meli.la inválido."});
  if(!/^https:\/\/www\.mercadolivre\.com\.br\//i.test(productUrl)) return json(res,400,{error:"A URL do produto do Mercado Livre é obrigatória."});
  if(name.length<2) return json(res,400,{error:"Nome do produto é obrigatório."});

  const itemId=String(body?.itemId||"").trim();
  const productId=String(body?.productId||"").trim();
  const affiliateCode=affiliateUrl.split("/").filter(Boolean).pop()||"";
  const dedupeKey=itemId || productId || affiliateUrl;
  const row={
    dedupe_key:dedupeKey.slice(0,200),
    item_id:itemId.slice(0,80) || null,
    product_id:productId.slice(0,80) || null,
    name:name.slice(0,300),
    category:String(body?.category||"Mercado Livre").slice(0,120),
    brand:String(body?.brand||"Mercado Livre").slice(0,120),
    price:Number.isFinite(Number(body?.price)) ? Number(body.price) : null,
    list_price:Number.isFinite(Number(body?.listPrice)) ? Number(body.listPrice) : null,
    image:(/brand[-_](?:shopee|mercadolivre|mercado-livre)\./i.test(String(body?.image||"")) ? null : String(body?.image||"").slice(0,2000)) || null,
    product_url:productUrl.slice(0,2000),
    affiliate_url:affiliateUrl.slice(0,500),
    affiliate_code:affiliateCode.slice(0,120),
    raw:body?.raw && typeof body.raw === "object" ? body.raw : {},
    active:true,
    updated_at:new Date().toISOString()
  };

  const r=await fetch(`${SUPABASE_URL}/rest/v1/mercadolivre_products?on_conflict=dedupe_key`,{
    method:"POST",
    headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,"Content-Type":"application/json",Accept:"application/json",Prefer:"resolution=merge-duplicates,return=representation"},
    body:JSON.stringify(row)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) return json(res,r.status,{error:data?.message||data?.hint||"Não foi possível salvar o produto.",details:data});
  const saved=Array.isArray(data)&&data[0]?data[0]:data;
  return json(res,200,{ok:true,created:true,data:saved});
};
