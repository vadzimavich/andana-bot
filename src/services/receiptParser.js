const axios = require('axios');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');

// iKassa
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
        if (!isNaN(sum) && name) items.push({ desc: name, sum: sum });
      }
      if (text.includes('ИТОГО К ОПЛАТЕ')) {
        const match = text.match(/(\d+[.,]\d+)/);
        if (match) total = parseFloat(match[0].replace(',', '.'));
      }
    });

    if (total === 0) total = items.reduce((acc, curr) => acc + curr.sum, 0);
    return { success: true, total: total.toFixed(2), items, url, source: 'iKassa' };
  } catch (e) { return { success: false, url }; }
}

// Euroopt
async function parseEplus(url) {
  try {
    const guid = url.split('/').pop();
    console.log('🚀 Запрос к Евроопту, GUID:', guid);

    const response = await axios.post('https://rest.eurotorg.by/10101/Json', {
      "CRC": "",
      "Packet": {
        "JWT": "",
        "MethodName": "DiscountClub.GetVirtualReceipt",
        "ServiceNumber": "04FA4558-EF8A-4783-A112-036204888532",
        "Data": { "CreditGroupGUID": guid }
      }
    }, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://r.eplus.by',
        'Referer': 'https://r.eplus.by/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
      }
    });

    const pdfData = await pdf(response.data);
    const lines = pdfData.text.split('\n');
    const items = [];
    let total = 0;

    lines.forEach((line, i) => {
      const match = line.match(/(\d+[.,]\d{2})\s*[x*]\s*([\d.,]+)\s+(\d+[.,]\d{2})$/);
      if (match) {
        let name = line.substring(0, match.index).trim();
        const sum = parseFloat(match[3].replace(',', '.'));
        if (name.length < 3 && i > 0) name = lines[i - 1].trim();
        name = name.replace(/^\d{5,}\s+/, '').replace('[M] ', '');
        if (name && !name.includes('ИТОГО') && !name.includes('Банк')) {
          items.push({ desc: name, sum: sum });
        }
      }
      if (line.includes('ИТОГО К ОПЛАТЕ')) {
        const totalMatch = line.match(/(\d+[.,]\d{2})/);
        if (totalMatch) total = parseFloat(totalMatch[0].replace(',', '.'));
      }
    });

    return {
      success: true,
      total: total || items.reduce((a, b) => a + b.sum, 0).toFixed(2),
      items,
      url,
      source: 'Euroopt'
    };
  } catch (e) {
    console.error('❌ Ошибка Евроопта:', e.message);
    return { success: false, url, source: 'Euroopt' };
  }
}

module.exports = { parseIkassa, parseEplus };