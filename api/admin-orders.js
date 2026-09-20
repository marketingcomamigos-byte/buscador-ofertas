const { isAdminRequest } = require("./_lomadee");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!(await isAdminRequest(req))) {
    return res.status(401).json({ error: "Acesso administrativo necessário." });
  }

  const apiKey = process.env.LOMADEE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "LOMADEE_API_KEY não configurada no Vercel." });
  }

  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50) || 50));

  const url = new URL("https://api.lomadee.com.br/affiliate/orders");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": apiKey, "Accept": "application/json" }
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 403) {
      return res.status(403).json({
        error: "A API Lomadee exige o escopo orders:read para consultar pedidos.",
        requiresScope: "orders:read",
        lomadee: payload
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: payload?.message || payload?.error || "Erro ao consultar pedidos na Lomadee.",
        code: payload?.code || null
      });
    }

    res.setHeader("Cache-Control", "private, max-age=120");
    return res.status(200).json({
      data: Array.isArray(payload?.data) ? payload.data : [],
      meta: payload?.meta || {}
    });
  } catch (err) {
    return res.status(500).json({
      error: "Não foi possível acessar os pedidos da Lomadee."
    });
  }
};
