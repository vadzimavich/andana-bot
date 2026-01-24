const ogs = require('open-graph-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

const TELEGRAM_UA = 'TelegramBot (like TwitterBot)';

const parsers = {
  wildberries: async (url) => {
    try {
      const articleMatch = url.match(/catalog\/(\d+)/);
      if (!articleMatch) return null;

      const article = articleMatch[1];
      console.log('WB: Артикул', article);

      // Попробуем разные User-Agent'ы
      const userAgents = [
        TELEGRAM_UA,
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        'Twitterbot/1.0'
      ];

      for (const ua of userAgents) {
        try {
          const { data } = await axios.get(url, {
            headers: {
              'User-Agent': ua,
              'Accept': 'text/html'
            },
            timeout: 8000
          });

          const $ = cheerio.load(data);
          const title = $('meta[property="og:title"]').attr('content');
          const imageUrl = $('meta[property="og:image"]').attr('content');

          if (title) {
            console.log('WB: Success with', ua.split('/')[0]);
            return {
              title: title.substring(0, 150),
              image: imageUrl || 'https://via.placeholder.com/400',
              url: url
            };
          }
        } catch (e) {
          console.log('WB: Failed with', ua.split('/')[0], '-', e.response?.status || e.message);
          continue;
        }
      }
    } catch (e) {
      console.error('WB Parser Error:', e.message);
    }
    return null;
  },

  ozon: async (url) => {
    try {
      console.log('Ozon: Parsing', url);

      // НЕ следуем редиректам - парсим короткую ссылку напрямую
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': TELEGRAM_UA,
          'Accept': 'text/html'
        },
        maxRedirects: 0, // ВАЖНО: не следуем редиректам!
        validateStatus: (status) => status < 400 || status === 301 || status === 302,
        timeout: 10000
      });

      const $ = cheerio.load(data);

      let title = $('meta[property="og:title"]').attr('content');
      let imageUrl = $('meta[property="og:image"]').attr('content');

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
      // Если произошёл редирект, попробуем получить финальный URL
      if (e.response?.status === 301 || e.response?.status === 302) {
        const finalUrl = e.response.headers.location;
        console.log('Ozon: Redirect to', finalUrl);

        try {
          const { data } = await axios.get(finalUrl, {
            headers: { 'User-Agent': TELEGRAM_UA },
            timeout: 10000
          });

          const $ = cheerio.load(data);
          const title = $('meta[property="og:title"]').attr('content');
          const imageUrl = $('meta[property="og:image"]').attr('content');

          if (title) {
            return {
              title: title.substring(0, 150),
              image: imageUrl || 'https://via.placeholder.com/400',
              url: url
            };
          }
        } catch (err) {
          console.error('Ozon Redirect Error:', err.message);
        }
      } else {
        console.error('Ozon Parser Error:', e.message);
      }
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