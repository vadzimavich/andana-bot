const axios = require('axios');
const config = require('../config');

function getProxyUrl(targetUrl, options = {}) {
  if (!config.SCRAPER_API_KEY) return targetUrl;
  const params = new URLSearchParams({
    api_key: config.SCRAPER_API_KEY,
    url: targetUrl,
  });
  if (options.premium) params.append('premium', 'true');
  // Убрали country_code: 'by', чтобы расширить пул рабочих IP
  return `http://api.scraperapi.com?${params.toString()}`;
}

async function parseGoldApple(url) {
  try {
    const slug = url.split('/').pop().split('?')[0];
    const apiUrl = `https://goldapple.by/it_api/v1/catalog/product/by-url?url=${slug}`;
    console.log('🍏 GoldApple: Fetching via Global Premium Proxy...');

    const { data } = await axios.get(getProxyUrl(apiUrl, { premium: true }), {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
      timeout: 15000
    });

    if (data?.data) {
      const product = data.data;
      return {
        title: `${product.attributes?.brand || ''} ${product.name}`.trim(),
        image: product.image_url || product.media?.[0]?.url,
        url: url
      };
    }
  } catch (e) {
    console.error('❌ GoldApple Error:', e.message);
  }
  return null;
}

async function parseOzon(url) {
  try {
    // Вытаскиваем SKU (цифры в конце пути перед слэшем или знаком вопроса)
    const skuMatch = url.match(/\/product\/.*?(\d+)\/?/);
    const sku = skuMatch ? skuMatch[1] : null;

    if (!sku) {
      console.log('🔵 Ozon: SKU not found in URL, skipping expert parser');
      return null;
    }

    console.log(`🔵 Ozon: Fetching Short Info for SKU: ${sku}...`);
    // Используем легкий API эндпоинт
    const apiUrl = `https://www.ozon.ru/webapi/product/get-short-info?sku=${sku}`;

    const { data } = await axios.get(getProxyUrl(apiUrl, { premium: true }), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });

    if (data) {
      return {
        title: data.name,
        image: data.mainImage,
        url: url
      };
    }
  } catch (e) {
    console.error('❌ Ozon Error:', e.message);
  }
  return null;
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

  // Если экспертный парсер вернул результат - отдаем его
  if (result && result.title) return result;

  // ФИНАЛЬНЫЙ FALLBACK: Берем данные из превью Телеграма
  // Мы добавили sleep в контроллере, так что web_page должен быть тут
  if (msgObject?.web_page) {
    console.log('📲 Using Telegram WebPage object as fallback');
    const wp = msgObject.web_page;
    let img = '';
    if (wp.photo && telegramInstance) {
      try {
        const fileId = wp.photo[wp.photo.length - 1].file_id;
        const link = await telegramInstance.getFileLink(fileId);
        img = link.href;
      } catch (e) { }
    }
    return {
      title: wp.title || wp.description || getTitleFromUrl(url),
      image: img || (result ? result.image : ''),
      url: url
    };
  }

  return { title: getTitleFromUrl(url), image: '', url };
}

module.exports = { extractMeta };