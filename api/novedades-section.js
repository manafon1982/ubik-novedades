export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const storeId = process.env.TIENDANUBE_STORE_ID;
    const token = process.env.TIENDANUBE_ACCESS_TOKEN;

    const url = `https://api.tiendanube.com/2025-03/${storeId}/products?sort_by=created-at-descending&per_page=200&visibility=visible&fields=id,name,handle,images,variants`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'UbikNovedadesSeccion (contacto@ubikonline.com.ar)'
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({
        error: 'Error al consultar la API de Tiendanube',
        status: response.status,
        detail: errorBody
      });
    }

    const products = await response.json();

    const simplified = products.map(function (p) {
      const variant = p.variants && p.variants[0];
      const noStockLimit = variant ? (variant.stock_management === false) : true;
      const hasStock = variant ? (noStockLimit || (variant.stock !== null && variant.stock > 0)) : true;

      return {
        id: p.id,
        name: p.name.es || Object.values(p.name)[0],
        handle: p.handle.es || Object.values(p.handle)[0],
        image: p.images && p.images[0] ? p.images[0].src : null,
        price: variant ? variant.price : null,
        promotional_price: variant ? variant.promotional_price : null,
        available: hasStock
      };
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(simplified);

  } catch (err) {
    return res.status(500).json({ error: 'Error interno', detail: String(err) });
  }
}