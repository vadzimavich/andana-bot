const axios = require('axios');

async function extractMeta(url) {
  console.log('🔍 Parsing URL:', url);

  const gasUrl = process.env.GAS_PARSER_URL;
  if (!gasUrl) return { title: 'Настрой GAS_PARSER_URL', image: '', url };

  try {
    const { data } = await axios.get(gasUrl, {
      params: { url: url },
      timeout: 30000
    });

    if (data) {
      // ВЫВОДИМ ДЕБАГ ЛОГИ ИЗ ГУГЛА
      if (data.debug) console.log('📝 GAS Debug Path:', data.debug);

      if (data.title && !data.title.includes('Fallback') && !data.title.includes('Error')) {
        console.log('✅ Success:', data.title);
        return { title: data.title, image: data.image || '', url: url };
      }
    }
  } catch (e) {
    console.error('❌ GAS Request Failed:', e.message);
  }

  // Крайний случай
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  return { title: slug.replace(/[-_]/g, ' ').substring(0, 60), image: '', url };
}

module.exports = { extractMeta };