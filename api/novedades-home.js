// Cantidad de novedades con stock que devuelve el endpoint.
const TARGET = 200;
// Máximo de productos por página que permite la API de Tiendanube.
const PER_PAGE = 200;
// Tope de páginas a consultar para completar TARGET cuando hay productos agotados.
const MAX_PAGES = 3;

export default async function handler(req, res) {
  try {
    const storeId = process.env.TIENDANUBE_STORE_ID;
    const token = process.env.TIENDANUBE_ACCESS_TOKEN;

    const url = `https://api.tiendanube.com/2025-03/${storeId}/products?sort_by=created-at-descending&per_page=${PER_PAGE}&visibility=visible&fields=id,name,handle,images,variants`;

    const simplified = [];

    for (let page = 1; page <= MAX_PAGES && simplified.length < TARGET; page++) {
      const response = await fetch(`${url}&page=${page}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'UbikNovedadesCarrusel (contacto@ubikonline.com.ar)'
        }
      });

      if (!response.ok) {
        // Las páginas extra solo completan la lista: si no existen o fallan,
        // se devuelve lo que ya se juntó.
        if (page > 1) break;

        const errorBody = await response.text();
        return res.status(response.status).json({
          error: 'Error al consultar la API de Tiendanube',
          status: response.status,
          detail: errorBody
        });
      }

      const products = await response.json();

      for (const p of products) {
        if (simplified.length >= TARGET) break;

        const variants = p.variants || [];
        const variant = variants[0];
        // Con stock: alguna variante tiene stock infinito o unidades disponibles.
        const hasStock = variants.length === 0 || variants.some(function (v) {
          return v.stock_management === false || (v.stock !== null && v.stock > 0);
        });

        // Las novedades agotadas no se muestran.
        if (!hasStock) continue;

        simplified.push({
          id: p.id,
          name: p.name.es || Object.values(p.name)[0],
          handle: p.handle.es || Object.values(p.handle)[0],
          image: p.images && p.images[0] ? p.images[0].src : null,
          price: variant ? variant.price : null,
          promotional_price: variant ? variant.promotional_price : null,
          available: true
        });
      }

      if (products.length < PER_PAGE) break;
    }

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
