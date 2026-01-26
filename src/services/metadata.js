const axios = require('axios');
const ogs = require('open-graph-scraper');

// --- ЛОКАЛЬНЫЙ ПАРСЕР WILDBERRIES ---
async function parseWildberriesLocal(url) {
  try {
    const idMatch = url.match(/catalog\/(\d+)/);
    if (!idMatch) return null;
    const id = idMatch[1];
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);

    // Перебираем корзины от 01 до 35 (покрывает все новые товары)
    // Делаем это параллельно для скорости
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

    // Ждем, кто первый ответит успешно
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

  // 1. WILDBERRIES -> Локально
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    const wbData = await parseWildberriesLocal(url);
    if (wbData) {
      console.log('✅ WB Local Success');
      return wbData;
    }
  }

  // 2. OZON / GOLD APPLE -> Google Apps Script
  if (url.includes('ozon') || url.includes('goldapple')) {
    const gasUrl = process.env.GAS_PARSER_URL;
    if (gasUrl) {
      try {
        console.log('🚀 Delegating to Google...');
        const { data } = await axios.get(gasUrl, { params: { url: url }, timeout: 30000 });
        if (data && data.title && !data.title.includes('Error')) {
          console.log('✅ Google Success:', data.title);
          return { title: data.title, image: data.image || '', url: url };
        }
      } catch (e) {
        console.error('❌ GAS Error:', e.message);
      }
    }
  }

  // 3. ALIEXPRESS / LAMODA / ОСТАЛЬНЫЕ -> Локальный OGS
  // Это вернет поддержку AliExpress, который работал раньше
  try {
    console.log('🌍 Using local OGS...');
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
    console.error('❌ OGS Error:', e.message);
  }

  // Fallback
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  return { title: slug.replace(/[-_]/g, ' ').substring(0, 60), image: '', url };
}

module.exports = { extractMeta };