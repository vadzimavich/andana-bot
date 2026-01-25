const axios = require('axios');
const config = require('../config');

// Хелпер для очистки JSON, если прокси вернул его внутри HTML (бывает при render=true)
function cleanJson(rawData) {
  if (typeof rawData === 'object') return rawData;
  try {
    // Ищем что-то похожее на JSON внутри строки
    const match = rawData.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    return null;
  }
}

function getProxyUrl(targetUrl, options = {}) {
  if (!config.SCRAPER_API_KEY) return targetUrl;
  const params = new URLSearchParams({
    api_key: config.SCRAPER_API_KEY,
    url: targetUrl,
  });
  if (options.premium) params.append('premium', 'true');
  if (options.render) params.append('render', 'true');
  return `http://api.scraperapi.com?${params.toString()}`;
}

async function parseGoldApple(url) {
  try {
    const slug = url.split('/').pop().split('?')[0];
    const apiUrl = `https://goldapple.by/it_api/v1/catalog/product/by-url?url=${slug}`;
    console.log('🍏 GoldApple: Fetching with JS Rendering...');

    // Включаем render: true, чтобы пройти "checking device"
    const { data: rawData } = await axios.get(getProxyUrl(apiUrl, { premium: true, render: true }), { timeout: 45000 });

    const data = cleanJson(rawData);
    if (!data || !data.data) throw new Error('Could not parse GoldApple JSON');

    const product = data.data;
    return {
      title: `${product.attributes?.brand || ''} - ${product.name}`,
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
    console.log('🔵 Ozon: Fetching with JS Rendering...');

    // render: true поможет пройти редиректы и подгрузить данные
    const { data: rawData } = await axios.get(getProxyUrl(apiUrl, { premium: true, render: true }), { timeout: 45000 });

    const data = cleanJson(rawData);
    if (!data || !data.widgetStates) {
      // Если API не отдало widgetStates, попробуем вытащить из SEO (план Б)
      if (data?.seo?.title) return { title: data.seo.title, image: '', url };
      throw new Error('Ozon JSON structure unknown');
    }

    const states = data.widgetStates;
    const headingKey = Object.keys(states).find(k => k.includes('webProductHeading'));
    const galleryKey = Object.keys(states).find(k => k.includes('webGallery'));

    const title = headingKey ? JSON.parse(states[headingKey]).title : 'Товар Ozon';
    const image = galleryKey ? JSON.parse(states[galleryKey]).coverImage : '';

    return { title, image, url };
  } catch (e) {
    console.error('❌ Ozon Error:', e.message);
    return null;
  }
}

async function parseWildberries(url) {
  try {
    const id = url.match(/catalog\/(\d+)/)?.[1];
    if (!id) return null;
    // WB обычно не требует прокси для своего API
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

  if (result && result.title) return result;

  // Fallback на Telegram Preview
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