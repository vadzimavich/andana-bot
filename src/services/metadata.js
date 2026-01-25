const ogs = require('open-graph-scraper');
const axios = require('axios');

const TELEGRAM_UA = 'TelegramBot (like TwitterBot)';

// LinkPreview API для сложных случаев
async function getLinkPreview(url) {
  try {
    console.log('🔗 Using LinkPreview API');
    const apiUrl = `https://api.linkpreview.net/?q=${encodeURIComponent(url)}`;

    const { data } = await axios.get(apiUrl, {
      headers: {
        'X-Linkpreview-Api-Key': '86613dcec975a263a8042f2ea930ed7c' // Получи на https://www.linkpreview.net/
      },
      timeout: 10000
    });

    console.log('LinkPreview Response:', data.title ? 'OK' : 'Empty');

    if (data.title) {
      return {
        title: data.title.substring(0, 150),
        image: data.image || 'https://via.placeholder.com/400x400/e8e8e8/888888?text=Товар',
        url: url
      };
    }
  } catch (e) {
    console.error('LinkPreview API Error:', e.response?.status || e.message);
  }
  return null;
}

async function extractMeta(url) {
  try {
    console.log('📥 Extracting meta from:', url);

    // Для WB и Ozon сразу используем LinkPreview API
    if (url.includes('wildberries') || url.includes('wb.ru') || url.includes('ozon.')) {
      const marketplace = url.includes('ozon') ? 'Ozon' : 'Wildberries';
      console.log(`🛍 Detected: ${marketplace}`);

      const apiData = await getLinkPreview(url);
      if (apiData) {
        console.log(`✅ ${marketplace} Success via API`);
        return apiData;
      }
      console.log(`⚠️ ${marketplace} API failed, trying fallback`);
    }

    // Для остальных (AliExpress и др.) - Open Graph Scraper
    console.log('🔄 Using Open Graph Scraper');
    const options = {
      url: url,
      timeout: 15000,
      fetchOptions: {
        headers: {
          'User-Agent': TELEGRAM_UA,
          'Accept': 'text/html'
        }
      }
    };

    const { result } = await ogs(options);

    let imageUrl = 'https://via.placeholder.com/400x400/e8e8e8/888888?text=Товар';
    if (result.ogImage) {
      if (Array.isArray(result.ogImage)) {
        imageUrl = result.ogImage[0]?.url || imageUrl;
      } else if (result.ogImage.url) {
        imageUrl = result.ogImage.url;
      }
    }

    let title = result.ogTitle || result.ogDescription || 'Товар';
    title = title
      .replace(/Купить | в интернет-магазине .*/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 150);

    console.log('✅ OGS Success');
    return {
      title: title,
      image: imageUrl,
      url: url
    };

  } catch (e) {
    console.error('❌ Fatal Error:', e.message);

    // Последний шанс - пробуем LinkPreview API
    console.log('🔄 Last resort: LinkPreview API');
    const apiData = await getLinkPreview(url);
    if (apiData) {
      console.log('✅ Recovered via API');
      return apiData;
    }

    return {
      title: 'Товар (не удалось получить данные)',
      image: 'https://via.placeholder.com/400x400/ffcccc/cc0000?text=Ошибка',
      url: url
    };
  }
}

module.exports = { extractMeta };