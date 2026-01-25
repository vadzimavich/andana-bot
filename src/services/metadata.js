const axios = require('axios');
const ogs = require('open-graph-scraper');

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

// --- ЗОЛОТОЕ ЯБЛОКО (JSON API) ---
async function parseGoldApple(url) {
  try {
    const slug = url.split('/').pop().split('?')[0];
    const apiUrl = `https://goldapple.by/it_api/v1/catalog/product/by-url?url=${slug}`;

    console.log('🍏 GoldApple API Fetch:', apiUrl);

    const { data } = await axios.get(apiUrl, {
      headers: { 'User-Agent': UA_MOBILE, 'City-Id': '0c5b247b-624a-4d2d-8ab0-51975a4ce60c' },
      timeout: 5000
    });

    const product = data.data;
    return {
      title: `${product.attributes.brand} - ${product.name}`,
      image: product.image_url || product.media[0]?.url,
      url: url
    };
  } catch (e) {
    console.error('❌ GoldApple API Error:', e.message);
    return null;
  }
}

// --- OZON (JSON API / Mobile Preview) ---
async function parseOzon(url) {
  try {
    // Вырезаем путь для API
    const path = new URL(url).pathname;
    const apiUrl = `https://www.ozon.by/api/composer-api.bx/page/json/v2?url=${path}`;

    console.log('🔵 Ozon API Fetch:', apiUrl);

    const { data } = await axios.get(apiUrl, {
      headers: {
        'User-Agent': UA_MOBILE,
        'Accept': 'application/json',
        'X-O3-App-Name': 'mobileapp_android'
      },
      timeout: 5000
    });

    // Ozon отдает огромный JSON, ищем блок с данными о товаре (обычно в seo или в виджетах)
    const seoData = data.seo?.script?.[0]?.innerHTML;
    if (seoData) {
      const json = JSON.parse(seoData);
      return {
        title: json.name,
        image: json.image,
        url: url
      };
    }

    // Fallback: ищем в заголовках страницы (иногда Ozon пускает с UA_MOBILE)
    const title = data.seo?.title || 'Товар Ozon';
    return { title, image: '', url };
  } catch (e) {
    console.error('❌ Ozon API Error:', e.message);
    return null;
  }
}

// --- WILDBERRIES (Уже на API) ---
function getWbHost(vol) {
  const v = Math.floor(vol);
  if (v >= 0 && v <= 143) return '01';
  if (v >= 144 && v <= 287) return '02';
  if (v >= 288 && v <= 431) return '03';
  if (v >= 432 && v <= 719) return '04';
  if (v >= 720 && v <= 1007) return '05';
  if (v >= 1008 && v <= 1061) return '06';
  if (v >= 1062 && v <= 1115) return '07';
  if (v >= 1116 && v <= 1169) return '08';
  if (v >= 1170 && v <= 1313) return '09';
  if (v >= 1314 && v <= 1601) return '10';
  if (v >= 1602 && v <= 1655) return '11';
  if (v >= 1656 && v <= 1919) return '12';
  if (v >= 1920 && v <= 2045) return '13';
  if (v >= 2046 && v <= 2189) return '14';
  if (v >= 2190 && v <= 2405) return '15';
  if (v >= 2406 && v <= 2621) return '16';
  if (v >= 2622 && v <= 2837) return '17';
  if (v >= 2838 && v <= 3053) return '18';
  if (v >= 3054 && v <= 3269) return '19';
  if (v >= 3270 && v <= 3485) return '20';
  return '21';
}

async function parseWildberries(url) {
  try {
    const id = url.match(/catalog\/(\d+)/)?.[1];
    if (!id) return null;
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);
    const host = getWbHost(vol);
    const cardUrl = `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/info/ru/card.json`;

    const { data } = await axios.get(cardUrl, { timeout: 3000 });
    return {
      title: data.imt_name || data.subj_name,
      image: `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/images/big/1.webp`,
      url: url
    };
  } catch (e) { return null; }
}

// --- УТИЛИТЫ ---
function getTitleFromUrl(url) {
  try {
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop();
    return slug.replace(/[-_]/g, ' ').replace(/\d+/g, '').trim() || 'Товар';
  } catch (e) { return 'Товар по ссылке'; }
}

// --- ГЛАВНЫЙ ЭКСПОРТ ---
async function extractMeta(url, msgObject = null, telegramInstance = null) {
  console.log('🔍 Starting expert parsing for:', url);

  let result = null;

  // 1. Попытка через специализированные API
  if (url.includes('goldapple')) result = await parseGoldApple(url);
  else if (url.includes('ozon')) result = await parseOzon(url);
  else if (url.includes('wildberries') || url.includes('wb.ru')) result = await parseWildberries(url);

  if (result && result.title) return result;

  // 2. Если спец. парсеры не сработали, пробуем Telegram Preview
  if (msgObject?.web_page) {
    console.log('📲 Fallback: Using Telegram WebPage object');
    const wp = msgObject.web_page;
    let img = result?.image || ''; // Сохраняем картинку от API, если была

    if (!img && wp.photo) {
      try {
        const fileId = wp.photo[wp.photo.length - 1].file_id;
        const link = await telegramInstance.getFileLink(fileId);
        img = link.href;
      } catch (e) { }
    }

    return {
      title: wp.title || wp.description || getTitleFromUrl(url),
      image: img,
      url: url
    };
  }

  // 3. Последний шанс: OGS (для обычных сайтов)
  try {
    const { result: og } = await ogs({ url, timeout: 3000 });
    return {
      title: og.ogTitle || getTitleFromUrl(url),
      image: og.ogImage?.[0]?.url || '',
      url: url
    };
  } catch (e) {
    return { title: getTitleFromUrl(url), image: '', url };
  }
}

module.exports = { extractMeta };