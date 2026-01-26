const axios = require('axios');
const ogs = require('open-graph-scraper');

// --- ЛОКАЛЬНЫЙ ПАРСЕР WILDBERRIES (Метод грубой силы) ---
async function parseWildberriesLocal(url) {
  try {
    const idMatch = url.match(/catalog\/(\d+)/);
    if (!idMatch) return null;
    const id = idMatch[1];
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);

    // Мы просто перебираем сервера от 01 до 30.
    // Это занимает около 1-2 секунд, так как мы шлем запросы пачками.
    const hosts = [];
    for (let i = 1; i <= 30; i++) {
      hosts.push(i < 10 ? `0${i}` : `${i}`);
    }

    // Функция проверки одного хоста
    const checkHost = async (host) => {
      const cardUrl = `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/info/ru/card.json`;
      try {
        const { data } = await axios.get(cardUrl, { timeout: 1500 });
        return { host, data };
      } catch (e) {
        return null;
      }
    };

    // Запускаем все запросы параллельно (Promise.any был бы идеален, но node 14 его может не иметь)
    // Используем Promise.all и фильтрацию
    const results = await Promise.all(hosts.map(checkHost));
    const success = results.find(r => r !== null);

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

  // 1. WILDBERRIES -> Локально (самый быстрый метод)
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    const wbData = await parseWildberriesLocal(url);
    if (wbData) {
      console.log('✅ WB Local Success');
      return wbData;
    }
  }

  // 2. ВСЕ ОСТАЛЬНОЕ (Ozon, Ali, GA) -> Google Apps Script
  // Мы доверяем Гуглу парсить всё остальное, так как у него "белый" IP
  const gasUrl = process.env.GAS_PARSER_URL;
  if (gasUrl) {
    try {
      console.log('🚀 Delegating to Google...');
      // Чистим URL от лишних параметров, которые могут сбить парсер
      const cleanUrl = url.split('?')[0];

      const { data } = await axios.get(gasUrl, {
        params: { url: cleanUrl },
        timeout: 30000
      });

      if (data && data.title && !data.title.includes('Error') && data.title !== "Товар по ссылке") {
        console.log('✅ Google Success:', data.title);
        return { title: data.title, image: data.image || '', url: url };
      } else {
        console.log('⚠️ Google returned generic title:', data);
      }
    } catch (e) {
      console.error('❌ GAS Error:', e.message);
    }
  }

  // 3. ПОСЛЕДНИЙ ШАНС (Локальный OGS)
  // Если Гугл не справился (например, Ali заблокировал и его), пробуем сами
  try {
    console.log('🌍 Using local OGS fallback...');
    const options = {
      url: url,
      timeout: 5000,
      fetchOptions: { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } }
    };
    const { result } = await ogs(options);
    if (result.ogTitle) {
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