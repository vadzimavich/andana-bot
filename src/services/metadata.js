const axios = require('axios');

async function extractMeta(url, msgObject = null, telegramInstance = null) {
  console.log('🔍 Extracting meta for:', url);

  // 1. Если Telegram прислал готовое превью (через наш хак с форвардом)
  if (msgObject?.web_page) {
    const wp = msgObject.web_page;
    console.log('✅ Using Telegram Preview:', wp.title);

    let img = '';
    if (wp.photo && telegramInstance) {
      try {
        const photoObj = wp.photo[wp.photo.length - 1];
        const link = await telegramInstance.getFileLink(photoObj.file_id);
        img = link.href;
      } catch (e) {
        console.log('Could not get photo link from TG');
      }
    }

    return {
      title: wp.title || wp.description || 'Товар',
      image: img,
      url: url
    };
  }

  // 2. Специальный парсер для Wildberries (работает без прокси)
  if (url.includes('wildberries') || url.includes('wb.ru')) {
    try {
      const id = url.match(/catalog\/(\d+)/)?.[1];
      if (id) {
        const { data } = await axios.get(`https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${id}`);
        const p = data.data.products[0];
        return {
          title: `${p.brand} / ${p.name}`,
          image: `https://basket-01.wbbasket.ru/vol${Math.floor(id / 100000)}/part${Math.floor(id / 1000)}/${id}/images/big/1.webp`,
          url
        };
      }
    } catch (e) {
      console.log('WB API failed');
    }
  }

  // 3. Fallback: если ничего не сработало, просто красивое имя из ссылки
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Товар';
  return {
    title: slug.replace(/[-_]/g, ' ').substring(0, 50),
    image: '',
    url
  };
}

module.exports = { extractMeta };