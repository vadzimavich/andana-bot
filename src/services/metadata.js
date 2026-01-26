const axios = require('axios');
const ogs = require('open-graph-scraper');

async function extractMeta(url) {
  console.log('🔍 Router parsing:', url);

  // 1. ALIEXPRESS / LAMODA -> Локально (OGS)
  // Это работало раньше, возвращаем как было.
  if (url.includes('ali') || url.includes('lamoda')) {
    try {
      console.log('🌍 Using local OGS for Ali/Lamoda...');
      const options = {
        url: url,
        timeout: 10000,
        fetchOptions: { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } }
      };
      const { result } = await ogs(options);

      if (result.ogTitle) {
        console.log('✅ OGS Success:', result.ogTitle);
        return {
          title: result.ogTitle,
          image: result.ogImage?.[0]?.url || '',
          url: url
        };
      }
    } catch (e) {
      console.error('❌ OGS Error:', e.message);
    }
  }

  // 2. WB / OZON / GOLD APPLE -> Google Apps Script
  const gasUrl = process.env.GAS_PARSER_URL;
  if (gasUrl) {
    try {
      console.log('🚀 Delegating to Google...');
      const { data } = await axios.get(gasUrl, {
        params: { url: url },
        timeout: 30000
      });

      // Логируем дебаг из Гугла
      if (data.debug) console.log('📝 GAS Debug:', data.debug);

      if (data && data.title && !data.title.includes('Error')) {
        console.log('✅ Google Success:', data.title);
        return {
          title: data.title,
          image: data.image || '',
          url: url
        };
      }
    } catch (e) {
      console.error('❌ GAS Request Error:', e.message);
    }
  }

  // Fallback
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  return { title: slug.replace(/[-_]/g, ' ').substring(0, 60), image: '', url };
}

module.exports = { extractMeta };