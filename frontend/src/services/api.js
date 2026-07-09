export const GEMINI_DEFAULT_KEY = import.meta.env.VITE_GEMINI_DEFAULT_KEY || "";
export const GEMINI_DEFAULT_MODEL = import.meta.env.VITE_GEMINI_DEFAULT_MODEL || "gemini-3.1-flash-lite-preview";

export async function generateWordsFromText(text, apiKey, model) {
  const prompt = `Phân tích danh sách từ vựng sau và trả về một mảng JSON (không bọc trong markdown, chỉ trả về chuỗi JSON thuần) chứa các từ vựng. 
Mỗi từ là một object với các key: 'word' (từ gốc tiếng Anh), 'phonetic' (phiên âm IPA), 'meaning' (nghĩa tiếng Việt chi tiết), 'example' (1 câu ví dụ tiếng Anh).
Danh sách từ: ${text}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI. Kiểm tra lại API Key.");

  const data = await response.json();
  let aiText = data.candidates[0].content.parts[0].text;

  // Remove markdown formatting if any
  aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

  const newWords = JSON.parse(aiText);
  if (!Array.isArray(newWords)) throw new Error("Định dạng trả về không hợp lệ");

  return newWords;
}

export async function generateImageForWord(wordStr, imageModel = 'openai/gpt-image-2') {
  const prompt = `A beautiful minimal vector illustration representing the word "${wordStr}", clean background, vibrant colors`;
  if (window.puter && window.puter.ai) {
    const imgElement = await window.puter.ai.txt2img(prompt, { model: imageModel });
    const tempUrl = imgElement.src;

    // Convert temporary URL to persistent Base64 data URL
    try {
      const response = await fetch(tempUrl);
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Base64 conversion failed, falling back to temp URL:', e);
      return tempUrl;
    }
  }
  throw new Error("Puter.js not loaded");
}
