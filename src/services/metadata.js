const ogs = require('open-graph-scraper');
const axios = require('axios');

// WB (Без изменений)
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
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);
    const host = getWbHost(vol);
    const imageUrl = `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/images/big/1.webp`;
    const cardInfoUrl = `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/info/ru/card.json`;
    let title = null;
    try {
      const { data } = await axios.get(cardInfoUrl, { timeout: 1500 });
      title = data.imt_name || data.subj_name;
    } catch (e) { }
    return { title: title || `Товар WB (Арт: ${id})`, image: imageUrl, url };
  } catch (e) { return null; }
}

async function extractFromTelegram(msg, telegramInstance) {
  const webPage = msg?.web_page;
  if (!webPage) return null;

  console.log('📲 Using Telegram WebPage Preview. Site:', webPage.site_name);

  let imageUrl = null;
  // Проверяем, есть ли telegramInstance и фото
  if (webPage.photo && telegramInstance) {
    try {
      // Берем последнее фото (наилучшее качество)
      const photoObj = webPage.photo[webPage.photo.length - 1];
      if (photoObj && photoObj.file_id) {
        const link = await telegramInstance.getFileLink(photoObj.file_id);
        imageUrl = link.href;
      }
    } catch (e) {
      console.error('TG Photo Error (Non-fatal):', e.message);
      // Не прерываем выполнение, просто останемся без картинки
    }
  }

  return {
    title: webPage.title || webPage.description || webPage.site_name || 'Товар',
    image: imageUrl, // Может быть null, и это ОК
    url: webPage.url
  };
}

function getTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const parts = path.split('/').filter(p => p);
    let slug = parts[parts.length - 1] || 'link';
    slug = slug.split('.')[0].replace(/\d{5,}/g, '').replace(/[-_]/g, ' ').trim();
    return slug.charAt(0).toUpperCase() + slug.slice(1) || 'Товар по ссылке';
  } catch (e) { return 'Ссылка'; }
}

async function extractMeta(url, msgObject = null, telegramInstance = null) {
  console.log('📥 Parsing:', url);

  // 1. WB
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    const wbData = await parseWildberries(url);
    if (wbData && wbData.title) return wbData;
  }

  // 2. TELEGRAM PREVIEW
  if (msgObject) {
    const tgData = await extractFromTelegram(msgObject, telegramInstance);
    // Принимаем данные, если есть ХОТЯ БЫ ЗАГОЛОВОК
    if (tgData && tgData.title) {
      return {
        title: tgData.title,
        image: tgData.image || 'https://via.placeholder.com/400x400?text=No+Preview',
        url: url
      };
    }
  }

  // 3. OGS (Fallback)
  try {
    const options = {
      url: url,
      timeout: 5000,
      fetchOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } }
    };
    const { result } = await ogs(options);
    if (result.ogTitle && (result.ogTitle.includes('Access Denied') || result.ogTitle.includes('Captcha'))) {
      throw new Error('Bot protection detected');
    }
    return {
      title: result.ogTitle || result.twitterTitle || getTitleFromUrl(url),
      image: result.ogImage?.[0]?.url || result.ogImage?.url || 'https://via.placeholder.com/150?text=Link',
      url: url
    };
  } catch (e) {
    console.error('❌ Meta Error (Fallback):', e.message);
    return {
      title: getTitleFromUrl(url),
      image: 'https://via.placeholder.com/150?text=Link',
      url: url
    };
  }
}

module.exports = { extractMeta };