const ogs = require('open-graph-scraper');

async function extractMeta(url) {
  try {
    const options = {
      url: url,
      timeout: 20000, // Даем больше времени (20 сек)
      // Эмуляция реального браузера Chrome
      fetchOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }
    };

    const { result } = await ogs(options);

    // Безопасное извлечение картинки (WB иногда отдает массив, иногда объект)
    let imageUrl = 'https://via.placeholder.com/150?text=No+Image';
    if (result.ogImage) {
      if (Array.isArray(result.ogImage)) {
        imageUrl = result.ogImage[0]?.url || imageUrl;
      } else if (result.ogImage.url) {
        imageUrl = result.ogImage.url;
      }
    }

    return {
      title: result.ogTitle || 'Товар (без названия)',
      image: imageUrl,
      description: result.ogDescription || '',
      url: url
    };

  } catch (e) {
    console.error('Meta Parser Error:', e.message || e);

    // Возвращаем заглушку, чтобы бот НЕ ПАДАЛ, а просто сохранял ссылку
    return {
      title: 'Ссылка (не удалось получить описание)',
      image: 'https://via.placeholder.com/150?text=Error',
      url: url
    };
  }
}

module.exports = { extractMeta };