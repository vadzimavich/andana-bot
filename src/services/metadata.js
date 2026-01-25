const axios = require('axios');
const cheerio = require('cheerio');

// Имитируем бота Telegram — им Ozon обычно разрешает смотреть страницы
const TG_UA = 'Mozilla/5.0 (compatible; TelegramBot/1.0; +https://core.telegram.org/bots/webpages)';

async function extractMeta(url, msgObject = null, telegramInstance = null) {
  console.log('🔍 Parsing:', url);

  // 1. ПРИОРИТЕТ: Данные из Telegram (теперь они придут через форвард)
  if (msgObject?.web_page) {
    const wp = msgObject.web_page;
    console.log('✅ Using Telegram WebPage object');

    let img = '';
    if (wp.photo && telegramInstance) {
      try {
        const photoObj = wp.photo[wp.photo.length - 1];
        const link = await telegramInstance.getFileLink(photoObj.file_id);
        img = link.href;
      } catch (e) { }
    }

    return {
      title: wp.title || wp.description || 'Товар',
      image: img,
      url: url
    };
  }

  // 2. СПЕЦ-ПАРСЕР WB (он работает без прокси через API)
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    try {
      const id = url.match(/catalog\/(\d+)/)?.[1];
      const { data } = await axios.get(`https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`);
      return {
        title: data.data.products[0].name,
        image: `https://basket-01.wbbasket.ru/vol${Math.floor(id / 100000)}/part${Math.floor(id / 1000)}/${id}/images/big/1.webp`,
        url
      };
    } catch (e) { }
  }

  // 3. ПОСЛЕДНИЙ ШАНС: Прямой запрос с UA Телеграма
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': TG_UA },
      timeout: 10000
    });
    const $ = cheerio.load(html);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const image = $('meta[property="og:image"]').attr('content');

    return {
      title: title ? title.split(' - купить')[0].trim() : 'Товар по ссылке',
      image: image || '',
      url
    };
  } catch (e) {
    // Fallback из URL
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'link';
    return { title: slug.replace(/[-_]/g, ' '), image: '', url };
  }
}

module.exports = { extractMeta };