const axios = require('axios');
const config = require('../config');

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

// Хелпер для прокси
function getProxyUrl(targetUrl) {
  if (!config.SCRAPER_API_KEY) return targetUrl;
  // Проксируем запрос через ScraperAPI
  return `http://api.scraperapi.com?api_key=${config.SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}`;
}

async function parseGoldApple(url) {
  try {
    const slug = url.split('/').pop().split('?')[0];
    const apiUrl = `https://goldapple.by/it_api/v1/catalog/product/by-url?url=${slug}`;

    console.log('🍏 GoldApple Fetch (via Proxy)...');

    const { data } = await axios.get(getProxyUrl(apiUrl), { timeout: 15000 });

    const product = data.data;
    return {
      title: `${product.attributes.brand} - ${product.name}`,
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
    const path = new URL(url).pathname;
    const apiUrl = `https://www.ozon.by/api/composer-api.bx/page/json/v2?url=${path}`;

    console.log('🔵 Ozon Fetch (via Proxy)...');

    const { data } = await axios.get(getProxyUrl(apiUrl), { timeout: 15000 });

    // Парсинг на основе твоего v2.json
    const states = data.widgetStates || {};

    // Ищем виджет заголовка (ключ может содержать динамический ID, ищем по вхождению)
    const headingKey = Object.keys(states).find(k => k.includes('webProductHeading'));
    const galleryKey = Object.keys(states).find(k => k.includes('webGallery'));

    const title = headingKey ? JSON.parse(states[headingKey]).title : null;
    const image = galleryKey ? JSON.parse(states[galleryKey]).coverImage : null;

    return {
      title: title || 'Товар Ozon',
      image: image || '',
      url: url
    };
  } catch (e) {
    console.error('❌ Ozon Error:', e.message);
    return null;
  }
}

// WB (оставляем без прокси, он обычно пускает)
async function parseWildberries(url) {
  try {
    const id = url.match(/catalog\/(\d+)/)?.[1];
    if (!id) return null;
    const { data } = await axios.get(`https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`);
    const product = data.data.products[0];
    return {
      title: product.name,
      image: `https://basket-01.wbbasket.ru/vol${Math.floor(id / 100000)}/part${Math.floor(id / 1000)}/${id}/images/big/1.webp`,
      url: url
    };
  } catch (e) { return null; }
}

async function extractMeta(url, msgObject = null, telegramInstance = null) {
  let result = null;

  if (url.includes('goldapple')) result = await parseGoldApple(url);
  else if (url.includes('ozon')) result = await parseOzon(url);
  else if (url.includes('wildberries') || url.includes('wb.ru')) result = await parseWildberries(url);

  if (result && result.title) return result;

  // Если спец-парсеры не сработали, берем данные из Telegram Preview (если они там есть)
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
    return { title: wp.title || 'Товар', image: img, url };
  }

  return { title: 'Товар по ссылке', image: '', url };
}

module.exports = { extractMeta };