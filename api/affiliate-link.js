const { getEligibleBrands } = require("./_lomadee");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const apiKey = process.env.LOMADEE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "LOMADEE_API_KEY não configurada no Vercel." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  const organizationId = String(body?.organizationId || "").trim();
  const targetUrl = String(body?.url || "").trim();
  const mdasc = String(body?.mdasc || "ofertasmais").trim().slice(0, 80);

  if (!organizationId) return res.status(400).json({ error: "organizationId é obrigatório." });
  if (!/^https:\/\//i.test(targetUrl)) return res.status(400).json({ error: "A URL precisa começar com https://." });

  // Second line of defense: even direct calls to this endpoint can only
  // generate links for brands that currently pass the automatic filter.
  const { byId } = await getEligibleBrands();
  if (!byId.has(organizationId)) {
    return res.status(403).json({
      error: "Esta loja não está elegível para divulgação pelo canal configurado.",
      code: "BRAND_NOT_ELIGIBLE",
    });
  }

  const response = await fetch("https://api.lomadee.com.br/affiliate/shortener/url", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      organizationId,
      type: "Custom",
      url: targetUrl,
      mdasc
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status).json({
      error: payload?.message || payload?.error || "Não foi possível gerar o link Lomadee.",
      code: payload?.code || null
    });
  }

  const shortUrls = Array.isArray(payload)
    ? payload.flatMap((item) => Array.isArray(item?.shortUrls) ? item.shortUrls : [])
    : [];
  const firstUrl = shortUrls.find((u) => typeof u === "string" && /^https?:\/\//i.test(u));

  if (!firstUrl) {
    return res.status(502).json({
      error: "A Lomadee respondeu sem um link de saída.",
      raw: payload
    });
  }

  return res.status(200).json({ url: firstUrl });
};
