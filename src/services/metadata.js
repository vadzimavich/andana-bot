const ogs = require('open-graph-scraper');
const axios = require('axios');

// --- ХЕЛПЕРЫ ДЛЯ WILDBERRIES ---
function getWbHost(vol) {
  if (vol >= 0 && vol <= 143) return '01';
  if (vol >= 144 && vol <= 287) return '02';
  if (vol >= 288 && vol <= 431) return '03';
  if (vol >= 432 && vol <= 719) return '04';
  if (vol >= 720 && vol <= 1007) return '05';
  if (vol >= 1008 && vol <= 1061) return '06';
  if (vol >= 1062 && vol <= 1115) return '07';
  if (vol >= 1116 && vol <= 1169) return '08';
  if (vol >= 1170 && vol <= 1313) return '09';
  if (vol >= 1314 && vol <= 1601) return '10';
  if (vol >= 1602 && vol <= 1655) return '11';
  if (vol >= 1656 && vol <= 1919) return '12';
  if (vol >= 1920 && vol <= 2045) return '13';
  if (vol >= 2046 && vol <= 2189) return '14';
  if (vol >= 2190 && vol <= 2405) return '15';
  if (vol >= 2406 && vol <= 2621) return '16';
  if (vol >= 2622 && vol <= 2837) return '17';
  if (vol >= 2838 && vol <= 3053) return '18';
  if (vol >= 3054 && vol <= 3269) return '19';
  if (vol >= 3270 && vol <= 3485) return '20';
  return '21'; // Новые сервера
}

async function parseWildberries(url) {
  try {
    const match = url.match(/catalog\/(\d+)/);
    if (!match) return null;
    const id = parseInt(match[1]);

    // 1. Вычисляем картинку (работает всегда, даже без API)
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);
    const host = getWbHost(vol);
    const imageUrl = `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/images/big/1.webp`;

    // 2. Пробуем API (но если упадет - не страшно, картинка уже есть)
    let title = `Товар WB (Арт: ${id})`;
    try {
      const apiUrl = `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`;
      const { data } = await axios.get(apiUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 3000
      });
      if (data?.data?.products?.[0]) {
        title = data.data.products[0].name;
      }
    } catch (e) {
      console.log('WB API Failed, using ID as title');
    }

    return { title, image: imageUrl, url };
  } catch (e) {
    return null;
  }
}

// Попытка вытащить название из URL (для Ozon/GoldApple)
function getTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    // Берем последнюю часть пути
    const parts = path.split('/').filter(p => p);
    let slug = parts[parts.length - 1] || parts[parts.length - 2];

    // Убираем ID и мусор
    slug = slug.replace(/\d+/g, '').replace(/-/g, ' ').replace(/_/g, ' ').trim();

    if (slug.length > 3) return slug.charAt(0).toUpperCase() + slug.slice(1);
    return 'Товар по ссылке';
  } catch (e) {
    return 'Ссылка';
  }
}

async function extractMeta(url) {
  console.log('📥 Parsing:', url);

  // 1. WILDBERRIES
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    const wbData = await parseWildberries(url);
    if (wbData) return wbData;
  }

  // 2. ОСТАЛЬНЫЕ (OGS)
  try {
    const options = {
      url: url,
      timeout: 8000, // Меньше таймаут, чтобы быстрее падать на фолбек
      fetchOptions: {
        headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' }
      }
    };
    const { result } = await ogs(options);

    // Проверка на "плохие" заголовки (защита от ботов)
    let title = result.ogTitle || result.twitterTitle;
    if (title && (title.includes('checking') || title.includes('Access Denied') || title.includes('Just a moment'))) {
      throw new Error('Bot protection detected');
    }

    return {
      title: title || getTitleFromUrl(url),
      image: result.ogImage?.[0]?.url || result.ogImage?.url || 'https://via.placeholder.com/150?text=No+Image',
      url: url
    };

  } catch (e) {
    console.error('❌ Meta Error:', e.message);
    // 3. FALLBACK (Если всё упало - берем название из URL)
    return {
      title: getTitleFromUrl(url),
      image: 'https://via.placeholder.com/150?text=Link',
      url: url
    };
  }
}

module.exports = { extractMeta };