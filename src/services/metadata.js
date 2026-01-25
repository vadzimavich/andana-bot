const axios = require('axios');
const config = require('../config');

// Хелпер для прокси. Теперь он просто и надежно формирует URL.
function getProxyUrl(targetUrl) {
  if (!config.SCRAPER_API_KEY) {
    console.log('⚠️ ScraperAPI key not found, using direct request. This will likely fail.');
    return targetUrl;
  }
  const params = new URLSearchParams({
    api_key: config.SCRAPER_API_KEY,
    url: targetUrl,
    country_code: 'by' // Явно указываем, что мы из Беларуси
  });
  return `http://api.scraperapi.com?${params.toString()}`;
}

async function parseGoldApple(url) {
  try {
    const slug = url.split('/').pop().split('?')[0];
    const apiUrl = `https://goldapple.by/it_api/v1/catalog/product/by-url?url=${slug}`;

    console.log('🍏 GoldApple API Fetch:', apiUrl);

    const { data } = await axios.get(getProxyUrl(apiUrl), { timeout: 20000 });

    const product = data.data;
    return {
      title: `${product.attributes.brand} - ${product.name}`,
      image: product.image_url || product.media?.[0]?.url,
      url: url
    };
  } catch (e) {
    console.error('❌ GoldApple Error:', e.message);
    if (e.response) {
      console.error('-> Status:', e.response.status);
      console.error('-> Data:', JSON.stringify(e.response.data, null, 2));
    }
    return null;
  }
}

async function parseOzon(url) {
  const path = new URL(url).pathname;
  const apiUrl = `https://www.ozon.by/api/composer-api.bx/page/json/v2?url=${path}`;

  // --- ИМИТАЦИЯ МОБИЛЬНОГО ПРИЛОЖЕНИЯ ---
  const headers = {
    'User-Agent': 'ozonapp_by/16.18.0 (Android 13; Pixel 7)',
    'X-O3-App-Name': 'ozonapp_by',
    'X-O3-App-Version': '16.18.0(100024)',
    'X-O3-Device-Type': 'mobile',
    'Accept': 'application/json',
    'Accept-Language': 'ru-BY',
  };

  console.log('🔵 Ozon API Fetch:', apiUrl);
  console.log('🔵 With Headers:', headers);

  try {
    const proxiedUrl = getProxyUrl(apiUrl);
    const { data } = await axios.get(proxiedUrl, { headers, timeout: 25000 });

    console.log('✅ Ozon API response received!');

    const states = data.widgetStates;
    if (!states) {
      console.error('❌ Ozon Error: widgetStates is missing in response.');
      return null;
    }

    const headingKey = Object.keys(states).find(k => k.includes('webProductHeading'));
    const galleryKey = Object.keys(states).find(k => k.includes('webGallery'));

    const title = headingKey ? JSON.parse(states[headingKey]).title : 'Товар Ozon';
    const image = galleryKey ? JSON.parse(states[galleryKey]).coverImage : '';

    console.log(`✅ Parsed from Ozon: ${title}`);
    return { title, image, url };

  } catch (e) {
    console.error('❌❌❌ OZON FATAL ERROR ❌❌❌');
    console.error('-> Message:', e.message);
    if (e.response) {
      console.error('-> Status:', e.response.status);
      console.error('-> Headers:', JSON.stringify(e.response.headers, null, 2));
      console.error('-> Data:', JSON.stringify(e.response.data, null, 2));
    }
    return null;
  }
}

async function parseWildberries(url) {
  try {
    const id = url.match(/catalog\/(\d+)/)?.[1];
    if (!id) return null;
    const { data } = await axios.get(`https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`);
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

  if (result && result.title) return result;

  console.log('⚠️ Expert parsers failed, falling back to Telegram Preview.');

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
    return { title: wp.title || getTitleFromUrl(url), image: img, url };
  }

  return { title: getTitleFromUrl(url), image: '', url };
}

module.exports = { extractMeta };