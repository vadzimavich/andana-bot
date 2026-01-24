const ogs = require('open-graph-scraper');

async function extractMeta(url) {
  try {
    const options = {
      url: url,
      timeout: 15000,
      fetchOptions: {
        headers: {
          // Магический User-Agent. WB думает, что мы - сервер Телеграма, генерирующий превью.
          'User-Agent': 'TelegramBot (like TwitterBot)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      }
    };

    const { result } = await ogs(options);

    // Логика извлечения картинки
    let imageUrl = 'https://via.placeholder.com/150?text=No+Image';
    if (result.ogImage) {
      if (Array.isArray(result.ogImage)) {
        imageUrl = result.ogImage[0]?.url || imageUrl;
      } else if (result.ogImage.url) {
        imageUrl = result.ogImage.url;
      }
    }

    // Фикс для WB: иногда название приходит в og:description, а не og:title
    let title = result.ogTitle || result.ogDescription || 'Товар';
    // Очистка названия от мусора (WB любит добавлять "Купить ... в интернет магазине")
    title = title.replace(/Купить | в интернет-магазине .*/gi, '');

    return {
      title: title.trim(),
      image: imageUrl,
      description: result.ogDescription || '',
      url: url
    };

  } catch (e) {
    console.error('Meta Parser Error:', e.message);
    return {
      title: 'Ссылка (описание недоступно)',
      image: 'https://via.placeholder.com/150?text=Error',
      url: url
    };
  }
}

module.exports = { extractMeta };