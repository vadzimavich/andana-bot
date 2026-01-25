const axios = require('axios');
const config = require('../config');

async function extractMeta(url) {
  console.log('🔍 Requesting Google to parse:', url);

  // 1. Специальный парсер для Wildberries (он и так работает)
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    try {
      const id = url.match(/catalog\/(\d+)/)?.[1];
      const { data } = await axios.get(`https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`);
      const p = data.data.products[0];
      return { title: `${p.brand} / ${p.name}`, image: `https://basket-01.wbbasket.ru/vol${Math.floor(id / 100000)}/part${Math.floor(id / 1000)}/${id}/images/big/1.webp`, url };
    } catch (e) { }
  }

  // 2. Для всего остального (Ozon, GoldApple и т.д.) используем наш Google Script
  const gasUrl = process.env.GAS_PARSER_URL;
  if (gasUrl) {
    try {
      const { data } = await axios.get(gasUrl, { params: { url: url }, timeout: 15000 });
      if (data && data.title) {
        console.log('✅ Parsed via Google:', data.title);
        return {
          // Чистим заголовок Ozon от лишнего мусора
          title: data.title.replace(' - купить на OZON', '').replace(' в интернет-магазине Золотое Яблоко', '').trim(),
          image: data.image,
          url: url
        };
      }
    } catch (e) {
      console.error('❌ Google Parser Error:', e.message);
    }
  }

  // 3. Совсем крайний случай
  return { title: 'Товар по ссылке', image: '', url };
}

module.exports = { extractMeta };