export const GEMINI_DEFAULT_KEY = import.meta.env.VITE_GEMINI_DEFAULT_KEY || "";
export const GEMINI_DEFAULT_MODEL = import.meta.env.VITE_GEMINI_DEFAULT_MODEL || "gemini-3.1-flash-lite-preview";

export async function generateWordsFromText(text, apiKey, model) {
  const prompt = `Phân tích từ vựng và trả về mảng JSON. Format: [{"word":"","phonetic":"","meaning":"","example":""}]. Từ vựng: ${text}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI. Kiểm tra lại API Key.");

  const data = await response.json();
  aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  let depth = 0, inString = false, escape = false, startIndex = aiText.indexOf('['), endIndex = -1;
  if (startIndex !== -1) {
    for (let i = startIndex; i < aiText.length; i++) {
      const char = aiText[i];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (!inString) {
        if (char === '[') depth++;
        else if (char === ']') {
          depth--;
          if (depth === 0) { endIndex = i; break; }
        }
      }
    }
    if (endIndex !== -1) aiText = aiText.substring(startIndex, endIndex + 1);
  }

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
  const wordSummary = wordList.map(w => `${w.word}:${w.meaning}`).join('|');
  const isEasy = difficulty === 'Dễ';
  const c = difficulty === 'Khó' ? 9 : difficulty === 'Trung bình' ? 6 : '3-5';

  const prompt = `Tạo bài kiểm tra TA 3 phần, độ khó:${difficulty}. CHỈ TRẢ VỀ JSON, KHÔNG BÌNH LUẬN.
TỪ VỰNG:${wordSummary}
YÊU CẦU: Dùng mỗi từ >=1 lần.
JSON SCHEMA:
{"listening":{"dialogue":[{"speaker":"Tên","text":"Câu TA"}],"questions":[{"question":"Hỏi nội dung(TA)","options":["A","B","C","D"],"correctIndex":0}]},"speaking":{"situation":"Tình huống(TV)","dialogue":[{"speaker":"Tên/You","text":"Câu TA","isUserTurn":false}]},"reading":[{"word":"Từ gốc","meaning":"Nghĩa TV","newExample":"Câu ví dụ MỚI","options":["TA đúng","TA sai","TA sai","TA sai"],"correctIndex":0}]}
QUY TẮC:
- listening: ${isEasy ? '3-5' : c} câu hỏi.
- speaking: "isUserTurn":true cho user. Tạo ${isEasy ? 'vài' : c} lượt user.
- reading: ${isEasy ? 'Mỗi từ 1' : c} câu ví dụ MỚI. Options GỒM 4 TỪ TA (KHÔNG dùng tiếng Việt).`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI. Kiểm tra lại API Key.");

  const data = await response.json();
  let aiText = data.candidates[0].content.parts[0].text;

  aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  let depth = 0, inString = false, escape = false, startIndex = aiText.indexOf('{'), endIndex = -1;
  if (startIndex !== -1) {
    for (let i = startIndex; i < aiText.length; i++) {
      const char = aiText[i];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (!inString) {
        if (char === '{') depth++;
        else if (char === '}') {
          depth--;
          if (depth === 0) { endIndex = i; break; }
        }
      }
    }
    if (endIndex !== -1) aiText = aiText.substring(startIndex, endIndex + 1);
  }

  const examData = JSON.parse(aiText);

  if (!examData.listening || !examData.speaking || !examData.reading) {
    throw new Error("Gemini trả về dữ liệu không đầy đủ 3 phần kiểm tra.");
  }

  return examData;
}

export async function generateSpeakingScenario(wordList, topicName, apiKey, model) {
  const words = wordList.map(w => w.word).join(', ');
  const prompt = `Create a short English speaking practice scenario for a student about the topic: "${topicName}". 
Try to incorporate some of these words if natural: ${words}.
You are an NPC in this scenario.
Return ONLY JSON with this schema:
{
  "situation": "Short description of the situation in Vietnamese (e.g. Bạn đang ở nhà hàng...)",
  "npc_name": "Name of the NPC (e.g. Waiter, John)",
  "npc_first_line": "The first English sentence spoken by the NPC to start the conversation",
  "npc_first_emotion": "The emotion of the NPC (happy, sad, surprised, thinking, neutral, excited, confused)"
}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI.");
  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

export async function chatWithNPC(recentHistory, apiKey, model) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "You are an English conversational partner for a student. Behave exactly like a real human. Use natural language, conversational fillers (like um, well, ah), occasional slang, and ask engaging questions. Have a distinct personality. DO NOT act like an AI tutor. DO NOT point out grammar or pronunciation mistakes. Keep your response under 3 sentences. Return JSON with schema: { \"text\": \"your english response\", \"emotion\": \"happy|sad|surprised|thinking|neutral|excited|confused\" }" }]
      },
      contents: recentHistory,
      generationConfig: { 
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI.");
  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

export async function evaluateSpeakingPractice(fullHistoryText, apiKey, model) {
  const prompt = `You are a private English tutor. Review the following speaking practice transcript between a student and an NPC. The student's speech was captured via Speech-to-Text (STT), so pronunciation mistakes often appear as incorrect words (e.g., 'sink' instead of 'think').
Identify the student's grammar errors and likely pronunciation weaknesses based on context. 
For pronunciation, identify the specific IPA phonemes the user struggles with. Provide constructive feedback in Vietnamese.
TRANSCRIPT:
${fullHistoryText}

Return ONLY JSON with this schema:
{
  "feedback": "Overall feedback and encouragement in Vietnamese (2-3 sentences)",
  "weaknesses": ["Specific mistake 1 (Vietnamese)", "Specific mistake 2 (Vietnamese)"],
  "phonemesToPractice": [
    {
      "phoneme": "/θ/",
      "reason": "Giải thích chi tiết vì sao phát âm sai từ đó dẫn đến từ sai trong ngữ cảnh (bằng tiếng Việt)"
    }
  ]
}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.5,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI.");
  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}
