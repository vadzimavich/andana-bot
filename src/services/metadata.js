const ogs = require('open-graph-scraper');
const ai = require('./ai');

async function extractMeta(url) {
  try {
    console.log('📥 Начинаю парсинг ссылки:', url);

    // 1. Сначала пробуем стандартный Open Graph (отлично для Ali и др.)
    const options = {
      url: url,
      timeout: 10000,
      fetchOptions: {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
      }
    };

    const { result } = await ogs(options);

    let title = result.ogTitle || result.twitterTitle;
    let image = result.ogImage?.[0]?.url || result.ogImage?.url;

    // 2. Если это WB/Ozon или стандартный парсер не нашел данных — идем в AI
    const isHardSite = url.includes('wildberries') || url.includes('ozon') || url.includes('wb.ru');

    if (isHardSite || !title || !image) {
      console.log('🤖 Магазин с защитой или данных нет. Запускаю Gemini...');

      const prompt = `
        Проанализируй ссылку на товар: "${url}". 
        Это интернет-магазин. Найди название товара и прямую ссылку на его главную картинку.
        Верни ТОЛЬКО JSON: {"title": "Название", "image": "URL картинки"}.
        Если не уверен в картинке, попробуй найти её в мета-данных или верни заглушку.
      `;

      const aiResponse = await ai.tryGenerate(prompt);
      if (aiResponse) {
        const data = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
        title = data.title || title;
        image = data.image || image;
      }
    }

    return {
      title: title || 'Товар без названия',
      image: image || 'https://via.placeholder.com/400x400?text=No+Image',
      url: url
    };

  } catch (e) {
    console.error('❌ Ошибка парсера метаданных:', e.message);
    return { title: 'Товар', image: 'https://via.placeholder.com/400', url };
  }
}

module.exports = { extractMeta };