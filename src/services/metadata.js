const ogs = require('open-graph-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

// User-Agent'ы Telegram ботов
const TELEGRAM_UA = 'TelegramBot (like TwitterBot)';
const TELEGRAM_UA_ALT = 'Mozilla/5.0 (compatible; TelegramBot/1.0; +https://telegram.org/bot)';

const parsers = {
  wildberries: async (url) => {
    try {
      const articleMatch = url.match(/catalog\/(\d+)/);
      if (!articleMatch) return null;

      const article = articleMatch[1];
      console.log('WB: Артикул', article);

      // Притворяемся Telegram Preview Bot
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': TELEGRAM_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      const $ = cheerio.load(data);

      let title = $('meta[property="og:title"]').attr('content') ||
        $('meta[name="title"]').attr('content');

      let imageUrl = $('meta[property="og:image"]').attr('content');

      console.log('WB: Title:', title);
      console.log('WB: Image:', imageUrl);

      if (title) {
        return {
          title: title.substring(0, 150),
          image: imageUrl || 'https://via.placeholder.com/400',
          url: url
        };
      }
    } catch (e) {
      console.error('WB Parser Error:', e.response?.status || e.message);
    }
    return null;
  },

  ozon: async (url) => {
    try {
      console.log('Ozon: Parsing', url);

      // Притворяемся Telegram Preview Bot
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': TELEGRAM_UA,
          'Accept': 'text/html'
        },
        maxRedirects: 10,
        timeout: 15000
      });

      const $ = cheerio.load(data);

      let title = $('meta[property="og:title"]').attr('content');
      let imageUrl = $('meta[property="og:image"]').attr('content');

      // Fallback на JSON-LD
      if (!title || !imageUrl) {
        $('script[type="application/ld+json"]').each((i, elem) => {
          try {
            const json = JSON.parse($(elem).html());
            if (json['@type'] === 'Product') {
              if (!title) title = json.name;
              if (!imageUrl) imageUrl = Array.isArray(json.image) ? json.image[0] : json.image;
            }
          } catch (e) { }
        });
      }

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
      console.error('Ozon Parser Error:', e.response?.status || e.message);
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
      console.log('⚠️ WB failed');
    }

    // Ozon
    if (url.includes('ozon.')) {
      console.log('🛍 Detected: Ozon');
      const ozonData = await parsers.ozon(url);
      if (ozonData) {
        console.log('✅ Ozon Success');
        return ozonData;
      }
      console.log('⚠️ Ozon failed');
    }

    // Универсальный парсер (AliExpress и др.)
    console.log('🔄 Using Open Graph Scraper');
    const options = {
      url: url,
      timeout: 15000,
      fetchOptions: {
        headers: {
          'User-Agent': TELEGRAM_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
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

    console.log('✅ OGS Success');
    return {
      title: title,
      image: imageUrl,
      url: url
    };

  } catch (e) {
    console.error('❌ Fatal Error:', e.message);

    return {
      title: 'Товар (не удалось получить данные)',
      image: 'https://via.placeholder.com/400x400/ffcccc/cc0000?text=Ошибка',
      url: url
    };
  }
}

module.exports = { extractMeta };