/**
 * Scraper de pages produit : récupère titre, image, prix et description
 * à partir d'une URL (Amazon, Vertbaudet, Aubert, La Redoute, etc.).
 *
 * Stratégie :
 * 1) Open Graph / Twitter Card (fonctionne sur la majorité des sites modernes)
 * 2) JSON-LD (schema.org/Product) - ultra-fiable quand présent
 * 3) Sélecteurs CSS spécifiques par domaine (fallback)
 * 4) Heuristique regex sur le prix en texte
 */
const cheerio = require('cheerio');
const { request } = require('undici');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const TIMEOUT_MS = 12000;

async function fetchHtml(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await request(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
      },
      maxRedirections: 5,
      signal: controller.signal,
    });
    const status = res.statusCode;
    const html = await res.body.text();
    return { status, html };
  } finally {
    clearTimeout(t);
  }
}

function parsePriceString(raw) {
  if (!raw) return null;
  // Supprime tout sauf chiffres, virgule, point, espaces
  const cleaned = String(raw)
    .replace(/\u00A0/g, ' ')
    .replace(/[^\d,.\s]/g, ' ')
    .trim();
  // Essaie de capter un nombre type "349,99" ou "349.99" ou "1 299,00"
  const match = cleaned.match(/(\d{1,3}(?:[\s.]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (!match) return null;
  let num = match[1].replace(/\s/g, '');
  // Format européen "1.299,99" -> remplace . (milliers), puis , -> .
  if (/,\d{1,2}$/.test(num)) {
    num = num.replace(/\./g, '').replace(',', '.');
  } else {
    // Format US "1,299.99" -> enlève virgules de milliers
    num = num.replace(/,(?=\d{3})/g, '');
  }
  const n = parseFloat(num);
  return Number.isFinite(n) ? n : null;
}

function firstText($, selectors) {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const text = el.text().trim();
      if (text) return text;
    }
  }
  return null;
}

function firstAttr($, selectors, attr) {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const v = el.attr(attr);
      if (v) return v.trim();
    }
  }
  return null;
}

function extractJsonLdProduct($) {
  const out = { name: null, image: null, description: null, price: null };
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const nodes = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const type = node['@type'];
      const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
      if (!isProduct) continue;
      if (!out.name && node.name) out.name = String(node.name).trim();
      if (!out.description && node.description) out.description = String(node.description).trim();
      if (!out.image) {
        const img = Array.isArray(node.image) ? node.image[0] : node.image;
        if (img) out.image = typeof img === 'string' ? img : (img.url || null);
      }
      if (!out.price) {
        const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        if (offers) {
          const p = offers.price || offers.lowPrice || offers.highPrice;
          if (p !== undefined && p !== null) {
            const parsed = parsePriceString(String(p));
            if (parsed !== null) out.price = parsed;
          }
        }
      }
    }
  });
  return out;
}

function resolveUrl(base, maybeRelative) {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

/**
 * Scraper principal.
 * @param {string} url URL d'une page produit
 * @returns {Promise<{name?:string, description?:string, image_url?:string, price?:number, product_url:string}>}
 */
async function scrapeProduct(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('URL invalide');
  }
  const { status, html } = await fetchHtml(url);
  if (status >= 400) {
    throw new Error(`Réponse HTTP ${status}`);
  }
  const $ = cheerio.load(html);

  // 1) JSON-LD Product (le plus fiable)
  const jsonld = extractJsonLdProduct($);

  // 2) Open Graph + Twitter Card
  const ogTitle = firstAttr($, ['meta[property="og:title"]', 'meta[name="twitter:title"]'], 'content');
  const ogDesc = firstAttr($, ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'], 'content');
  const ogImage = firstAttr($, ['meta[property="og:image:secure_url"]', 'meta[property="og:image"]', 'meta[name="twitter:image"]'], 'content');
  const ogPriceAmount = firstAttr($, ['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]'], 'content');

  // 3) Sélecteurs spécifiques par domaine
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();

  let siteName = null;
  let siteImage = null;
  let sitePriceText = null;

  if (host.includes('amazon.')) {
    siteName = firstText($, ['#productTitle']);
    siteImage = firstAttr($, ['#landingImage', '#imgBlkFront', 'img#main-image'], 'src');
    sitePriceText = firstText($, [
      'span.a-price > span.a-offscreen',
      '#corePrice_feature_div .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
    ]);
  } else if (host.includes('vertbaudet')) {
    siteName = firstText($, ['h1.product-name', 'h1[itemprop="name"]', 'h1']);
    sitePriceText = firstText($, ['.price-sales', '[itemprop="price"]', '.product-price']);
  } else if (host.includes('aubert')) {
    siteName = firstText($, ['h1.product-name', 'h1']);
    sitePriceText = firstText($, ['.price-final', '.price', '[itemprop="price"]']);
  } else if (host.includes('laredoute')) {
    siteName = firstText($, ['h1.product-title', 'h1']);
    sitePriceText = firstText($, ['.product-price', '.price', '[itemprop="price"]']);
  } else if (host.includes('cdiscount') || host.includes('fnac') || host.includes('boulanger')) {
    siteName = firstText($, ['h1', '[itemprop="name"]']);
    sitePriceText = firstText($, ['.price', '[itemprop="price"]', '.fpPrice']);
  } else {
    // Générique
    siteName = firstText($, ['h1[itemprop="name"]', 'h1.product-name', 'h1']);
    sitePriceText = firstText($, ['[itemprop="price"]', '.price', '.product-price']);
  }

  // 4) Heuristique : chercher un prix "XX,XX €" ou "XX.XX EUR" dans le HTML brut si rien trouvé
  let heuristicPrice = null;
  if (!jsonld.price && !ogPriceAmount && !sitePriceText) {
    const bodyText = $('body').text().replace(/\s+/g, ' ').slice(0, 30000);
    const m = bodyText.match(/(\d{1,4}[.,]\d{2})\s*(?:€|EUR)/i);
    if (m) heuristicPrice = parsePriceString(m[1]);
  }

  const name = jsonld.name || ogTitle || siteName || '';
  const description = jsonld.description || ogDesc || '';
  const imageRaw = jsonld.image || ogImage || siteImage || '';
  const image_url = imageRaw ? resolveUrl(url, imageRaw) : '';

  let price = null;
  if (jsonld.price !== null && jsonld.price !== undefined) price = jsonld.price;
  else if (ogPriceAmount) price = parsePriceString(ogPriceAmount);
  else if (sitePriceText) price = parsePriceString(sitePriceText);
  else if (heuristicPrice !== null) price = heuristicPrice;

  return {
    name: (name || '').trim().slice(0, 200),
    description: (description || '').trim().slice(0, 800),
    image_url: image_url || '',
    price: price !== null && price !== undefined ? Number(price) : null,
    product_url: url,
    _source: {
      has_jsonld: !!(jsonld.name || jsonld.price),
      host,
    },
  };
}

module.exports = { scrapeProduct };
