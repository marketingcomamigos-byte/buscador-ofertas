const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kpvunszwaqykxrefuktp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdnVuc3p3YXF5a3hyZWZ1a3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjQyMDEsImV4cCI6MjEwNTMwMDIwMX0.Al3Mz1uQ855tHzOdjN6UAvNCqTy5eLkjHJQum77KwoA";

function timingSafeEqual(a,b){
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
  if(!timingSafeEqual(s,expected)) return null;
  try{
    const header=JSON.parse(b64urlDecode(h).toString('utf8'));
    const payload=JSON.parse(b64urlDecode(p).toString('utf8'));
    const now=Math.floor(Date.now()/1000);
    if(header?.alg!=='HS256' || payload?.aud!=='ofertas-plus-extension' || payload?.scope!=='amazon:import') return null;
    if(!payload?.exp || Number(payload.exp)<=now) return null;
    return payload;
  }catch(_){ return null; }
}

async function fetchAmazonImageDataUrl(url){
  const raw=String(url||'').trim();
  if(!/^https:\/\/(?:[^/]+\.)?(?:[^/]+\.)?(?:amazon\.com|amazon\.com\.br|media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com|images\.amazon\.com)\//i.test(raw)) return '';
  try{
    const upstream=await fetch(raw,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36','Accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'},redirect:'follow'});
    if(!upstream.ok) return '';
    const type=String(upstream.headers.get('content-type')||'image/jpeg').split(';')[0].toLowerCase();
    if(!type.startsWith('image/')) return '';
    const buf=Buffer.from(await upstream.arrayBuffer());
    if(!buf.length || buf.length>2200000) return '';
    return `data:${type};base64,${buf.toString('base64')}`;
  }catch(_){ return ''; }
}


const AMAZON_IMAGE_BUCKET = process.env.AMAZON_IMAGE_BUCKET || 'amazon-images';

function parseDataImage(dataUrl){
  const m=String(dataUrl||'').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if(!m) return null;
  const mime=m[1].toLowerCase()==='image/jpg'?'image/jpeg':m[1].toLowerCase();
  const buffer=Buffer.from(m[2],'base64');
  if(!buffer.length || buffer.length>950000) return null;
  const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
  return {mime,buffer,ext};
}

async function ensureAmazonImageBucket(){
  const base=`${SUPABASE_URL}/storage/v1`;
  const headers={apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,Accept:'application/json','Content-Type':'application/json'};
  try{
    const check=await fetch(`${base}/bucket/${encodeURIComponent(AMAZON_IMAGE_BUCKET)}`,{headers});
    if(check.ok) return true;
    if(check.status!==404) return false;
    const create=await fetch(`${base}/bucket`,{method:'POST',headers,body:JSON.stringify({id:AMAZON_IMAGE_BUCKET,name:AMAZON_IMAGE_BUCKET,public:true,file_size_limit:1000000,allowed_mime_types:['image/jpeg','image/png','image/webp']})});
    if(create.ok || create.status===409) return true;
    return false;
  }catch(_){ return false; }
}

async function uploadAmazonImage(dataUrl,asin){
  const parsed=parseDataImage(dataUrl);
  if(!parsed || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) return '';
  if(!await ensureAmazonImageBucket()) return '';
  const safeAsin=String(asin||'product').replace(/[^A-Za-z0-9_-]/g,'');
  const path=`products/${safeAsin}.${parsed.ext}`;
  try{
    const response=await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(AMAZON_IMAGE_BUCKET)}/products/${encodeURIComponent(`${safeAsin}.${parsed.ext}`)}`,{
      method:'POST',
      headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':parsed.mime,'x-upsert':'true','cache-control':'31536000'},
      body:parsed.buffer
    });
    if(!response.ok) return '';
    return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(AMAZON_IMAGE_BUCKET)}/${path}`;
  }catch(_){ return ''; }
}

function json(res,status,payload){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  return res.status(status).json(payload);
}
async function getUserFromAccessToken(token){
  const keys=[SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY].filter(Boolean);
  for(const key of keys){
    try{
      const userResp=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`,Accept:'application/json'}});
      const user=await userResp.json().catch(()=>null);
      if(userResp.ok&&user?.id) return {ok:true,user};
    }catch(_){}
  }
  return {ok:false};
}
async function verifySupabaseAdminAccess(token){
  const identity=await getUserFromAccessToken(token);
  if(!identity.ok) return {ok:false,reason:'invalid'};
  const key=SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const headers={apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'};
  const adminResp=await fetch(`${SUPABASE_URL}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(identity.user.id)}&limit=1`,{headers});
  const admins=await adminResp.json().catch(()=>[]);
  if(!adminResp.ok||!Array.isArray(admins)||!admins[0]) return {ok:false,reason:'not_admin'};
  return {ok:true,userId:identity.user.id};
}
function validAffiliate(url){
  try{
    const u=new URL(String(url||'').trim());
    const h=u.hostname.toLowerCase();
    return h==='link.amazon' || h==='amzn.to' ||
      (h.endsWith('amazon.com.br') && (u.searchParams.has('tag') || u.searchParams.has('tag0') || u.searchParams.has('ascsubtag')));
  }catch(_){ return false; }
}

module.exports = async function handler(req,res){
  if(req.method === "OPTIONS") return json(res,204,{});
  if(req.method !== "POST") return json(res,405,{error:"Método não permitido."});

  const expected=process.env.OFERTAS_IMPORT_TOKEN || "";
  const auth=String(req.headers.authorization||"");
  const bearer=auth.replace(/^Bearer\s+/i,"").trim();
  const staticOk = expected && timingSafeEqual(bearer,expected);
  const extensionClaims = !staticOk && expected ? verifyJwt(bearer,expected) : null;
  let supabaseAdmin=null;
  if(!staticOk && !extensionClaims && bearer) supabaseAdmin=await verifySupabaseAdminAccess(bearer);
  if(!staticOk && !extensionClaims && !supabaseAdmin?.ok){
    if(supabaseAdmin?.reason==='not_admin') return json(res,403,{error:"Este usuário não possui acesso de administrador."});
    return json(res,401,{error:"Sessão do OFERTAS+ inválida ou expirada. Abra o painel administrativo e conecte novamente a extensão."});
  }
  if(!SUPABASE_SERVICE_ROLE_KEY) return json(res,500,{error:"SUPABASE_SERVICE_ROLE_KEY não configurada no Vercel."});

  let body=req.body;
  if(typeof body === "string") { try{ body=JSON.parse(body); }catch(_){body={};} }
  const affiliateUrl=String(body?.affiliateUrl||"").trim();
  const productUrl=String(body?.productUrl||"").trim();
  const asin=String(body?.asin||"").trim().toUpperCase();
  const rawName=String(body?.name||"").trim();
  const name=rawName.replace(/\s+/g,' ').trim();
  const incomingImage=String(body?.imageDataUrl||'').trim();
  const remoteImage=String(body?.image||'').trim();
  let imageDataUrl=/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(incomingImage) && incomingImage.length<=1400000
    ? incomingImage
    : '';

  if(!validAffiliate(affiliateUrl)) return json(res,400,{error:"Link de associado Amazon inválido. Use o link gerado pelo SiteStripe."});
  if(!/^https:\/\/(www\.)?amazon\.com\.br\//i.test(productUrl)) return json(res,400,{error:"A URL do produto da Amazon Brasil é obrigatória."});
  if(!/^[A-Z0-9]{10}$/.test(asin)) return json(res,400,{error:"ASIN do produto não identificado."});
  if(name.length<2) return json(res,400,{error:"Nome do produto é obrigatório."});

  // Find the current row before handling the image so an existing Storage URL
  // is never replaced by a broken Amazon URL.
  const baseHeaders={
    apikey:SUPABASE_SERVICE_ROLE_KEY,
    Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type":"application/json",
    Accept:"application/json"
  };
  const lookup=await fetch(`${SUPABASE_URL}/rest/v1/amazon_products?select=*&asin=eq.${encodeURIComponent(asin)}&limit=1`,{
    headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,Accept:"application/json"}
  });
  const existing=await lookup.json().catch(()=>[]);
  if(!lookup.ok) return json(res,lookup.status,{error:existing?.message||existing?.hint||"Não foi possível consultar o produto Amazon.",details:existing});
  const existingRow=Array.isArray(existing)&&existing[0]?existing[0]:null;
  const existingStorageImage=/^https:\/\/[^/]+\/storage\/v1\/object\/public\//i.test(String(existingRow?.image||'')) ? String(existingRow.image) : '';

  // First choice: image captured by the extension. Second choice: server-side
  // download from the Amazon image URL. Never store an Amazon URL as the final
  // image because the browser can be blocked by Amazon hotlink protection.
  if(!imageDataUrl && remoteImage) imageDataUrl=await fetchAmazonImageDataUrl(remoteImage);
  let storedImage=await uploadAmazonImage(imageDataUrl,asin);
  if(!storedImage && existingStorageImage) storedImage=existingStorageImage;
  if(!storedImage){
    return json(res,422,{error:"A imagem não foi capturada/salva. A importação foi interrompida para não cadastrar o produto sem foto. Atualize a extensão Amazon e tente importar novamente.",imageStored:false,imageCaptureVersion:String(body?.imageCaptureVersion||"unknown"),receivedImageDataUrl:Boolean(imageDataUrl),receivedImageUrl:Boolean(remoteImage)});
  }

  const affiliateCode = affiliateUrl.match(/^https:\/\/(?:link\.amazon|amzn\.to)\/([A-Za-z0-9_-]+)/i)?.[1] || "";
  const row={
    dedupe_key:`amazon:${asin}`,
    asin,
    name:name.slice(0,320),
    category:String(body?.category||"Amazon").slice(0,120),
    brand:String(body?.brand||"Amazon").slice(0,120),
    price:Number.isFinite(Number(body?.price)) ? Number(body.price) : null,
    list_price:Number.isFinite(Number(body?.listPrice)) ? Number(body.listPrice) : null,
    image:storedImage,
    product_url:productUrl.slice(0,2000),
    affiliate_url:affiliateUrl.slice(0,1000),
    affiliate_code:affiliateCode.slice(0,120),
    raw:body?.raw && typeof body.raw === "object" ? body.raw : {},
    active:true,
    updated_at:new Date().toISOString()
  };

  let saved;
  if(Array.isArray(existing)&&existing[0]?.id){
    const upd=await fetch(`${SUPABASE_URL}/rest/v1/amazon_products?id=eq.${encodeURIComponent(existing[0].id)}`,{
      method:"PATCH",
      headers:{...baseHeaders,Prefer:"return=representation"},
      body:JSON.stringify(row)
    });
    const data=await upd.json().catch(()=>({}));
    if(!upd.ok) return json(res,upd.status,{error:data?.message||data?.hint||"Não foi possível atualizar o produto Amazon.",details:data});
    saved=Array.isArray(data)&&data[0]?data[0]:data;
  } else {
    const ins=await fetch(`${SUPABASE_URL}/rest/v1/amazon_products`,{
      method:"POST",
      headers:{...baseHeaders,Prefer:"return=representation"},
      body:JSON.stringify(row)
    });
    const data=await ins.json().catch(()=>({}));
    if(!ins.ok) return json(res,ins.status,{error:data?.message||data?.hint||"Não foi possível salvar o produto Amazon.",details:data});
    saved=Array.isArray(data)&&data[0]?data[0]:data;
  }
  return json(res,200,{ok:true,created:!Array.isArray(existing)||!existing[0]?.id,imageStored:Boolean(storedImage),data:saved});
};
