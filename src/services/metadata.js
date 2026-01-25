const axios = require('axios');
const config = require('../config');
const cheerio = require('cheerio');

function getProxyUrl(targetUrl, options = {}) {
  if (!config.SCRAPER_API_KEY) return targetUrl;
  const params = new URLSearchParams({
    api_key: config.SCRAPER_API_KEY,
    url: targetUrl,
    country_code: 'by'
  });
  if (options.premium) params.append('premium', 'true');
  // Рендеринг убираем — он слишком медленный и часто вызывает таймауты
  return `http://api.scraperapi.com?${params.toString()}`;
}

async function parseGoldApple(url) {
  try {
    const slug = url.split('/').pop().split('?')[0];
    const apiUrl = `https://goldapple.by/it_api/v1/catalog/product/by-url?url=${slug}`;
    console.log('🍏 GoldApple: Fetching API via Premium Proxy...');

    const { data } = await axios.get(getProxyUrl(apiUrl, { premium: true }), {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
      timeout: 20000
    });

    const product = data.data;
    return {
      title: `${product.attributes?.brand || ''} ${product.name}`.trim(),
      image: product.image_url || product.media?.[0]?.url,
      url: url
    };
  } catch (e) {
    console.error('❌ GoldApple Error:', e.message);
    return null;
  }
}

async function parseOzon(url) {
  try {
    console.log('🔵 Ozon: Fetching HTML via Premium Proxy...');
    // Запрашиваем основную страницу, а не API
    const { data: html } = await axios.get(getProxyUrl(url, { premium: true }), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' },
      timeout: 25000
    });

    const $ = cheerio.load(html);

    // Ищем разметку JSON-LD (она есть на всех страницах товаров Ozon)
    const ldJsonText = $('script[type="application/ld+json"]').html();
    if (ldJsonText) {
      const ldData = JSON.parse(ldJsonText);
      console.log('✅ Ozon: Found LD+JSON data');
      return {
        title: ldData.name,
        image: ldData.image,
        url: url
      };
    }

    // Если LD+JSON нет, пробуем обычные мета-теги
    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const image = $('meta[property="og:image"]').attr('content');

    return {
      title: title.replace(' - купить на OZON', '').trim(),
      image,
      url
    };
  } catch (e) {
    console.error('❌ Ozon Error:', e.message);
    return null;
  }
}

async function parseWildberries(url) {
  try {
    const id = url.match(/catalog\/(\d+)/)?.[1];
    if (!id) return null;
    const { data } = await axios.get(`https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`, { timeout: 10000 });
    const product = data.data.products[0];
    return {
      title: `${product.brand} / ${product.name}`,
      image: `https://basket-01.wbbasket.ru/vol${Math.floor(id / 100000)}/part${Math.floor(id / 1000)}/${id}/images/big/1.webp`,
      url: url
    };
  } catch (e) { return null; }
}

function getTitleFromUrl(url) {
  try {
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop();
    return slug.replace(/[-_]/g, ' ').replace(/\d+/g, '').trim() || 'Товар';
  } catch (e) { return 'Товар по ссылке'; }
}

async function extractMeta(url, msgObject = null, telegramInstance = null) {
  let result = null;

  if (url.includes('goldapple')) result = await parseGoldApple(url);
  else if (url.includes('ozon')) result = await parseOzon(url);
  else if (url.includes('wildberries') || url.includes('wb.ru')) result = await parseWildberries(url);

  if (result && result.title && !result.title.includes('checking device')) return result;

  // Если наши парсеры не справились — берем то, что видит Телеграм
  if (msgObject?.web_page) {
    const wp = msgObject.web_page;
    let img = '';
    if (wp.photo && telegramInstance) {
      try {
        const fileId = wp.photo[wp.photo.length - 1].file_id;
        const link = await telegramInstance.getFileLink(fileId);
        img = link.href;
      } catch (e) { }
    }
    return { title: wp.title || getTitleFromUrl(url), image: img || result?.image, url };
  }

  return { title: getTitleFromUrl(url), image: result?.image || '', url };
}

module.exports = { extractMeta };