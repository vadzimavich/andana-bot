const axios = require('axios');

async function extractMeta(url) {
  console.log('🔍 Delegating parsing to Google:', url);

  const gasUrl = process.env.GAS_PARSER_URL;
  if (!gasUrl) {
    return { title: 'Товар (настрой GAS_PARSER_URL)', image: '', url };
  }

  try {
    const { data } = await axios.get(gasUrl, {
      params: { url: url },
      timeout: 30000 // Даем Google время на раздумья
    });

    if (data && data.title) {
      console.log('✅ Google parsed successfully:', data.title);
      return {
        title: data.title,
        image: data.image || '',
        url: url
      };
    }
  } catch (e) {
    console.error('❌ GAS Delegation Error:', e.message);
  }

  // Крайний случай, если Google упал
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  return { title: slug.replace(/[-_]/g, ' ').substring(0, 60), image: '', url };
}

module.exports = { extractMeta };