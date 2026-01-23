const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');
const axios = require('axios');

const genAI = config.GEMINI_KEY ? new GoogleGenerativeAI(config.GEMINI_KEY) : null;

// Список моделей для перебора (если одна не сработает)
const MODELS = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro"];

async function tryGenerate(prompt, imagePart = null) {
  if (!genAI) throw new Error("API Key missing");

  let lastError = null;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const content = imagePart ? [prompt, imagePart] : [prompt];

      const result = await model.generateContent(content);
      const response = await result.response;
      return response.text();
    } catch (e) {
      console.warn(`⚠️ Model ${modelName} failed:`, e.message);
      lastError = e;
      // Если ошибка 404 (модель не найдена), пробуем следующую.
      // Если ошибка другая (например, ключ неверный), то нет смысла перебирать.
      if (!e.message.includes('404') && !e.message.includes('not found')) break;
    }
  }
  throw lastError;
}

async function parseReceipt(imageUrl) {
  if (!genAI) return { error: "API Key not configured" };

  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);

    const prompt = `
            Проанализируй чек.
            1. Верни общую сумму (total).
            2. Список товаров (items): категория (category), сумма (sum), описание (desc).
            Категории строго из списка: Еда, Дом, Транспорт, Здоровье, Одежда, Уход и красота, Развлечения, Алкоголь, Платежи, Разное.
            Верни ТОЛЬКО JSON. Пример: {"total": 100, "items": [{"category": "Еда", "sum": 100, "desc": "Молоко"}]}
        `;

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: "image/jpeg",
      },
    };

    const text = await tryGenerate(prompt, imagePart);
    const jsonStr = text.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonStr);

  } catch (error) {
    console.error("Gemini Final Error:", error.message);
    return { error: "Не удалось прочитать чек (AI недоступен)" };
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

module.exports = { parseReceipt, categorizeText };