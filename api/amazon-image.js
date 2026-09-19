const ALLOWED_HOSTS = new Set([
  'images-na.ssl-images-amazon.com',
  'images-na.ssl-images-amazon.com.',
  'm.media-amazon.com',
  'm.media-amazon.com.',
  'images.amazon.com',
  'images.amazon.com.',
  'images-eu.ssl-images-amazon.com',
  'images-eu.ssl-images-amazon.com.',
  'images-fe.ssl-images-amazon.com',
  'images-fe.ssl-images-amazon.com.'
]);

function fail(res, status, message){
  res.status(status).setHeader('Cache-Control','no-store');
  return res.json({error:message});
}

module.exports = async function handler(req,res){
  if(req.method !== 'GET') return fail(res,405,'Método não permitido.');
  const raw=String(req.query?.url||'').trim();
  if(!raw) return fail(res,400,'URL da imagem não informada.');
  let url;
  try{ url=new URL(raw); }catch(_){ return fail(res,400,'URL da imagem inválida.'); }
  if(url.protocol!=='https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return fail(res,403,'Origem da imagem não permitida.');
  try{
    const upstream=await fetch(url.toString(),{
      headers:{
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36',
        'Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if(!upstream.ok) return fail(res,upstream.status,'A Amazon não retornou a imagem.');
    const type=upstream.headers.get('content-type')||'image/jpeg';
    if(!type.toLowerCase().startsWith('image/')) return fail(res,415,'O endereço não retornou uma imagem.');
    const buffer=Buffer.from(await upstream.arrayBuffer());
    res.status(200);
    res.setHeader('Content-Type',type);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options','nosniff');
    return res.send(buffer);
  }catch(err){
    return fail(res,502,'Não foi possível carregar a imagem da Amazon.');
  }
};
