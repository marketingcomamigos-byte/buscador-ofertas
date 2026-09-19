const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kpvunszwaqykxrefuktp.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdnVuc3p3YXF5a3hyZWZ1a3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjQyMDEsImV4cCI6MjEwNTMwMDIwMX0.Al3Mz1uQ855tHzOdjN6UAvNCqTy5eLkjHJQum77KwoA';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const IMPORT_SECRET = process.env.OFERTAS_IMPORT_TOKEN || '';

function b64url(value){return Buffer.from(value).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function sign(header,payload,secret){
  const input=`${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig=crypto.createHmac('sha256',secret).update(input).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${input}.${sig}`;
}
function json(res,status,payload){
  res.setHeader('Access-Control-Allow-Origin','https://buscador-ofertas-diario.vercel.app');
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  return res.status(status).json(payload);
}

async function getUserFromAccessToken(accessToken){
  const keys=[SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY].filter(Boolean);
  let last=null;
  for(const key of keys){
    try{
      const resp=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
        headers:{apikey:key,Authorization:`Bearer ${accessToken}`,Accept:'application/json'}
      });
      const user=await resp.json().catch(()=>null);
      if(resp.ok&&user?.id) return {ok:true,user};
      last={status:resp.status,user};
    }catch(err){ last={error:err?.message||String(err)}; }
  }
  return {ok:false,last};
}

async function isAdmin(userId, accessToken){
  const keys=[SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY].filter(Boolean);
  for(const key of keys){
    try{
      const resp=await fetch(`${SUPABASE_URL}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,{
        headers:{apikey:key,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY?key:accessToken}`,Accept:'application/json'}
      });
      const rows=await resp.json().catch(()=>[]);
      if(resp.ok) return Array.isArray(rows)&&!!rows[0];
    }catch(_){}
  }
  return false;
}

module.exports=async function handler(req,res){
  if(req.method==='OPTIONS') return json(res,204,{});
  if(req.method!=='POST') return json(res,405,{error:'Método não permitido.'});
  if(!IMPORT_SECRET) return json(res,500,{error:'OFERTAS_IMPORT_TOKEN não configurado no Vercel.'});

  const accessToken=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!accessToken) return json(res,401,{error:'Faça login no painel OFERTAS+ antes de conectar a extensão.'});

  const identity=await getUserFromAccessToken(accessToken);
  if(!identity.ok) return json(res,401,{error:'Sessão do OFERTAS+ inválida ou expirada. Atualize o painel administrativo e tente novamente.'});
  if(!(await isAdmin(identity.user.id,accessToken))) return json(res,403,{error:'Este usuário não possui acesso de administrador.'});

  const now=Math.floor(Date.now()/1000);
  const payload={sub:String(identity.user.id),aud:'ofertas-plus-extension',scope:'amazon:import',iat:now,exp:now+30*24*60*60,jti:crypto.randomBytes(18).toString('hex')};
  return json(res,200,{ok:true,token:sign({alg:'HS256',typ:'JWT'},payload,IMPORT_SECRET),expiresAt:payload.exp});
};
