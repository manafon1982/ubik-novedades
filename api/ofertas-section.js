// Grilla completa de /ofertas/: todos los productos visibles con precio
// promocional cargado, sin el tope de 40 que tiene la página de Tiendanube.
//
// La API de Tiendanube no permite filtrar por "en oferta", así que se recorre
// el catálogo visible completo pidiendo solo los campos necesarios. El
// resultado queda en la caché de Vercel 30 minutos (y se sirve el anterior
// mientras se renueva), de modo que el recorrido se hace pocas veces por hora.

export const config = { maxDuration: 60 };

const PER_PAGE = 200;
const MAX_PAGES = 100;     // hasta 20.000 productos visibles
const CONCURRENCY = 4;     // páginas pedidas a la vez (la API admite ~2 por segundo sostenido)
const TARGET = 1000;       // tope de ofertas que devuelve el endpoint

function smallImage(src) {
  if (!src) return src;
  return src.replace(/-\d+-\d+\.(jpe?g|png|webp)(\?.*)?$/i, '-480-0.webp');
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function fetchPage(baseUrl, page, headers) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${baseUrl}&page=${page}`, { headers });
    if (response.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    // Tiendanube devuelve 404 cuando la página ya no existe.
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Tiendanube ${response.status} en página ${page}`);
    return response.json();
  }
  throw new Error(`Tiendanube sin respuesta en página ${page}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const storeId = process.env.TIENDANUBE_STORE_ID;
    const token = process.env.TIENDANUBE_ACCESS_TOKEN;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'UbikOfertasSeccion (contacto@ubikonline.com.ar)'
    };
    const baseUrl = `https://api.tiendanube.com/2025-03/${storeId}/products?sort_by=created-at-descending&per_page=${PER_PAGE}&visibility=visible&fields=id,name,handle,images,variants`;

    const offers = [];
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
          const variants = p.variants || [];
          const variant = variants.find(function (v) {
            return v.promotional_price !== null && v.promotional_price !== undefined &&
              parseFloat(v.promotional_price) > 0 &&
              parseFloat(v.promotional_price) < parseFloat(v.price);
          });
          if (!variant) continue;

          const available = variants.length === 0 || variants.some(function (v) {
            return v.stock_management === false || (v.stock !== null && v.stock > 0);
          });
          // Las ofertas agotadas no se muestran.
          if (!available) continue;

          offers.push({
            id: p.id,
            name: p.name.es || Object.values(p.name)[0],
            handle: p.handle.es || Object.values(p.handle)[0],
            image: p.images && p.images[0] ? smallImage(p.images[0].src) : null,
            price: variant.price,
            promotional_price: variant.promotional_price,
            available: true
          });
        }
      }
    }

    // Primero los descuentos más grandes.
    offers.sort(function (a, b) {
      const da = 1 - parseFloat(a.promotional_price) / parseFloat(a.price);
      const db = 1 - parseFloat(b.promotional_price) / parseFloat(b.price);
      return db - da;
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(offers.slice(0, TARGET));
  } catch (err) {
    return res.status(500).json({ error: 'Error interno', detail: String(err) });
  }
}
