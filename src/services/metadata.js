const axios = require('axios');
const ogs = require('open-graph-scraper');

async function parseOzonDirect(url) {
  try {
    let finalUrl = url;

    // Шаг 1: Резолвим короткие ссылки типа /t/xxxxx
    if (url.includes('/t/') || url.includes('ozon.by')) {
      console.log('🔄 Resolving Ozon redirect...');

      // Следуем за редиректом, чтобы получить полный URL
      const redirectResponse = await axios.get(url, {
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      finalUrl = redirectResponse.request.res.responseUrl || url;
      console.log('📍 Resolved to:', finalUrl);
    }

    // Шаг 2: Извлекаем slug для API
    const urlObj = new URL(finalUrl.replace('ozon.by', 'ozon.ru'));
    let slug = urlObj.pathname;

    // Удаляем trailing slash и параметры
    slug = slug.replace(/\/$/, '');

    // Шаг 3: Запрашиваем API
    const apiUrl = `https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=${encodeURIComponent(slug)}`;

    console.log('🔍 Ozon API request:', apiUrl);

    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        'Referer': finalUrl.replace('ozon.by', 'ozon.ru'),
        'Origin': 'https://www.ozon.ru',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin'
      },
      timeout: 15000
    });

    const data = response.data;

    // Парсим ответ
    if (data?.seo?.meta) {
      const meta = data.seo.meta;
      let title = '';
      let image = '';

      meta.forEach(item => {
        if (item.property === 'og:title' && item.content) {
          title = item.content;
        }
        if (item.property === 'og:image' && item.content) {
          image = item.content;
        }
      });

      if (title) {
        title = title
          .replace(/ купить.*$/i, '')
          .replace(/ - OZON.*$/i, '')
          .replace(/ \| OZON$/i, '')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 150);

        console.log('✅ Ozon Success:', title);
        return { title, image: image || '', url: finalUrl };
      }
    }

    // Альтернативный поиск в widgetStates
    if (data?.widgetStates) {
      const states = Object.values(data.widgetStates);
      for (const state of states) {
        if (typeof state === 'string') {
          try {
            const parsed = JSON.parse(state);
            if (parsed?.title || parsed?.name) {
              const title = (parsed.title || parsed.name).substring(0, 150);
              console.log('✅ Ozon widgetStates Success');
              return {
                title,
                image: parsed.image || parsed.mainImage || '',
                url: finalUrl
              };
            }
          } catch { }
        }
      }
    }

  } catch (e) {
    console.error('❌ Ozon Direct Error:', e.message);
    if (e.response) {
      console.error('Response status:', e.response.status);
      console.error('Response headers:', e.response.headers);
    }
  }
  return null;
}

// --- ЛОКАЛЬНЫЙ ПАРСЕР WILDBERRIES ---
async function parseWildberriesLocal(url) {
  try {
    const idMatch = url.match(/catalog\/(\d+)/);
    if (!idMatch) return null;
    const id = idMatch[1];
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);

    // Перебираем корзины 01-35
    const requests = [];
    for (let i = 1; i <= 35; i++) {
      const host = i < 10 ? `0${i}` : i;
      const cardUrl = `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/info/ru/card.json`;
      requests.push(
        axios.get(cardUrl, { timeout: 1500 })
          .then(res => ({ host, data: res.data }))
          .catch(() => null)
      );
    }

    const results = await Promise.all(requests);
    const success = results.find(r => r && r.data);

    if (success) {
      const { host, data } = success;
      return {
        title: `${data.imt_name || data.subj_name}`,
        image: `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/images/big/1.webp`,
        url: url
      };
    }
  } catch (e) {
    console.error('WB Local Error:', e.message);
  }
  return null;
}

// --- ГЛАВНАЯ ФУНКЦИЯ ---
async function extractMeta(url) {
  console.log('🔍 Router parsing:', url);

  // 1. WILDBERRIES (Локально)
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    const wbData = await parseWildberriesLocal(url);
    if (wbData) {
      console.log('✅ WB Local Success');
      return wbData;
    }
  }

  // 1. OZON
  if (url.includes('ozon')) {
    const ozonData = await parseOzonDirect(url);
    if (ozonData) return ozonData;

    // Fallback на GAS только если прямой метод не сработал
    const gasUrl = process.env.GAS_PARSER_URL;
    if (gasUrl) {
      try {
        console.log('🚀 Ozon Fallback to Google...');
        const cleanUrl = url.replace('ozon.by', 'ozon.ru').split('?')[0];
        const { data } = await axios.get(gasUrl, {
          params: { url: cleanUrl },
          timeout: 30000
        });

        if (data?.title && !data.title.includes('Error') && !data.title.includes('Redirect')) {
          console.log('✅ Google Success:', data.title);
          return { title: data.title, image: data.image || '', url };
        }
      } catch (e) {
        console.error('❌ GAS Ozon Error:', e.message);
      }
    }
  }

  // 2. ALIEXPRESS (Твой рабочий код)
  if (url.includes('ali')) {
    try {
      console.log('🔄 Using Open Graph Scraper for Ali...');
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

      let imageUrl = '';
      if (result.ogImage) {
        if (Array.isArray(result.ogImage)) imageUrl = result.ogImage[0]?.url;
        else if (result.ogImage.url) imageUrl = result.ogImage.url;
      }

      let title = result.ogTitle || result.ogDescription || 'Товар';
      title = title
        .replace(/Купить | в интернет-магазине .*/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 150);

      if (title && title !== 'Товар') {
        console.log('✅ OGS Ali Success:', title);
        return { title, image: imageUrl, url };
      }
    } catch (e) {
      console.error('❌ Ali OGS Error:', e.message);
    }
  }

  // 3. LAMODA / ONLINER / 21VEK (Локально через OGS)
  if (url.includes('lamoda') || url.includes('onliner') || url.includes('21vek')) {
    try {
      console.log('🌍 Using local OGS for General sites...');
      const options = {
        url: url,
        timeout: 10000,
        fetchOptions: { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } }
      };
      const { result } = await ogs(options);
      if (result.ogTitle) {
        console.log('✅ OGS Success:', result.ogTitle);
        return {
          title: result.ogTitle,
          image: result.ogImage?.[0]?.url || '',
          url: url
        };
      }
    } catch (e) {
      console.error('❌ OGS General Error:', e.message);
    }
  }

  // 4. GOLD APPLE (Только они летят в Google)
  const gasUrl = process.env.GAS_PARSER_URL;
  if (gasUrl && (url.includes('ozon') || url.includes('goldapple'))) {
    try {
      console.log('🚀 Delegating to Google (Ozon/GA)...');
      const cleanUrl = url.split('?')[0];
      const { data } = await axios.get(gasUrl, {
        params: { url: cleanUrl },
        timeout: 30000
      });

      if (data && data.title && !data.title.includes('Error')) {
        console.log('✅ Google Success:', data.title);
        return { title: data.title, image: data.image || '', url: url };
      }
    } catch (e) {
      console.error('❌ GAS Request Error:', e.message);
    }
  }

  // Fallback
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  return { title: slug.replace(/[-_]/g, ' ').substring(0, 60), image: '', url };
}

module.exports = { extractMeta };