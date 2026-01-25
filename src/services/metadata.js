const axios = require('axios');

async function extractMeta(url) {
  console.log('🔍 Requesting Google to parse:', url);

  // 1. Wildberries (оставляем как есть, он работает)
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    try {
      const id = url.match(/catalog\/(\d+)/)?.[1];
      const { data } = await axios.get(`https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`);
      const p = data.data.products[0];
      return { title: `${p.brand} / ${p.name}`, image: `https://basket-01.wbbasket.ru/vol${Math.floor(id / 100000)}/part${Math.floor(id / 1000)}/${id}/images/big/1.webp`, url };
    } catch (e) { }
  }

  // 2. Все остальное через Google Apps Script
  const gasUrl = process.env.GAS_PARSER_URL;
  if (gasUrl) {
    try {
      // Очищаем URL от мусора перед отправкой в Google
      const cleanUrl = url.split('?')[0];

      const { data } = await axios.get(gasUrl, {
        params: { url: cleanUrl },
        timeout: 20000
      });

      if (data && data.title && data.title !== "307 Temporary Redirect") {
        console.log('✅ Parsed via Google:', data.title);
        return {
          title: data.title,
          image: data.image,
          url: url
        };
      } else {
        console.log('⚠️ Google returned empty or redirect. Data:', data);
      }
    } catch (e) {
      console.error('❌ Google Parser Error:', e.message);
    }
  }

  // 3. Совсем крайний случай (красивое имя из ссылки)
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  return { title: slug.replace(/[-_]/g, ' ').substring(0, 50), image: '', url };
}

module.exports = { extractMeta };