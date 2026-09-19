const { getEligibleBrands, isAdminRequest } = require("./_lomadee");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido." });
  if (!(await isAdminRequest(req))) {
    return res.status(401).json({ error: "Acesso administrativo necessário." });
  }
  try {
    const { brands, cached } = await getEligibleBrands();
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({
      data: brands,
      count: brands.length,
      cached,
      automaticCommissionFilter: true,
      rule: "network.active=true + comissão calculada > 0 + canal sem restrição",
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Não foi possível consultar as marcas elegíveis." });
  }
};
