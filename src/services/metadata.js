const ogs = require('open-graph-scraper');

async function extractMeta(url) {
  try {
    const options = {
      url: url,
      timeout: 10000, // 10 сек
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      }
    };
    const { result } = await ogs(options);

    return {
      title: result.ogTitle || 'Ссылка',
      image: result.ogImage?.[0]?.url || result.ogImage?.url || 'https://via.placeholder.com/150',
      description: result.ogDescription || '',
      url: url
    };
  } catch (e) {
    console.error('Meta Parser Error:', e.message);
    // Возвращаем заглушку, чтобы не крашить бота
    return {
      title: 'Ссылка (не удалось получить данные)',
      image: 'https://via.placeholder.com/150?text=Error',
      url: url
    };
  }
}

module.exports = { extractMeta };