const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kpvunszwaqykxrefuktp.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdnVuc3p3YXF5a3hyZWZ1a3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjQyMDEsImV4cCI6MjEwNTMwMDIwMX0.Al3Mz1uQ855tHzOdjN6UAvNCqTy5eLkjHJQum77KwoA';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const IMPORT_SECRET = process.env.OFERTAS_IMPORT_TOKEN || '';

function b64url(value){
  return Buffer.from(value).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function sign(header, payload, secret){
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', secret).update(input).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${input}.${sig}`;
}
function json(res, status, payload){
  res.setHeader('Access-Control-Allow-Origin', 'https://buscador-ofertas-diario.vercel.app');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return res.status(status).json(payload);
}

module.exports = async function handler(req,res){
  if(req.method === 'OPTIONS') return json(res,204,{});
  if(req.method !== 'POST') return json(res,405,{error:'Método não permitido.'});
  if(!IMPORT_SECRET) return json(res,500,{error:'OFERTAS_IMPORT_TOKEN não configurado no Vercel.'});

  const auth = String(req.headers.authorization || '');
  const accessToken = auth.replace(/^Bearer\s+/i,'').trim();
  if(!accessToken) return json(res,401,{error:'Faça login no painel OFERTAS+ antes de conectar a extensão.'});

  // Valida a sessão usando o mesmo mecanismo do painel administrativo.
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    headers:{apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}`, Accept:'application/json'}
  });
  const user = await userResp.json().catch(()=>null);
  if(!userResp.ok || !user?.id) return json(res,401,{error:'Sessão do OFERTAS+ inválida ou expirada.'});

  // A V20 fazia esta checagem com a service_role. A V21 usa a própria RLS da tabela
  // admin_users, igual ao painel, evitando falso "sem acesso de administrador" quando
  // a chave secreta do servidor não é compatível com a consulta REST.
  const adminResp = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,{
    headers:{apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}`, Accept:'application/json'}
  });
  const admins = await adminResp.json().catch(()=>[]);
  if(!adminResp.ok || !Array.isArray(admins) || !admins[0]) {
    return json(res,403,{error:'Este usuário não possui acesso de administrador. Faça login com a mesma conta usada no painel administrativo.'});
  }

  const now = Math.floor(Date.now()/1000);
  const payload = {
    sub:String(user.id),
    aud:'ofertas-plus-extension',
    scope:'mercadolivre:import',
    iat:now,
    exp:now + 7*24*60*60,
    jti:crypto.randomBytes(16).toString('hex')
  };
  const token = sign({alg:'HS256',typ:'JWT'},payload,IMPORT_SECRET);
  return json(res,200,{ok:true,token,expiresAt:payload.exp});
};
