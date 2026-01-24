const ogs = require('open-graph-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

const parsers = {
  wildberries: async (url) => {
    try {
      // Извлекаем артикул
      const articleMatch = url.match(/catalog\/(\d+)/);
      if (!articleMatch) {
        console.log('WB: Артикул не найден');
        return null;
      }

      const article = articleMatch[1];
      console.log('WB: Артикул', article);

      // Пробуем парсить HTML напрямую (API не работает)
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        },
        timeout: 10000
      });

      const $ = cheerio.load(data);

      // Ищем данные в HTML
      let title = $('h1[class*="product-page__title"]').text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('h1').first().text().trim();

      let imageUrl = $('meta[property="og:image"]').attr('content') ||
        $('img[class*="product-page__img"]').first().attr('src');

      console.log('WB HTML: Title:', title);
      console.log('WB HTML: Image:', imageUrl);

      if (title) {
        return {
          title: title.substring(0, 150),
          image: imageUrl || 'https://via.placeholder.com/400',
          url: url
        };
      }
    } catch (e) {
      console.error('WB Parser Error:', e.message);
    }
    return null;
  },

  ozon: async (url) => {
    try {
      console.log('Ozon: Parsing', url);

      // Для коротких ссылок НЕ разворачиваем, а просто парсим напрямую
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        },
        maxRedirects: 10, // Разрешаем больше редиректов
        timeout: 15000
      });

      const $ = cheerio.load(data);

      let title = null;
      let imageUrl = null;

      // 1. Ищем JSON-LD
      $('script[type="application/ld+json"]').each((i, elem) => {
        try {
          const json = JSON.parse($(elem).html());
          if (json['@type'] === 'Product' || json.name) {
            title = json.name;
            imageUrl = Array.isArray(json.image) ? json.image[0] : json.image;
          }
        } catch (e) { }
      });

      // 2. Open Graph
      if (!title) title = $('meta[property="og:title"]').attr('content');
      if (!imageUrl) imageUrl = $('meta[property="og:image"]').attr('content');

      // 3. H1
      if (!title) title = $('h1').first().text().trim();

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
      console.error('Ozon Parser Error:', e.message);
    }
    return null;
  }
};

async function extractMeta(url) {
  try {
    console.log('📥 Extracting meta from:', url);

    // WildBerries - парсим HTML
    if (url.includes('wildberries') || url.includes('wb.ru')) {
      console.log('🛍 Detected: Wildberries');
      const wbData = await parsers.wildberries(url);
      if (wbData) {
        console.log('✅ WB Success');
        return wbData;
      }
      console.log('⚠️ WB failed');
    }

    // Ozon - парсим HTML с редиректами
    if (url.includes('ozon.')) {
      console.log('🛍 Detected: Ozon');
      const ozonData = await parsers.ozon(url);
      if (ozonData) {
        console.log('✅ Ozon Success');
        return ozonData;
      }
      console.log('⚠️ Ozon failed');
    }

    // Для всех остальных (включая AliExpress) - используем OGS как раньше
    console.log('🔄 Using Open Graph Scraper');
    const options = {
      url: url,
      timeout: 15000,
      fetchOptions: {
        headers: {
          'User-Agent': 'TelegramBot (like TwitterBot)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9'
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