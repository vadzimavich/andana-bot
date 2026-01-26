const axios = require('axios');
const ogs = require('open-graph-scraper');

async function extractMeta(url) {
  console.log('🔍 Router parsing:', url);

  // 1. LAMODA -> Локально (OGS работает отлично)
  if (url.includes('lamoda')) {
    try {
      console.log('🌍 Using local OGS for Lamoda...');
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

  // 2. ВСЕ ОСТАЛЬНОЕ -> Google Apps Script
  // WB, Ozon, Ali, GoldApple, 21vek, Onliner
  const gasUrl = process.env.GAS_PARSER_URL;
  if (gasUrl) {
    try {
      console.log('🚀 Delegating to Google...');
      // Чистим URL от лишних параметров, но оставляем важные для Ali
      const cleanUrl = url.includes('ali') ? url : url.split('?')[0];

      const { data } = await axios.get(gasUrl, {
        params: { url: cleanUrl },
        timeout: 30000
      });

      if (data.debug) console.log('📝 GAS Debug:', data.debug);

      if (data && data.title && !data.title.includes('Error') && data.title !== "Товар по ссылке") {
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