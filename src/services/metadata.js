const ogs = require('open-graph-scraper');
const axios = require('axios');
const cheerio = require('cheerio');

const TELEGRAM_UA = 'TelegramBot (like TwitterBot)';

const parsers = {
  wildberries: async (url) => {
    try {
      // Извлекаем артикул из URL
      const articleMatch = url.match(/catalog\/(\d+)/);
      if (!articleMatch) {
        console.log('WB: Артикул не найден');
        return null;
      }

      const article = articleMatch[1];
      console.log('WB: Артикул', article);

      // Используем публичный поисковый API WB
      const searchUrl = `https://search.wb.ru/exactmatch/ru/common/v4/search?appType=1&couponsGeo=12,3,18,15,21&curr=rub&dest=-1257786&emp=0&lang=ru&locale=ru&pricemarginCoeff=1.0&query=${article}&reg=0&regions=80,64,83,4,38,33,70,82,69,68,86,75,30,40,48,1,22,66,31,71&resultset=catalog&sort=popular&spp=27&suppressSpellcheck=false`;

      const { data } = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Origin': 'https://www.wildberries.ru'
        },
        timeout: 10000
      });

      console.log('WB Search API:', data?.data?.products?.length || 0, 'products found');

      if (data?.data?.products?.[0]) {
        const product = data.data.products[0];

        // Формируем URL картинки по новой схеме
        const vol = Math.floor(product.id / 100000);
        const part = Math.floor(product.id / 1000);
        const imageUrl = `https://basket-${vol.toString().padStart(2, '0')}.wbbasket.ru/vol${vol}/part${part}/${product.id}/images/big/1.webp`;

        return {
          title: product.name,
          image: imageUrl,
          url: url
        };
      }
    } catch (e) {
      console.error('WB API Error:', e.response?.status || e.message);
    }
    return null;
  },

  ozon: async (url) => {
    try {
      console.log('Ozon: Parsing', url);

      // Разворачиваем короткую ссылку вручную
      let finalUrl = url;

      if (url.includes('/t/')) {
        try {
          // Делаем HEAD запрос без следования редиректам
          const response = await axios.head(url, {
            maxRedirects: 0,
            validateStatus: () => true,
            timeout: 5000
          });

          if (response.headers.location) {
            finalUrl = response.headers.location;
            // Если редирект относительный, добавляем домен
            if (finalUrl.startsWith('/')) {
              finalUrl = 'https://ozon.by' + finalUrl;
            }
            console.log('Ozon: Redirect to', finalUrl);
          }
        } catch (e) {
          if (e.response?.headers?.location) {
            finalUrl = e.response.headers.location;
            if (finalUrl.startsWith('/')) {
              finalUrl = 'https://ozon.by' + finalUrl;
            }
          }
        }
      }

      // Парсим финальную страницу
      const { data } = await axios.get(finalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru-RU,ru;q=0.9',
          'Referer': 'https://ozon.by/',
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'same-origin'
        },
        timeout: 15000
      });

      const $ = cheerio.load(data);

      // Ищем данные в разных местах
      let title = null;
      let imageUrl = null;

      // 1. __NEXT_DATA__ (React SSR)
      const nextDataScript = $('script#__NEXT_DATA__').html();
      if (nextDataScript) {
        try {
          const nextData = JSON.parse(nextDataScript);
          const pageProps = nextData?.props?.pageProps;

          if (pageProps?.title) {
            title = pageProps.title;
          }
          if (pageProps?.image) {
            imageUrl = pageProps.image;
          }
        } catch (e) {
          console.log('Ozon: Failed to parse __NEXT_DATA__');
        }
      }

      // 2. JSON-LD fallback
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

      // 3. Meta tags fallback
      if (!title) title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
      if (!imageUrl) imageUrl = $('meta[property="og:image"]').attr('content');

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

    console.log('✅ Success');
    return {
      title: title,
      image: imageUrl,
      url: url
    };

  } catch (e) {
    console.error('❌ Error:', e.message);
    return {
      title: 'Товар (не удалось получить данные)',
      image: 'https://via.placeholder.com/400x400/ffcccc/cc0000?text=Ошибка',
      url: url
    };
  }
}

module.exports = { extractMeta };