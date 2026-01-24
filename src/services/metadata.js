const ogs = require('open-graph-scraper');

async function extractMeta(url) {
  try {
    const options = { url: url, timeout: 5000 };
    const { result } = await ogs(options);

    return {
      title: result.ogTitle || 'Товар без названия',
      image: result.ogImage?.[0]?.url || result.ogImage?.url || 'https://via.placeholder.com/150',
      description: result.ogDescription || '',
      url: url
    };
  } catch (e) {
    console.error('Meta Parser Error:', e.message);
    // Если парсинг упал, возвращаем просто ссылку как название
    return {
      title: 'Ссылка',
      image: 'https://via.placeholder.com/150',
      url: url
    };
  }
}

module.exports = { extractMeta };