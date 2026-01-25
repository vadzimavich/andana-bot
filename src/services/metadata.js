const ogs = require('open-graph-scraper');
const ai = require('./ai');

async function extractMeta(url) {
  try {
    console.log('📥 Начинаю парсинг ссылки:', url);

    // 1. Сначала пробуем стандартный Open Graph
    // Это должно работать для AliExpress, YouTube и большинства сайтов
    const options = {
      url: url,
      timeout: 15000,
      fetchOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      }
    };

    let ogData = {};
    try {
      const { result } = await ogs(options);
      ogData = result;
    } catch (e) {
      console.log('OGS failed, trying AI fallback...');
    }

    let title = ogData.ogTitle || ogData.twitterTitle;
    let image = ogData.ogImage?.[0]?.url || ogData.ogImage?.url;

    // Проверка на "плохой" результат (WB/Ozon часто отдают капчу вместо контента)
    const isBadResult = !title || title.includes('Just a moment') || title.includes('Access Denied') || title.includes('Ой!');
    const isMarketplace = url.includes('wildberries') || url.includes('ozon') || url.includes('wb.ru');

    // 2. Если OGS не справился или это маркетплейс с защитой — идем в AI
    if (isBadResult || isMarketplace) {
      console.log('🤖 Запускаю Gemini для парсинга...');

      const prompt = `
        Extract product info from this URL: "${url}".
        Return JSON: {"title": "Product Name", "image": "Image URL"}.
        If you can't access the URL, try to guess the product name from the URL structure itself.
        For image, use a generic placeholder if not found.
      `;

      try {
        const aiResponse = await ai.tryGenerate(prompt);
        if (aiResponse) {
          const data = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
          title = data.title || title;
          image = data.image || image;
        }
      } catch (aiError) {
        console.error('AI Parsing failed:', aiError.message);
      }
    }

    return {
      title: title || 'Товар без названия',
      image: image || 'https://via.placeholder.com/400x400?text=No+Image',
      url: url
    };

  } catch (e) {
    console.error('❌ Critical Meta Error:', e.message);
    return { title: 'Ссылка', image: 'https://via.placeholder.com/400', url };
  }
}

module.exports = { extractMeta };