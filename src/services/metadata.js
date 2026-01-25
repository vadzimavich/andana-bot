const ogs = require('open-graph-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

// Стандартный UA для обычных сайтов (Telegram бот)
const TELEGRAM_UA = 'TelegramBot (like TwitterBot)';
// UA реального браузера для капризных сайтов
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
  return '18'; // Fallback, может меняться
}

async function parseWildberries(url) {
  try {
    const match = url.match(/catalog\/(\d+)/);
    if (!match) return null;
    const id = parseInt(match[1]);

    // 1. Вычисляем URL картинки математически (это работает всегда)
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);
    const host = getWbHost(vol);
    const imageUrl = `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/images/big/1.webp`;

    // 2. Пытаемся получить название через API v2
    const apiUrl = `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`;
    const { data } = await axios.get(apiUrl, { headers: { 'User-Agent': BROWSER_UA } });

    const product = data?.data?.products?.[0];
    const title = product ? product.name : 'Товар Wildberries';

    return { title, image: imageUrl, url };
  } catch (e) {
    console.error('WB Parse Error:', e.message);
    return null;
  }
}

// --- ОБЩИЙ ПАРСЕР ---
async function extractMeta(url) {
  try {
    console.log('📥 Parsing:', url);

    // 1. WILDBERRIES (Спец. обработка)
    if (url.includes('wildberries') || url.includes('wb.ru')) {
      const wbData = await parseWildberries(url);
      if (wbData) return wbData;
    }

    // 2. ОСТАЛЬНЫЕ (OGS)
    // Для Ozon и GoldApple пробуем притвориться браузером, а не ботом
    const isTricky = url.includes('ozon') || url.includes('goldapple');
    const userAgent = isTricky ? BROWSER_UA : TELEGRAM_UA;

    const options = {
      url: url,
      timeout: 15000,
      fetchOptions: { headers: { 'User-Agent': userAgent } }
    };

    const { result } = await ogs(options);

    let title = result.ogTitle || result.twitterTitle || result.title;
    let image = result.ogImage?.[0]?.url || result.ogImage?.url;

    // Фикс для Золотого Яблока (проверка на капчу)
    if (title && (title.includes('checking device') || title.includes('Just a moment'))) {
      // Если попали на капчу, пробуем вытащить название из URL (обычно оно там есть транслитом)
      // Или просто возвращаем заглушку
      return {
        title: 'Товар Gold Apple (защита от ботов)',
        image: 'https://via.placeholder.com/150?text=GoldApple',
        url: url
      };
    }

    // Очистка названия
    if (title) {
      title = title.replace(/Купить | в интернет-магазине .*| на маркетплейсе .*/gi, '').trim();
    }

    return {
      title: title || 'Ссылка',
      image: image || 'https://via.placeholder.com/150?text=No+Image',
      url: url
    };

  } catch (e) {
    // Логируем ошибку, но не крашим бота
    console.error('❌ Meta Error:', e.result?.error || e.message);

    return {
      title: 'Ссылка (не удалось получить данные)',
      image: 'https://via.placeholder.com/150?text=Error',
      url: url
    };
  }
}

module.exports = { extractMeta };