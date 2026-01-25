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
      // 1. Пытаемся достать ID товара из ссылки
      // Ссылки бывают: catalog/123456/detail... или wildberries.ru/catalog/123456/...
      const articleMatch = url.match(/catalog\/(\d+)/);
      if (!articleMatch) return null;

      const article = articleMatch[1];
      console.log('WB: Артикул', article);

      // 2. Используем внутреннее API WB (оно отдает JSON)
      // Это работает лучше, чем парсинг HTML
      const apiUrl = `https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${article}`;

      const { data } = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': '*/*'
        }
      });

      const product = data?.data?.products?.[0];
      if (!product) return null;

      // Генерация ссылки на фото (WB хранит их на разных хостах basket-01...basket-15)
      // Есть формула, но проще взять host из API если он там есть, или попробовать перебор.
      // Упрощенно: берем название, а фото пробуем через OGS если тут сложно

      // Но мы можем схитрить: API возвращает название точно.
      // А фото возьмем через OGS с правильным UA, зная что товар существует.

      // Или попробуем собрать URL фото (это надежнее всего)
      // vol - первые 3-4 цифры, part - первые 5-6.
      // Формула сложная, давай вернем название из API, а фото попробуем через OGS.

      return {
        title: product.name,
        // WB API не отдает прямой URL на картинку в простом виде, 
        // поэтому вернем null, чтобы сработал общий парсер для картинки,
        // НО название мы уже точно знаем!
        image: null,
        url: url
      };

    } catch (e) {
      console.error('WB API Error:', e.message);
      return null;
    }
  },

  ozon: async (url) => {
    // Ozon очень жесткий. Единственный шанс - притвориться Телеграмом.
    return null; // Пусть идет в общий парсер с Telegram UA
  }
};

async function extractMeta(url) {
  try {
    console.log('📥 Extracting meta from:', url);
    let data = { title: null, image: null, url: url };

    // 1. Спец-парсеры (пока только WB API для названия)
    if (url.includes('wildberries') || url.includes('wb.ru')) {
      const wbData = await parsers.wildberries(url);
      if (wbData) {
        data.title = wbData.title;
        console.log('✅ WB API Title:', data.title);
      }
    }

    // 2. Если данных не хватает (или это не WB), запускаем OGS с заголовком Telegram
    if (!data.title || !data.image) {
      console.log('🔄 Running OGS with Telegram User-Agent...');
      const options = {
        url: url,
        timeout: 20000,
        fetchOptions: {
          headers: {
            'User-Agent': TELEGRAM_UA, // <--- ВОТ ОНО
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        }
      };

      const { result } = await ogs(options);

      if (!data.title) data.title = result.ogTitle || result.twitterTitle;

      // Картинки
      if (result.ogImage) {
        if (Array.isArray(result.ogImage)) {
          data.image = result.ogImage[0]?.url;
        } else {
          data.image = result.ogImage.url;
        }
      }
    }

    // 3. Фоллбеки и очистка
    data.title = data.title || 'Товар (без названия)';
    data.image = data.image || 'https://via.placeholder.com/400x400/e8e8e8/888888?text=No+Image';

    // Чистим название от мусора
    data.title = data.title
      .replace(/Купить | в интернет-магазине .*/gi, '')
      .replace(/Wildberries|Ozon|AliExpress/gi, '')
      .trim();

    console.log('✅ Final Meta:', data.title);
    return data;

  } catch (e) {
    console.error('❌ Meta Error:', e.message);
    // Возвращаем хоть что-то, чтобы не крашить бота
    return {
      title: 'Ссылка (не удалось получить описание)',
      image: 'https://via.placeholder.com/400x400/ffcccc/000000?text=Error',
      url: url
    };
  }
}

module.exports = { extractMeta };