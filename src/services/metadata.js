const ogs = require('open-graph-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

// Специфичные парсеры для маркетплейсов
const parsers = {
  wildberries: async (url) => {
    try {
      const articleMatch = url.match(/catalog\/(\d+)/);
      if (!articleMatch) return null;

      const article = articleMatch[1];
      const apiUrl = `https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${article}`;

      const { data } = await axios.get(apiUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      if (data?.data?.products?.[0]) {
        const product = data.data.products[0];
        const vol = Math.floor(product.id / 100000);
        const part = Math.floor(product.id / 1000);
        const imageUrl = `https://basket-${vol < 144 ? '0' + vol : vol}.wbbasket.ru/vol${vol}/part${part}/${product.id}/images/big/1.webp`;

        return {
          title: product.name,
          image: imageUrl,
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
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(data);

      // Ozon использует JSON-LD
      const jsonLd = $('script[type="application/ld+json"]').first().html();
      if (jsonLd) {
        const data = JSON.parse(jsonLd);
        if (data.name && data.image) {
          return {
            title: data.name,
            image: Array.isArray(data.image) ? data.image[0] : data.image,
            url: url
          };
        }
      }
    } catch (e) {
      console.error('Ozon Parser Error:', e.message);
    }
    return null;
  }
};

async function extractMeta(url) {
  try {
    // Определяем маркетплейс
    if (url.includes('wildberries.ru') || url.includes('wb.ru')) {
      const wbData = await parsers.wildberries(url);
      if (wbData) return wbData;
    }

    if (url.includes('ozon.ru')) {
      const ozonData = await parsers.ozon(url);
      if (ozonData) return ozonData;
    }

    // Фоллбэк: Open Graph (работает для AliExpress, 21vek и др.)
    const options = {
      url: url,
      timeout: 15000,
      fetchOptions: {
        headers: {
          'User-Agent': 'TelegramBot (like TwitterBot)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
        }
      }
    };

    const { result } = await ogs(options);

    let imageUrl = 'https://via.placeholder.com/400x400/cccccc/666666?text=No+Image';
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

    return {
      title: title,
      image: imageUrl,
      url: url
    };

  } catch (e) {
    console.error('Meta Parser Error:', e.message);

    // Последний фоллбэк - возвращаем хоть что-то
    return {
      title: 'Товар (описание недоступно)',
      image: 'https://via.placeholder.com/400x400/e0e0e0/999999?text=Error',
      url: url
    };
  }
}

module.exports = { extractMeta };