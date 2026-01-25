const ogs = require('open-graph-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

const TELEGRAM_UA = 'TelegramBot (like TwitterBot)';

// Retry с задержкой
async function retryRequest(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

const parsers = {
  wildberries: async (url) => {
    try {
      const articleMatch = url.match(/catalog\/(\d+)/);
      if (!articleMatch) return null;

      const article = articleMatch[1];
      console.log('WB: Артикул', article);

      // Пробуем несколько API эндпоинтов
      const endpoints = [
        `https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${article}`,
        `https://card.wb.ru/cards/detail?appType=1&curr=rub&dest=-1257786&nm=${article}`,
        `https://wbx-content-v2.wbstatic.net/price/${article}.json`
      ];

      for (const apiUrl of endpoints) {
        try {
          const { data } = await retryRequest(() => axios.get(apiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': '*/*'
            },
            timeout: 8000
          }));

          const product = data?.data?.products?.[0] || data;

          if (product?.name || product?.title) {
            const vol = Math.floor(product.id / 100000);
            const part = Math.floor(product.id / 1000);
            const imageUrl = `https://basket-${vol.toString().padStart(2, '0')}.wbbasket.ru/vol${vol}/part${part}/${product.id}/images/big/1.webp`;

            return {
              title: (product.name || product.title).substring(0, 150),
              image: imageUrl,
              url: url
            };
          }
        } catch (e) {
          console.log('WB API failed:', apiUrl.split('/')[3], e.response?.status || e.message);
          continue;
        }
      }

      // Последняя попытка - парсим HTML напрямую
      console.log('WB: Trying HTML parsing');
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        },
        timeout: 10000
      });

      const $ = cheerio.load(data);
      const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content');
      const image = $('meta[property="og:image"]').attr('content');

      if (title) {
        return {
          title: title.substring(0, 150),
          image: image || 'https://via.placeholder.com/400',
          url: url
        };
      }
    } catch (e) {
      console.error('WB Error:', e.response?.status || e.message);
    }
    return null;
  },

  ozon: async (url) => {
    try {
      console.log('Ozon: Parsing', url);

      // Если короткая ссылка - пробуем развернуть
      let finalUrl = url;
      if (url.includes('/t/')) {
        try {
          const response = await axios.get(url, {
            maxRedirects: 0,
            validateStatus: () => true,
            timeout: 3000
          });

          const location = response.headers.location;
          if (location && !location.includes('?__rr=')) {
            finalUrl = location.startsWith('http') ? location : 'https://ozon.by' + location;
            console.log('Ozon: Redirected to', finalUrl);
          }
        } catch (e) {
          // Игнорируем ошибки редиректа
        }
      }

      // Парсим с увеличенным таймаутом и retry
      const { data } = await retryRequest(() => axios.get(finalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'ru-RU,ru;q=0.9',
          'Cache-Control': 'no-cache'
        },
        timeout: 25000 // Увеличенный таймаут
      }), 2, 2000);

      const $ = cheerio.load(data);

      let title = null;
      let imageUrl = null;

      // Ищем везде
      title = $('h1').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().split('—')[0].trim();

      imageUrl = $('meta[property="og:image"]').attr('content') ||
        $('img[class*="detail"]').first().attr('src');

      // JSON-LD
      $('script[type="application/ld+json"]').each((i, elem) => {
        try {
          const json = JSON.parse($(elem).html());
          if (json['@type'] === 'Product') {
            if (!title) title = json.name;
            if (!imageUrl) imageUrl = Array.isArray(json.image) ? json.image[0] : json.image;
          }
        } catch (e) { }
      });

      console.log('Ozon: Title:', title);
      console.log('Ozon: Image:', imageUrl);

      if (title) {
        return {
          title: title.substring(0, 150),
          image: imageUrl || 'https://via.placeholder.com/400',
          url: url
        };
      }
    } catch (e) {
      console.error('Ozon Error:', e.message);
    }
    return null;
  }
};

async function extractMeta(url) {
  try {
    console.log('📥 Extracting meta from:', url);

    // WildBerries
    if (url.includes('wildberries') || url.includes('wb.ru')) {
      console.log('🛍 Detected: Wildberries');
      const wbData = await parsers.wildberries(url);
      if (wbData) {
        console.log('✅ WB Success');
        return wbData;
      }
      console.log('⚠️ WB failed completely');
    }

    // Ozon
    if (url.includes('ozon.')) {
      console.log('🛍 Detected: Ozon');
      const ozonData = await parsers.ozon(url);
      if (ozonData) {
        console.log('✅ Ozon Success');
        return ozonData;
      }
      console.log('⚠️ Ozon failed completely');
    }

    // Универсальный парсер
    console.log('🔄 Using Open Graph Scraper');
    const options = {
      url: url,
      timeout: 20000,
      fetchOptions: {
        headers: {
          'User-Agent': TELEGRAM_UA,
          'Accept': 'text/html'
        }
      }
    };

    const { result } = await ogs(options);

    let imageUrl = 'https://via.placeholder.com/400x400/e8e8e8/888888?text=Товар';
    if (result.ogImage) {
      if (Array.isArray(result.ogImage)) {
        imageUrl = result.ogImage[0]?.url || imageUrl;
      } else if (result.ogImage.url) {
        imageUrl = result.ogImage.url;
      }
    }

    let title = result.ogTitle || result.ogDescription || 'Товар';
    title = title
      .replace(/Купить | в интернет-магазине .*/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 150);

    console.log('✅ Success');
    return {
      title: title,
      image: imageUrl,
      url: url
    };

  } catch (e) {
    console.error('❌ Error:', e.message);
    throw new Error('Не удалось распарсить ссылку');
  }
}

module.exports = { extractMeta };