const SUPABASE_URL = process.env.SUPABASE_URL || "https://kpvunszwaqykxrefuktp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdnVuc3p3YXF5a3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjQyMDEsImV4cCI6MjEwNTMwMDIwMX0.Al3Mz1uQ855tHzOdjN6UAvNCqTy5eLkjHJQum77KwoA";

module.exports = async function handler(req,res){
  if(req.method !== "GET") return res.status(405).json({error:"Método não permitido."});
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if(!key) return res.status(500).json({error:"Supabase não configurado."});
  const q = String(req.query.q || "").trim().slice(0,120);
  let limit = Number(req.query.limit || 20);
  if(!Number.isFinite(limit)) limit=20;
  limit=Math.max(1,Math.min(Math.floor(limit),50));

  const params = new URLSearchParams({
    select:"id,item_id,product_id,name,category,brand,price,list_price,image,product_url,affiliate_url,affiliate_code,created_at,updated_at,active",
    active:"eq.true",
    order:"updated_at.desc",
    limit:String(limit)
  });
  if(q){
    const term=q.replace(/[%_]/g,m=>`\\${m}`);
    params.set("or",`(name.ilike.*${term}*,item_id.ilike.*${term}*,product_id.ilike.*${term}*,category.ilike.*${term}*)`);
  }
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/mercadolivre_products?${params.toString()}`,{
      headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"}
    });
    const data=await r.json().catch(()=>[]);
    if(!r.ok) return res.status(r.status).json({error:data?.message||"Não foi possível consultar os produtos do Mercado Livre.",details:data});
    res.setHeader("Cache-Control","public, s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json({data:Array.isArray(data)?data:[],count:Array.isArray(data)?data.length:0});
  }catch(err){
    return res.status(500).json({error:err?.message||"Erro na consulta."});
  }
};
