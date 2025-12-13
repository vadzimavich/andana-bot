const axios = require('axios');

// Вспомогательная функция для получения даты YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function getRateDiff(curId) {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Запрос на сегодня
    const resToday = await axios.get(`https://api.nbrb.by/exrates/rates/${curId}`);
    const rateToday = resToday.data.Cur_OfficialRate;

    // Запрос на вчера (параметр ondate)
    const resYesterday = await axios.get(`https://api.nbrb.by/exrates/rates/${curId}`, {
      params: { ondate: formatDate(yesterday) }
    });
    const rateYesterday = resYesterday.data.Cur_OfficialRate;

    const diff = rateToday - rateYesterday;
    const sign = diff > 0 ? '+' : ''; // Плюс сам не ставится
    // Округляем до 4 знаков
    const diffStr = diff === 0 ? '' : `(${sign}${diff.toFixed(4)})`;

    return `${rateToday} ${diffStr}`;
  } catch (e) {
    return 'Н/Д';
  }
}

async function getNbrbRates() {
  // 431 - USD, 451 - EUR, 456 - RUB (100 rub)
  const usd = await getRateDiff(431);
  const eur = await getRateDiff(451);

  return `🇺🇸 USD: ${usd}\n🇪🇺 EUR: ${eur}`;
}

// --- WEATHER (То же, что и было, но для полноты файла оставлю) ---
function decodeWeatherCode(code) {
  const codes = {
    0: '☀️ Ясно', 1: '🌤 В основном ясно', 2: '⛅️ Переменная облачность', 3: '☁️ Пасмурно',
    45: '🌫 Туман', 48: '🌫 Туман с инеем', 51: '🌦 Слабая морось', 53: '🌦 Морось',
    55: '🌧 Сильная морось', 61: '☔️ Слабый дождь', 63: '☔️ Дождь', 65: '⛈ Сильный дождь',
    71: '❄️ Слабый снег', 73: '❄️ Снег', 75: '🌨 Сильный снег', 80: '🌦 Ливень (слабый)',
    81: '🌧 Ливень', 82: '⛈ Сильный ливень', 95: '🌩 Гроза', 96: '⛈ Гроза с градом', 99: '⛈ Сильная гроза'
  };
  return codes[code] || '❓ Неизвестно';
}

async function getWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=53.9&longitude=27.56&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=precipitation_probability_max&timezone=Europe%2FMinsk';
    const res = await axios.get(url);
    const current = res.data.current;
    const daily = res.data.daily;

    const desc = decodeWeatherCode(current.weather_code);
    const temp = Math.round(current.temperature_2m);
    const feelsLike = Math.round(current.apparent_temperature);
    const rainChance = daily.precipitation_probability_max[0];

    return `${desc}, ${temp}°C (ощущ. ${feelsLike}°C)\n☔️ Осадки: ${rainChance}%`;
  } catch (e) {
    return 'Не удалось получить погоду';
  }
}

module.exports = { getNbrbRates, getWeather };