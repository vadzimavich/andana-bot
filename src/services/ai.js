const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');
const axios = require('axios');

const genAI = config.GEMINI_KEY ? new GoogleGenerativeAI(config.GEMINI_KEY) : null;

// --- ОТЛАДКА: ПОЛУЧИТЬ СПИСОК МОДЕЛЕЙ ---
async function getAvailableModels() {
  if (!config.GEMINI_KEY) return "Нет API ключа";
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.GEMINI_KEY}`;
    const res = await axios.get(url);
    return res.data.models.map(m => m.name).join('\n');
  } catch (e) {
    return `Ошибка Google API: ${e.response?.status} ${e.response?.statusText}\n(Скорее всего, регион сервера заблокирован)`;
  }
}

async function parseReceipt(imageUrl) {
  if (!genAI) return { error: "API Key not configured" };

  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);

    // Используем самую свежую и легкую модель
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
            Проанализируй чек.
            1. Верни общую сумму (total).
            2. Список товаров (items): категория (category), сумма (sum), описание (desc).
            Категории строго из списка: Еда, Дом, Транспорт, Здоровье, Одежда, Уход и красота, Развлечения, Алкоголь, Платежи, Разное.
            Верни ТОЛЬКО JSON. Пример: {"total": 100, "items": [{"category": "Еда", "sum": 100, "desc": "Молоко"}]}
        `;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text().replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Error:", error.message);
    return { error: error.message };
  }
}

async function categorizeText(text) {
  if (!genAI) return null;
  try {
    const prompt = `
            Текст: "${text}".
            Это расход. Определи категорию строго из списка: Еда, Дом, Транспорт, Здоровье, Одежда, Уход и красота, Развлечения, Алкоголь, Платежи, Разное.
            Верни JSON: {"category": "...", "item": "...", "amount": число_если_есть_иначе_null}
        `;
    const textResp = await tryGenerate(prompt);
    const json = textResp.replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

module.exports = { parseReceipt, categorizeText, getAvailableModels };