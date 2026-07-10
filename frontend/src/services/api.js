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

export async function generateExamContent(wordList, apiKey, model, difficulty = 'Trung bình') {
  const wordSummary = wordList.map(w => `"${w.word}" (${w.meaning})`).join(', ');

  const prompt = `Bạn là một giáo viên tiếng Anh. Tôi đưa cho bạn danh sách từ vựng, hãy tạo một bài kiểm tra tiếng Anh gồm 3 phần với độ khó: ${difficulty.toUpperCase()}. Trả về JSON thuần (KHÔNG bọc trong markdown, KHÔNG dùng \`\`\`json).

DANH SÁCH TỪ VỰNG: ${wordSummary}

YÊU CẦU BẮT BUỘC: Mỗi từ vựng PHẢI xuất hiện ít nhất 1 lần trong bài kiểm tra.

Trả về JSON với cấu trúc sau:
{
  "listening": {
    "dialogue": [
      { "speaker": "Tên nhân vật (VD: Alice, Bob)", "text": "Câu thoại tiếng Anh" }
    ],
    "questions": [
      { "question": "Câu hỏi về nội dung đoạn hội thoại (tiếng Anh)", "options": ["A", "B", "C", "D"], "correctIndex": 0 }
    ]
  },
  "speaking": {
    "situation": "Mô tả tình huống hội thoại bằng tiếng Việt",
    "dialogue": [
      { "speaker": "Tên nhân vật hoặc You", "text": "Câu thoại tiếng Anh", "isUserTurn": false }
    ]
  },
  "reading": [
    { "word": "từ vựng gốc", "meaning": "nghĩa tiếng Việt", "newExample": "Câu ví dụ MỚI HOÀN TOÀN có chứa từ vựng này (KHÔNG dùng lại câu ví dụ có sẵn)", "options": ["đáp án đúng", "đáp án sai 1", "đáp án sai 2", "đáp án sai 3"], "correctIndex": 0 }
  ]
}

CHI TIẾT:
- Phần listening: Tạo đoạn hội thoại tự nhiên giữa 2-3 người, sử dụng tất cả từ vựng. Tạo 3-5 câu hỏi trắc nghiệm về nội dung.
- Phần speaking: Tạo tình huống hội thoại 2-3 người. Đánh dấu "isUserTurn": true cho các lượt mà người dùng sẽ đọc. Các lượt còn lại là NPC (isUserTurn: false). Sử dụng các từ vựng trong câu thoại.
- Phần reading: Mỗi từ vựng tạo 1 câu ví dụ HOÀN TOÀN MỚI (khác với câu example có sẵn). Mảng options luôn đặt đáp án đúng ở correctIndex, 3 đáp án sai là các từ vựng khác trong danh sách.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8 }
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI. Kiểm tra lại API Key.");

  const data = await response.json();
  let aiText = data.candidates[0].content.parts[0].text;

  aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

  const examData = JSON.parse(aiText);

  if (!examData.listening || !examData.speaking || !examData.reading) {
    throw new Error("Gemini trả về dữ liệu không đầy đủ 3 phần kiểm tra.");
  }

  return examData;
}
