const axios = require('axios');

// Обновленная логика корзин WB (поддерживает новые ID 500млн+)
function getWbHost(id) {
  const vol = Math.floor(id / 100000);
  if (vol >= 0 && vol <= 143) return '01';
  if (vol >= 144 && vol <= 287) return '02';
  if (vol >= 288 && vol <= 431) return '03';
  if (vol >= 432 && vol <= 719) return '04';
  if (vol >= 720 && vol <= 1007) return '05';
  if (vol >= 1008 && vol <= 1061) return '06';
  if (vol >= 1062 && vol <= 1115) return '07';
  if (vol >= 1116 && vol <= 1169) return '08';
  if (vol >= 1170 && vol <= 1313) return '09';
  if (vol >= 1314 && vol <= 1601) return '10';
  if (vol >= 1602 && vol <= 1655) return '11';
  if (vol >= 1656 && vol <= 1919) return '12';
  if (vol >= 1920 && vol <= 2045) return '13';
  if (vol >= 2046 && vol <= 2189) return '14';
  if (vol >= 2190 && vol <= 2405) return '15';
  if (vol >= 2406 && vol <= 2621) return '16';
  if (vol >= 2622 && vol <= 2837) return '17';
  if (vol >= 2838 && vol <= 3053) return '18';
  if (vol >= 3054 && vol <= 3269) return '19';
  if (vol >= 3270 && vol <= 3485) return '20';
  if (vol >= 3486 && vol <= 3701) return '21';
  if (vol >= 3702 && vol <= 3917) return '22';
  if (vol >= 3918 && vol <= 4133) return '23';
  if (vol >= 4134 && vol <= 4349) return '24';
  if (vol >= 4350 && vol <= 4565) return '25';
  if (vol >= 4566 && vol <= 4781) return '26';
  if (vol >= 4782 && vol <= 4997) return '27';
  if (vol >= 4998 && vol <= 5213) return '28';
  return '29';
}

async function extractMeta(url) {
  console.log('🔍 Parsing URL:', url);

  // 1. WILDBERRIES (Локально через API корзин)
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    try {
      const idMatch = url.match(/catalog\/(\d+)/);
      if (idMatch) {
        const id = idMatch[1];
        const vol = Math.floor(id / 100000);
        const part = Math.floor(id / 1000);
        const host = getWbHost(id);

        const cardUrl = `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/info/ru/card.json`;
        const { data } = await axios.get(cardUrl, { timeout: 7000 });

        console.log('✅ WB Parsed locally');
        return {
          title: `${data.imt_name || data.subj_name}`,
          image: `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${id}/images/big/1.webp`,
          url: url
        };
      }
    } catch (e) {
      console.log('❌ WB Local API failed:', e.message);
    }
  }

  // 2. OZON / GOLD APPLE (Через Google Apps Script)
  const gasUrl = process.env.GAS_PARSER_URL;
  if (gasUrl) {
    try {
      const { data } = await axios.get(gasUrl, { params: { url: url }, timeout: 25000 });
      if (data && data.title) {
        console.log('✅ Google Response:', data.title);
        return {
          title: data.title,
          image: data.image || '',
          url: url
        };
      }
    } catch (e) {
      console.error('❌ GAS Error:', e.message);
    }
  }

  // 3. Fallback
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  return { title: slug.replace(/[-_]/g, ' ').substring(0, 60), image: '', url };
}

module.exports = { extractMeta };