const ogs = require('open-graph-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

const parsers = {
  wildberries: async (url) => {
    try {
      // Поддержка коротких ссылок wb.ru
      let finalUrl = url;
      if (url.includes('wb.ru')) {
        const { request } = await axios.get(url, {
          maxRedirects: 5,
          validateStatus: () => true
        });
        finalUrl = request.res.responseUrl || url;
      }

      const articleMatch = finalUrl.match(/catalog\/(\d+)/);
      if (!articleMatch) {
        console.log('WB: Не найден артикул в URL');
        return null;
      }

      const article = articleMatch[1];
      console.log('WB: Артикул', article);

      // API v2 (более стабильный)
      const apiUrl = `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${article}`;

      const { data } = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      console.log('WB API Response:', data);

      if (data?.data?.products?.[0]) {
        const product = data.data.products[0];

        // Формирование URL картинки (новая схема WB)
        const vol = Math.floor(product.id / 100000);
        const part = Math.floor(product.id / 1000);
        const basket = vol < 144 ? `0${vol}` : vol;
        const imageUrl = `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${product.id}/images/big/1.jpg`;

        return {
          title: product.name,
          image: imageUrl,
          url: url
        };
      }
    } catch (e) {
      console.error('WB Parser Error:', e.message);
      if (e.response) {
        console.error('WB Response:', e.response.status, e.response.data);
      }
    }
    return null;
  },

  ozon: async (url) => {
    try {
      // Ozon.by и Ozon.ru
      console.log('Ozon: Parsing', url);

      // Для коротких ссылок разворачиваем
      let finalUrl = url;
      if (url.includes('/t/')) {
        const { request } = await axios.get(url, {
          maxRedirects: 5,
          validateStatus: () => true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
          }
        });
        finalUrl = request.res.responseUrl || url;
        console.log('Ozon: Развернутый URL', finalUrl);
      }

      const { data } = await axios.get(finalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        timeout: 15000
      });

      const $ = cheerio.load(data);

      // Пробуем разные селекторы
      let title = $('h1').first().text().trim();

      // JSON-LD
      let imageUrl = null;
      $('script[type="application/ld+json"]').each((i, elem) => {
        try {
          const json = JSON.parse($(elem).html());
          if (json.name) title = json.name;
          if (json.image) {
            imageUrl = Array.isArray(json.image) ? json.image[0] : json.image;
          }
        } catch (e) { }
      });

      // Если не нашли через JSON-LD
      if (!imageUrl) {
        imageUrl = $('img[src*="cdn1.ozone"]').first().attr('src') ||
          $('meta[property="og:image"]').attr('content');
      }

      console.log('Ozon: Title:', title);
      console.log('Ozon: Image:', imageUrl);

      if (title && imageUrl) {
        return {
          title: title.substring(0, 150),
          image: imageUrl,
          url: url
        };
      }
    } catch (e) {
      console.error('Ozon Parser Error:', e.message);
      if (e.response) {
        console.error('Ozon Response:', e.response.status);
      }
    }
    return null;
  }
};

async function extractMeta(url) {
  try {
    console.log('📥 Extracting meta from:', url);

    // Определяем маркетплейс
    if (url.includes('wildberries') || url.includes('wb.ru')) {
      console.log('🛍 Detected: Wildberries');
      const wbData = await parsers.wildberries(url);
      if (wbData) {
        console.log('✅ WB Success:', wbData.title);
        return wbData;
      }
      console.log('⚠️ WB Parser failed, trying fallback');
    }

    if (url.includes('ozon.')) {
      console.log('🛍 Detected: Ozon');
      const ozonData = await parsers.ozon(url);
      if (ozonData) {
        console.log('✅ Ozon Success:', ozonData.title);
        return ozonData;
      }
      console.log('⚠️ Ozon Parser failed, trying fallback');
    }

    // Фоллбэк: Open Graph
    console.log('🔄 Trying Open Graph fallback');
    const options = {
      url: url,
      timeout: 15000,
      fetchOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
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

    console.log('✅ Fallback Success:', title);
    return {
      title: title,
      image: imageUrl,
      url: url
    };

  } catch (e) {
    console.error('❌ Meta Parser Error:', e.message);

    return {
      title: 'Товар (описание недоступно)',
      image: 'https://via.placeholder.com/400x400/e0e0e0/999999?text=Error',
      url: url
    };
  }
}

module.exports = { extractMeta };