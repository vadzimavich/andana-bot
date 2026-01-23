const axios = require('axios');
const cheerio = require('cheerio');

async function parseIkassa(ui) {
  try {
    const url = `https://receipts.cloud.ikassa.by/render/${ui}`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const items = [];
    let total = 0;

    // В iKassa товары лежат в <div id="receiptBody"> в тегах <pre>
    $('#receiptBody pre').each((i, el) => {
      const text = $(el).text().trim();

      // Ищем строку с ценой и количеством (формат: 18.99 *0.176  3.34)
      if (text.includes('*')) {
        const prevText = $(el).prev().text().trim(); // Название товара обычно в предыдущем pre
        const parts = text.split(/\s+/);
        const sum = parseFloat(parts[parts.length - 1]);

        if (!isNaN(sum)) {
          items.push({
            desc: prevText || 'Товар',
            sum: sum
          });
        }
      }

      // Ищем ИТОГО
      if (text.includes('ИТОГО К ОПЛАТЕ')) {
        const match = text.match(/[\d.]+/);
        if (match) total = parseFloat(match[0]);
      }
    });

    return { total, items, source: 'iKassa' };
  } catch (e) {
    console.error('iKassa Parser Error:', e.message);
    return null;
  }
}

module.exports = { parseIkassa };