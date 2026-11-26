// Diagnóstico: productos visibles de la tienda que no tienen ninguna imagen.
// Recorre el catálogo visible completo (igual que ofertas-section) y devuelve
// la lista, con stock y SKU, para poder corregirlos en Fierro.

export const config = { maxDuration: 60 };

const PER_PAGE = 200;
const MAX_PAGES = 100;
const CONCURRENCY = 4;

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function fetchPage(baseUrl, page, headers) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${baseUrl}&page=${page}`, { headers });
    if (response.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Tiendanube ${response.status} en página ${page}`);
    return response.json();
  }
  throw new Error(`Tiendanube sin respuesta en página ${page}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const storeId = process.env.TIENDANUBE_STORE_ID;
    const token = process.env.TIENDANUBE_ACCESS_TOKEN;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'UbikDiagnostico (contacto@ubikonline.com.ar)'
    };
    const baseUrl = `https://api.tiendanube.com/2025-03/${storeId}/products?per_page=${PER_PAGE}&visibility=visible&fields=id,name,handle,images,variants`;

    const missing = [];
    let total = 0;
    let withStock = 0;
    let page = 1;
    let done = false;

    while (!done && page <= MAX_PAGES) {
      const batch = [];
      for (let i = 0; i < CONCURRENCY && page <= MAX_PAGES; i++, page++) {
        batch.push(fetchPage(baseUrl, page, headers));
      }
      const results = await Promise.all(batch);
      for (const products of results) {
        if (!Array.isArray(products) || products.length < PER_PAGE) done = true;
        for (const p of products || []) {
          total++;
          const variants = p.variants || [];
          const stock = variants.reduce(function (s, v) { return s + (v.stock || 0); }, 0);
          if (stock > 0) withStock++;
          if (p.images && p.images.length > 0) continue;
          missing.push({
            id: p.id,
            name: p.name.es || Object.values(p.name)[0],
            handle: p.handle.es || Object.values(p.handle)[0],
            sku: variants[0] ? variants[0].sku : null,
            stock: stock
          });
        }
      }
    }

    res.setHeader('Cache-Control', 's-maxage=600');
    return res.status(200).json({ visibles: total, visibles_con_stock: withStock, sin_imagen: missing });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno', detail: String(err) });
  }
}
