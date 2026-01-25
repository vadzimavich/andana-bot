const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('../config');
const axios = require('axios');

const genAI = config.GEMINI_KEY ? new GoogleGenerativeAI(config.GEMINI_KEY) : null;

// Используем модель со скрина. 
// Если появится 2.0-flash-lite - переходи на нее, там лимиты обычно выше.
const MODEL_NAME = "gemini-2.5-flash";


// --- ОТЛАДКА ---
async function getAvailableModels() {
  if (!config.GEMINI_KEY) return "Нет API ключа";
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.GEMINI_KEY}`;
    const res = await axios.get(url);
    return res.data.models.map(m => m.name).join('\n');
  } catch (e) {
    return `Ошибка Google API: ${e.response?.status} ${e.response?.statusText}`;
  }
}


async function tryGenerate(prompt, imagePart = null) {
  if (!genAI) throw new Error("API Key missing");
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const content = imagePart ? [prompt, imagePart] : [prompt];
    const result = await model.generateContent(content);
    return result.response.text();
  } catch (e) {
    console.error(`AI Error (${MODEL_NAME}):`, e.message);
    return null; // Возвращаем null при ошибке квоты
  }
}

async function parseReceipt(imageUrl) {
  if (!genAI) return { error: "API Key not configured" };

  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);

    const prompt = `
            Analyze receipt.
            Return JSON: {"total": number, "items": [{"category": "Еда|Дом|Транспорт|Здоровье|Одежда|Уход|Развлечения|Алкоголь|Платежи|Разное", "sum": number, "desc": "string"}]}
        `;

    const text = await tryGenerate(prompt, { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } });
    if (!text) return { error: "Лимит AI исчерпан на сегодня" };

    const jsonStr = text.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    return { error: "Ошибка парсинга" };
  }
}

async function categorizeText(text) {
  // ЭКОНОМИЯ: Сначала пробуем простые словари, чтобы не тратить квоту
  const lower = text.toLowerCase();
  if (lower.match(/пив|вин|водк|коньяк/)) return { category: 'Алкоголь' };
  if (lower.match(/молок|хлеб|яйц|сыр|мяс|куриц|вод/)) return { category: 'Еда' };
  if (lower.match(/бензин|uber|yandex|яндекс|такси|проезд/)) return { category: 'Транспорт' };

  // Если не угадали - идем к AI
  if (!genAI) return null;

  const prompt = `Categorize expense: "${text}". Categories: Еда, Дом, Транспорт, Здоровье, Одежда, Уход, Развлечения, Алкоголь, Платежи, Разное. JSON: {"category": "Name"}`;

  const textResp = await tryGenerate(prompt);
  if (!textResp) return { category: 'Разное' }; // Fallback

  try {
    const json = textResp.replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  } catch (e) { return { category: 'Разное' }; }
}

// Новая фича: Еженедельный аналитик (тратит 1 запрос в неделю!)
async function analyzeFinances(summaryText) {
  if (!genAI) return "Аналитик в отпуске.";
  const prompt = `
        Ты саркастичный финансовый консультант.
        Вот траты семьи за неделю:
        ${summaryText}
        
        Дай краткий (2-3 предложения) комментарий: похвали или поругай.
        Используй emoji.
    `;
  const res = await tryGenerate(prompt);
  return res || "Берегите деньги!";
}

// ВАЖНО: Добавил tryGenerate в экспорт
module.exports = { parseReceipt, categorizeText, analyzeFinances, getAvailableModels, tryGenerate };