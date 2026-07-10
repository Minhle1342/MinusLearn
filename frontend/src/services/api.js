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

export async function generateImageForWord(wordStr, apiKeys = {}, apiIndex = 0) {
  const { pixabayApiKey, unsplashApiKey, pexelsApiKey } = apiKeys;

  const providers = [];
  if (pixabayApiKey) providers.push({ id: 'pixabay', key: pixabayApiKey });
  if (unsplashApiKey) providers.push({ id: 'unsplash', key: unsplashApiKey });
  if (pexelsApiKey) providers.push({ id: 'pexels', key: pexelsApiKey });

  if (providers.length === 0) {
    throw new Error("Vui lòng cấu hình ít nhất một API Key (Pixabay, Unsplash hoặc Pexels) trong Cài đặt để tìm ảnh tự động.");
  }
  
  const query = encodeURIComponent(wordStr);

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[(apiIndex + i) % providers.length];

    if (provider.id === 'pixabay') {
      try {
        const url = `https://pixabay.com/api/?key=${provider.key}&q=${query}&image_type=vector&per_page=5`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.hits && data.hits.length > 0) return data.hits[apiIndex % data.hits.length].webformatURL;
          
          const fallbackUrl = `https://pixabay.com/api/?key=${provider.key}&q=${query}&image_type=photo&per_page=5`;
          const fallbackResponse = await fetch(fallbackUrl);
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            if (fallbackData.hits && fallbackData.hits.length > 0) return fallbackData.hits[apiIndex % fallbackData.hits.length].webformatURL;
          }
        }
      } catch (e) {
        console.warn("Pixabay fetch failed:", e);
      }
    } 
    else if (provider.id === 'unsplash') {
      try {
        const url = `https://api.unsplash.com/search/photos?query=${query}&client_id=${provider.key}&per_page=5`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) return data.results[apiIndex % data.results.length].urls.regular;
        }
      } catch (e) {
        console.warn("Unsplash fetch failed:", e);
      }
    }
    else if (provider.id === 'pexels') {
      try {
        const url = `https://api.pexels.com/v1/search?query=${query}&per_page=5`;
        const response = await fetch(url, { headers: { Authorization: provider.key } });
        if (response.ok) {
          const data = await response.json();
          if (data.photos && data.photos.length > 0) return data.photos[apiIndex % data.photos.length].src.large;
        }
      } catch (e) {
        console.warn("Pexels fetch failed:", e);
      }
    }
  }

  return null;
}

export async function generateExamContent(wordList, apiKey, model, difficulty = 'Trung bình') {
  const wordSummary = wordList.map(w => `"${w.word}" (${w.meaning})`).join(', ');

  let listeningDetail = "- Phần listening: Tạo đoạn hội thoại tự nhiên giữa 2-3 người, sử dụng tất cả từ vựng. Tạo 3-5 câu hỏi trắc nghiệm về nội dung.";
  let speakingDetail = "- Phần speaking: Tạo tình huống hội thoại 2-3 người. Đánh dấu \"isUserTurn\": true cho các lượt mà người dùng sẽ đọc. Các lượt còn lại là NPC (isUserTurn: false). Sử dụng các từ vựng trong câu thoại.";
  let readingDetail = "- Phần reading: Mỗi từ vựng tạo 1 câu ví dụ HOÀN TOÀN MỚI (khác với câu example có sẵn). Mảng options bao gồm 4 TỪ VỰNG TIẾNG ANH (tuyệt đối không dùng nghĩa tiếng Việt), trong đó luôn đặt từ vựng đúng ở correctIndex, 3 đáp án sai là các TỪ VỰNG TIẾNG ANH khác trong danh sách.";

  if (difficulty === 'Trung bình') {
    listeningDetail = "- Phần listening: Tạo đoạn hội thoại tự nhiên, sử dụng từ vựng. TẠO CHÍNH XÁC 6 CÂU HỎI trắc nghiệm về nội dung.";
    speakingDetail = "- Phần speaking: Tạo tình huống hội thoại. Đánh dấu \"isUserTurn\": true cho các lượt người dùng đọc. TẠO CHÍNH XÁC 6 LƯỢT CỦA NGƯỜI DÙNG.";
    readingDetail = "- Phần reading: Tạo CHÍNH XÁC 6 câu ví dụ MỚI. Nếu danh sách từ vựng ít hơn 6, HÃY LẶP LẠI từ vựng. Mảng options bao gồm 4 TỪ VỰNG TIẾNG ANH (không dùng nghĩa tiếng Việt), từ vựng đúng ở correctIndex.";
  } else if (difficulty === 'Khó') {
    listeningDetail = "- Phần listening: Tạo đoạn hội thoại tự nhiên, sử dụng từ vựng. TẠO CHÍNH XÁC 9 CÂU HỎI trắc nghiệm về nội dung.";
    speakingDetail = "- Phần speaking: Tạo tình huống hội thoại. Đánh dấu \"isUserTurn\": true cho các lượt người dùng đọc. TẠO CHÍNH XÁC 9 LƯỢT CỦA NGƯỜI DÙNG.";
    readingDetail = "- Phần reading: Tạo CHÍNH XÁC 9 câu ví dụ MỚI. Nếu danh sách từ vựng ít hơn 9, HÃY LẶP LẠI từ vựng. Mảng options bao gồm 4 TỪ VỰNG TIẾNG ANH (không dùng nghĩa tiếng Việt), từ vựng đúng ở correctIndex.";
  }

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
    { "word": "từ vựng gốc", "meaning": "nghĩa tiếng Việt", "newExample": "Câu ví dụ MỚI HOÀN TOÀN có chứa từ vựng này (KHÔNG dùng lại câu ví dụ có sẵn)", "options": ["từ tiếng Anh đúng", "từ tiếng Anh sai 1", "từ tiếng Anh sai 2", "từ tiếng Anh sai 3"], "correctIndex": 0 }
  ]
}

CHI TIẾT:
${listeningDetail}
${speakingDetail}
${readingDetail}`;

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
