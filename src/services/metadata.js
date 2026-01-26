const axios = require('axios');
const ogs = require('open-graph-scraper');

// --- ПАРСЕР OZON ---

async function parseOzonBrowserless(url) {
  try {
    const apiKey = process.env.BROWSERLESS_API_KEY; // Получить на browserless.io

    const response = await axios.post(
      `https://chrome.browserless.io/content?token=${apiKey}`,
      {
        url: url.replace('ozon.by', 'ozon.ru'),
        gotoOptions: { waitUntil: 'networkidle2' }
      },
      { timeout: 30000 }
    );

    const html = response.data;

    // Ищем JSON-LD
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ldMatch) {
      const ld = JSON.parse(ldMatch[1]);
      const item = Array.isArray(ld) ? ld.find(i => i['@type'] === 'Product') : ld;

      if (item?.name) {
        return {
          title: item.name.substring(0, 150),
          image: Array.isArray(item.image) ? item.image[0] : item.image,
          url
        };
      }
    }
  } catch (e) {
    console.error('Browserless error:', e.message);
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

  // 2. OZON (Прямой метод + Fallback на GAS)
  if (url.includes('ozon')) {
    const ozonData = await parseOzonBrowserless(url);
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

  // 3. ALIEXPRESS
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

  // 4. LAMODA / ONLINER / 21VEK
  if (url.includes('lamoda') || url.includes('onliner') || url.includes('21vek')) {
    try {
      console.log('🌍 Using local OGS for General sites...');
      const options = {
        url: url,
        timeout: 10000,
        fetchOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
          }
        }
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

  // 5. GOLD APPLE (только через GAS)
  const gasUrl = process.env.GAS_PARSER_URL;
  if (gasUrl && url.includes('goldapple')) {
    try {
      console.log('🚀 Delegating to Google (GoldApple)...');
      const cleanUrl = url.split('?')[0];
      const { data } = await axios.get(gasUrl, {
        params: { url: cleanUrl },
        timeout: 30000
      });

      if (data?.title && !data.title.includes('Error')) {
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