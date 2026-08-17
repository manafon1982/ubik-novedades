export default async function handler(req, res) {
  try {
    const storeId = process.env.TIENDANUBE_STORE_ID;
    const token = process.env.TIENDANUBE_ACCESS_TOKEN;

    const url = `https://api.tiendanube.com/2025-03/${storeId}/products?sort_by=created-at-descending&per_page=200&visibility=visible&fields=id,name,handle,images,variants`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'UbikNovedadesCarrusel (contacto@ubikonline.com.ar)'
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
      return {
        id: p.id,
        name: p.name.es || Object.values(p.name)[0],
        handle: p.handle.es || Object.values(p.handle)[0],
        image: p.images && p.images[0] ? p.images[0].src : null,
        price: variant ? variant.price : null,
        promotional_price: variant ? variant.promotional_price : null
      };
    });

    for (let i = simplified.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = simplified[i];
      simplified[i] = simplified[j];
      simplified[j] = tmp;
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(simplified);

  } catch (err) {
    return res.status(500).json({ error: 'Error interno', detail: String(err) });
  }
}
