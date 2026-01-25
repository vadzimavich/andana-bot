const axios = require('axios');

async function extractMeta(url) {
  console.log('🔍 Delegating all parsing to Google:', url);

  const gasUrl = process.env.GAS_PARSER_URL;
  if (!gasUrl) return { title: 'Товар (настрой GAS_PARSER_URL)', image: '', url };

  try {
    // Отправляем "чистый" URL без параметров слежки
    const cleanUrl = url.split('?')[0];
    const { data } = await axios.get(gasUrl, {
      params: { url: cleanUrl },
      timeout: 25000
    });

    if (data && data.title) {
      console.log('✅ Google Success:', data.title);
      return {
        title: data.title,
        image: data.image || '',
        url: url
      };
    }
  } catch (e) {
    console.error('❌ GAS Error:', e.message);
  }

  // Совсем крайний случай
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  return { title: slug.replace(/[-_]/g, ' ').substring(0, 60), image: '', url };
}

module.exports = { extractMeta };