const axios = require('axios');
const cheerio = require('cheerio');

async function parseIkassa(ui) {
  const url = `https://receipts.cloud.ikassa.by/render/${ui}`;
  try {
    const { data } = await axios.get(url, { timeout: 5000 });
    const $ = cheerio.load(data);

    const items = [];
    let total = 0;

    $('#receiptBody pre').each((i, el) => {
      const text = $(el).text().trim();
      if (text.includes('*')) {
        const name = $(el).prev('pre').text().trim();
        const parts = text.split(/\s+/);
        const sum = parseFloat(parts[parts.length - 1].replace(',', '.'));

        if (!isNaN(sum) && name) {
          items.push({ desc: name, sum: sum });
        }
      }
      if (text.includes('ИТОГО К ОПЛАТЕ')) {
        const match = text.match(/(\d+[.,]\d+)/);
        if (match) total = parseFloat(match[0].replace(',', '.'));
      }
    });

    if (total === 0) total = items.reduce((acc, curr) => acc + curr.sum, 0);

    return {
      success: true,
      total: total.toFixed(2),
      items,
      url
    };
  } catch (e) {
    // Если статус 404 или любая ошибка загрузки
    return { success: false, url, ui };
  }
}

module.exports = { parseIkassa };