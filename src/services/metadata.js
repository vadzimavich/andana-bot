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
  return '21';
}

async function parseWildberries(url) {
  try {
    const match = url.match(/catalog\/(\d+)/);
    if (!match) return null;
    const id = parseInt(match[1]);

    // 1. Картинка (Математика)
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);
    const host = getWbHost(vol);
    const imageUrl = `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/images/big/1.webp`;

    // 2. Название (Пробуем разные API)
    let title = null;
    const endpoints = [
      `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`,
      `https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`,
      `https://wbx-content-v2.wbstatic.net/ru/${id}.json` // Статический JSON (самый надежный)
    ];

    for (const api of endpoints) {
      try {
        const { data } = await axios.get(api, { timeout: 2000 });
        if (data?.data?.products?.[0]?.name) {
          title = data.data.products[0].name;
          break;
        }
        if (data?.subj_name || data?.imt_name) { // Для static JSON
          title = data.imt_name || data.subj_name;
          break;
        }
      } catch (e) { }
    }

    return {
      title: title || `Товар WB (Арт: ${id})`,
      image: imageUrl,
      url
    };
  } catch (e) {
    return null;
  }
}

// --- ПАРСИНГ ИЗ TELEGRAM PREVIEW ---
async function extractFromTelegram(ctx) {
  const webPage = ctx.message.web_page;
  if (!webPage) return null;

  console.log('📲 Using Telegram WebPage Preview');

  let imageUrl = null;
  // Если у превью есть фото, получаем его URL
  if (webPage.photo) {
    try {
      // Берем самый большой размер
      const fileId = webPage.photo[webPage.photo.length - 1].file_id;
      const link = await ctx.telegram.getFileLink(fileId);
      imageUrl = link.href;
    } catch (e) {
      console.error('TG Photo Error:', e.message);
    }
  }

  return {
    title: webPage.title || webPage.site_name || 'Товар',
    image: imageUrl, // Может быть null, тогда подставится заглушка позже
    url: webPage.url
  };
}

// --- FALLBACK ИЗ URL ---
function getTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const parts = path.split('/').filter(p => p);
    // Берем последний сегмент, если он длинный, иначе предпоследний
    let slug = parts[parts.length - 1];
    if (!slug || slug.length < 4) slug = parts[parts.length - 2];

    if (!slug) return 'Товар по ссылке';

    // Убираем ID, расширения и мусор
    slug = slug.split('.')[0] // убрать .html
      .replace(/\d{5,}/g, '') // убрать длинные цифры
      .replace(/[-_]/g, ' ') // заменить дефисы на пробелы
      .trim();

    // Делаем первую букву заглавной
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  } catch (e) {
    return 'Ссылка';
  }
}

// --- ГЛАВНАЯ ФУНКЦИЯ ---
async function extractMeta(url, ctx) {
  console.log('📥 Parsing:', url);

  // 1. ПРИОРИТЕТ: Данные от Telegram (если есть превью)
  // Это спасет Ozon и GoldApple
  if (ctx && ctx.message && ctx.message.web_page) {
    const tgData = await extractFromTelegram(ctx);
    if (tgData && tgData.title) {
      return {
        title: tgData.title,
        image: tgData.image || 'https://via.placeholder.com/400x400?text=No+Image',
        url: url
      };
    }
  }

  // 2. WILDBERRIES (Спец. парсер)
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    const wbData = await parseWildberries(url);
    if (wbData) return wbData;
  }

  // 3. OGS (Для AliExpress, Lamoda и остальных)
  try {
    const options = {
      url: url,
      timeout: 10000,
      fetchOptions: { headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' } }
    };
    const { result } = await ogs(options);

    let title = result.ogTitle || result.twitterTitle;
    // Проверка на защиту
    if (title && (title.includes('checking') || title.includes('Access Denied'))) throw new Error('Bot protection');

    return {
      title: title || getTitleFromUrl(url),
      image: result.ogImage?.[0]?.url || result.ogImage?.url || 'https://via.placeholder.com/150?text=No+Image',
      url: url
    };

  } catch (e) {
    console.error('❌ Meta Error:', e.message);
    // 4. ПОЛНЫЙ FALLBACK
    return {
      title: getTitleFromUrl(url),
      image: 'https://via.placeholder.com/150?text=Link',
      url: url
    };
  }
}

module.exports = { extractMeta };