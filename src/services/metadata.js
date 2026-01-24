const ogs = require('open-graph-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

const parsers = {
  wildberries: async (url) => {
    try {
      // Разворачиваем короткие ссылки
      let finalUrl = url;
      if (url.includes('wb.ru')) {
        try {
          const response = await axios.get(url, {
            maxRedirects: 5,
            validateStatus: () => true,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          finalUrl = response.request.res.responseUrl || url;
        } catch (e) {
          console.log('WB redirect error:', e.message);
        }
      }

      const articleMatch = finalUrl.match(/catalog\/(\d+)/);
      if (!articleMatch) {
        console.log('WB: Артикул не найден');
        return null;
      }

      const article = articleMatch[1];
      console.log('WB: Артикул', article);

      // Пробуем новое API (работает в 2026)
      const apiUrl = `https://card.wb.ru/cards/detail?appType=1&curr=rub&dest=-1257786&spp=0&nm=${article}`;

      const { data } = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': '*/*',
          'Origin': 'https://www.wildberries.ru'
        },
        timeout: 10000
      });

      console.log('WB API:', data?.data?.products ? 'OK' : 'Empty');

      if (data?.data?.products?.[0]) {
        const product = data.data.products[0];

        // Новая схема картинок WB 2026
        const shortId = product.id.toString().slice(0, -3);
        const vol = product.id.toString().slice(0, -5);
        const imageUrl = `https://basket-${vol.padStart(2, '0')}.wbbasket.ru/vol${vol}/part${shortId}/${product.id}/images/big/1.webp`;

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
      console.log('Ozon: Parsing', url);

      // Для коротких ссылок делаем ручной редирект
      let finalUrl = url;
      if (url.includes('/t/')) {
        try {
          const response = await axios.head(url, {
            maxRedirects: 0,
            validateStatus: (status) => status === 301 || status === 302,
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
            },
            timeout: 5000
          });
          finalUrl = response.headers.location || url;
          console.log('Ozon: Развернутый URL', finalUrl);
        } catch (e) {
          if (e.response?.headers?.location) {
            finalUrl = e.response.headers.location;
            console.log('Ozon: Развернутый URL (from error)', finalUrl);
          }
        }
      }

      // Парсим страницу
      const { data } = await axios.get(finalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'ru'
        },
        maxRedirects: 3,
        timeout: 10000
      });

      const $ = cheerio.load(data);

      // Ищем данные
      let title = null;
      let imageUrl = null;

      // 1. JSON-LD
      $('script[type="application/ld+json"]').each((i, elem) => {
        try {
          const json = JSON.parse($(elem).html());
          if (json['@type'] === 'Product') {
            title = json.name;
            imageUrl = json.image || json.image?.[0];
          }
        } catch (e) { }
      });

      // 2. Open Graph fallback
      if (!title) title = $('meta[property="og:title"]').attr('content');
      if (!imageUrl) imageUrl = $('meta[property="og:image"]').attr('content');

      // 3. Обычные теги
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
  },

  aliexpress: async (url) => {
    try {
      // Разворачиваем короткую ссылку ali.click
      let finalUrl = url;
      if (url.includes('ali.click') || url.includes('s.click.aliexpress.com')) {
        try {
          const response = await axios.head(url, {
            maxRedirects: 0,
            validateStatus: (status) => status === 301 || status === 302,
            timeout: 5000
          });
          finalUrl = response.headers.location || url;
        } catch (e) {
          if (e.response?.headers?.location) {
            finalUrl = e.response.headers.location;
          }
        }
      }

      console.log('AliExpress: Final URL', finalUrl);

      const { data } = await axios.get(finalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'text/html',
          'Accept-Language': 'ru'
        },
        maxRedirects: 3,
        timeout: 10000
      });

      const $ = cheerio.load(data);

      let title = $('meta[property="og:title"]').attr('content') ||
        $('h1').first().text().trim() ||
        'AliExpress товар';

      let imageUrl = $('meta[property="og:image"]').attr('content') ||
        $('img[data-image-index="0"]').attr('src');

      return {
        title: title.substring(0, 150),
        image: imageUrl || 'https://via.placeholder.com/400',
        url: url
      };
    } catch (e) {
      console.error('AliExpress Parser Error:', e.message);
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

    // AliExpress
    if (url.includes('aliexpress') || url.includes('ali.click') || url.includes('s.click.aliexpress')) {
      console.log('🛍 Detected: AliExpress');
      const aliData = await parsers.aliexpress(url);
      if (aliData) {
        console.log('✅ AliExpress Success');
        return aliData;
      }
      console.log('⚠️ AliExpress failed');
    }

    // Универсальный фоллбэк
    console.log('🔄 Universal fallback');
    const options = {
      url: url,
      timeout: 10000,
      fetchOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
          'Accept': 'text/html'
        }
      }
    };

    const { result } = await ogs(options);

    let imageUrl = 'https://via.placeholder.com/400x400/e8e8e8/888888?text=Товар';
    if (result.ogImage) {
      imageUrl = Array.isArray(result.ogImage)
        ? result.ogImage[0]?.url
        : result.ogImage.url;
    }

    let title = result.ogTitle || result.ogDescription || 'Товар';
    title = title.replace(/Купить |в интернет-магазине.*/gi, '').trim().substring(0, 150);

    console.log('✅ Fallback Success');
    return {
      title: title,
      image: imageUrl || 'https://via.placeholder.com/400',
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