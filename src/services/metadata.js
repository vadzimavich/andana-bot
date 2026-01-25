const axios = require('axios');

async function extractMeta(url) {
  console.log('🔍 Parsing via Google GAS:', url);

  const gasUrl = process.env.GAS_PARSER_URL;
  if (!gasUrl) return { title: 'Настрой GAS_PARSER_URL', image: '', url };

  try {
    // Убираем параметры из URL для чистоты запроса
    const cleanUrl = url.split('?')[0];
    const { data } = await axios.get(gasUrl, {
      params: { url: cleanUrl },
      timeout: 25000
    });

    if (data && data.title && !data.title.includes('Debug') && !data.title.includes('Ошибка')) {
      console.log('✅ Success:', data.title);
      return {
        title: data.title,
        image: data.image || '',
        url: url
      };
    }
  } catch (e) {
    console.error('❌ GAS Error:', e.message);
  }

  // Крайний случай: вырезаем название из ссылки
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  const fallbackTitle = slug.replace(/[-_]/g, ' ').substring(0, 60);
  return { title: fallbackTitle, image: '', url };
}

module.exports = { extractMeta };