const axios = require('axios');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');

// --- iKassa (Старый код) ---
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
  } catch (e) {
    return { success: false, url, ui };
  }
}

// --- Euroopt (Новый код) ---
async function parseEplus(url) {
  try {
    // 1. Извлекаем GUID из ссылки
    // Ссылка вида: https://r.eplus.by/37490B-287DC300-2182-4E49-8906-E211854E26B3
    const guid = url.split('/').pop();

    // 2. Делаем запрос к API Евроторга (эмулируем скрипт с их сайта)
    // ServiceNumber взят из исходного кода страницы, он, похоже, публичный для веб-вьюера
    const response = await axios.post('https://rest.eurotorg.by/10101/Json', {
      "CRC": "",
      "Packet": {
        "JWT": "",
        "MethodName": "DiscountClub.GetVirtualReceipt",
        "ServiceNumber": "04FA4558-EF8A-4783-A112-036204888532",
        "Data": {
          "CreditGroupGUID": guid
        }
      }
    }, {
      responseType: 'arraybuffer' // Важно! Мы ждем PDF (бинарник)
    });

    // 3. Парсим PDF в текст
    const pdfData = await pdf(response.data);
    const text = pdfData.text;

    // 4. Разбираем текст чека
    // Пример строки: "1258394 Чеснок (Китай) 1 кг 7.90 x 0.03 0.24"
    // Или: "1126819 [М] Сметана (пленка,10%) 450г Молочный мир 2.18 x 1 2.18"

    const lines = text.split('\n');
    const items = [];
    let total = 0;

    // Регулярка для поиска строк товаров:
    // Ищет строки, заканчивающиеся на "число x число число" (Цена x Кол-во Итог)
    // Пример конца строки: "2.18 x 1 2.18" или "7.90 x 0.03 0.24"
    const itemRegex = /^(.*?)\s+(\d+[.,]\d{2})\s+x\s+([\d.,]+)\s+(\d+[.,]\d{2})$/;

    // Проходим по строкам. В PDF Евроопта название товара часто на одной строке, а цена на следующей,
    // ИЛИ код товара и название на одной, а цена в конце.
    // PDF-parse часто склеивает это в одну строку, если они визуально рядом.

    // Упрощенный парсинг для Евроопта (основан на структуре PDF):
    // Обычно строки выглядят так:
    // "Код Название ... Цена x Кол-во Сумма"

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Пробуем найти строку с ценой
      const match = line.match(/(\d+[.,]\d{2})\s+x\s+([\d.,]+)\s+(\d+[.,]\d{2})$/);

      if (match) {
        // match[0] = "7.90 x 0.03 0.24"
        // match[3] = "0.24" (Сумма)
        const sum = parseFloat(match[3].replace(',', '.'));

        // Название товара - это всё, что было ДО цены в этой строке
        // Но иногда название переносится на строку ВЫШЕ.
        // В строке обычно есть код товара в начале (цифры).

        let name = line.substring(0, match.index).trim();

        // Если в этой строке названия нет (она короткая), берем предыдущую строку
        if (name.length < 3 && i > 0) {
          name = lines[i - 1].trim();
        }

        // Убираем код товара в начале (цифры)
        name = name.replace(/^\d+\s+/, '');

        if (name && !name.includes('ИТОГО')) {
          items.push({ desc: name, sum: sum });
        }
      }

      if (line.includes('ИТОГО К ОПЛАТЕ')) {
        const totalMatch = line.match(/(\d+[.,]\d{2})/);
        if (totalMatch) total = parseFloat(totalMatch[0].replace(',', '.'));
      }
    }

    if (total === 0 && items.length > 0) {
      total = items.reduce((acc, curr) => acc + curr.sum, 0);
    }

    if (items.length === 0) throw new Error('Items not found in PDF');

    return {
      success: true,
      total: total.toFixed(2),
      items,
      url,
      source: 'Euroopt'
    };

  } catch (e) {
    console.error('Eplus Parser Error:', e.message);
    return { success: false, url };
  }
}

module.exports = { parseIkassa, parseEplus };