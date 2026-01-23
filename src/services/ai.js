const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');
const axios = require('axios');

const genAI = config.GEMINI_KEY ? new GoogleGenerativeAI(config.GEMINI_KEY) : null;

async function parseReceipt(imageUrl) {
  if (!genAI) return { error: "API Key not configured" };

  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);

    // Используем gemini-1.5-flash, если не выйдет - gemini-pro-vision (для картинок)
    // В бесплатном тарифе сейчас стабильна gemini-1.5-flash
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
    console.error("Gemini Error:", error.message); // Логируем только сообщение

    // Попытка fallback на другую модель, если 404
    if (error.message.includes('404') || error.message.includes('not found')) {
      return { error: "Модель AI недоступна. Попробуйте позже или введите вручную." };
    }
    return { error: "Не удалось прочитать чек" };
  }
}

async function categorizeText(text) {
  if (!genAI) return null;
  try {
    // Для текста используем ту же модель
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
            Текст: "${text}".
            Это расход. Определи категорию строго из списка: Еда, Дом, Транспорт, Здоровье, Одежда, Уход и красота, Развлечения, Алкоголь, Платежи, Разное.
            Верни JSON: {"category": "...", "item": "...", "amount": число_если_есть_иначе_null}
        `;
    const result = await model.generateContent(prompt);
    const json = result.response.text().replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  } catch (e) {
    console.error("AI Text Error:", e.message);
    return null;
  }
}

module.exports = { parseReceipt, categorizeText };