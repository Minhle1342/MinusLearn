import { serializeWritingVisualsForAI, validateWritingVisuals } from '../utils/writingVisuals';
import {
  calculateOverallWritingBand,
  normalizeExamWritingEvaluation,
  validateExamWritingContent,
} from '../utils/examWriting';

export const GEMINI_DEFAULT_KEY = import.meta.env.VITE_GEMINI_DEFAULT_KEY || "";
export const GEMINI_DEFAULT_MODEL = import.meta.env.VITE_GEMINI_DEFAULT_MODEL || "gemini-3.1-flash-lite-preview";

export async function explainReadingAnswer({ sentence, word, isCorrect, selectedOption }, apiKey, model) {
  const prompt = `Bạn là một giáo viên tiếng Anh. Học sinh đang làm bài tập điền từ vào chỗ trống.
Câu: "${sentence}"
Học sinh đã chọn đáp án: "${selectedOption}" (đây là đáp án ${isCorrect ? 'đúng' : 'sai'}).
Hãy giải thích ngắn gọn (1-2 câu tiếng Việt) tại sao đáp án này lại đúng/sai trong ngữ cảnh của câu. Nếu sai, hãy giải thích nghĩa của đáp án đúng (${word}) để làm rõ.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey || GEMINI_DEFAULT_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.7,
        responseMimeType: "text/plain"
      }
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI.");
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

export async function explainIeltsReadingAnswer(passage, question, correctAnswer, apiKey, model) {
  const prompt = `Bạn là một giáo viên tiếng Anh IELTS.
Đoạn văn (Passage): "${passage}"
Câu hỏi: "${question}"
Đáp án đúng: "${correctAnswer}"
Hãy trích dẫn câu chứa đáp án trong đoạn văn và giải thích bằng tiếng Việt (2-3 câu) tại sao đáp án này là đúng dựa vào thông tin trong đoạn văn.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey || GEMINI_DEFAULT_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.7,
        responseMimeType: "text/plain"
      }
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI.");
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

export async function generateWordsFromText(text, apiKey, model) {
  const prompt = `Phân tích từ vựng và trả về mảng JSON. Format: [{"word":"","phonetic":"","meaning":"","example":""}]. Từ vựng: ${text}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey || GEMINI_DEFAULT_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (!response.ok) throw new Error("Lỗi kết nối AI. Kiểm tra lại API Key.");

  const data = await response.json();
  let aiText = data.candidates[0].content.parts[0].text;
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
{"listening":{"dialogue":[{"speaker":"Tên","text":"Câu TA"}],"questions":[{"question":"Hỏi nội dung(TA)","questionTranslation":"Dịch nghĩa câu hỏi và bối cảnh (TV)","options":["A","B","C","D"],"correctIndex":0}]},"speaking":{"situation":"Tình huống(TV)","dialogue":[{"speaker":"Tên/You","text":"Câu TA","isUserTurn":false}]},"reading":[{"word":"Từ gốc","meaning":"Nghĩa TV","newExample":"Câu ví dụ MỚI","options":["TA đúng","TA sai","TA sai","TA sai"],"correctIndex":0}]}
QUY TẮC:
- listening: ${isEasy ? '3-5' : c} câu hỏi.
- speaking: "isUserTurn":true cho user. Tạo ${isEasy ? 'vài' : c} lượt user.
- reading: ${isEasy ? 'Mỗi từ 1' : c} câu ví dụ MỚI. Options GỒM 4 TỪ TA (KHÔNG dùng tiếng Việt).`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey || GEMINI_DEFAULT_KEY}`, {
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

const EXAM_WRITING_SYSTEM_INSTRUCTION = `You are an IELTS Academic Writing test writer.
Create one original IELTS Academic Writing test. Do not copy official Cambridge/IELTS sample questions.
Return ONLY one JSON object:
{
  "instructions": "Short Vietnamese instruction for the candidate",
  "rubricWeights": { "task1": 1, "task2": 2 },
  "tasks": [
    {
      "taskType": "1",
      "timeMinutes": 20,
      "minWords": 150,
      "prompt": "Standard IELTS Academic Task 1 prompt",
      "visuals": [<one visual>]
    },
    {
      "taskType": "2",
      "timeMinutes": 40,
      "minWords": 250,
      "prompt": "Standard IELTS Academic Task 2 prompt"
    }
  ]
}
Task 1 visual may be one of these existing app schemas:
- line/bar: {"id","type":"line|bar","title","unit","xKey","series":[{"key","name"}],"data":[{...}]}
- pie: {"id","type":"pie","title","unit","nameKey","valueKey","data":[{...}]}
- table: {"id","type":"table","title","columns":["..."],"rows":[["..."]]}
- diagram: {"id","type":"diagram","title","layout":"linear|cycle|branch","nodes":[{"id","label","detail","role":"input|process|output","row","column"}],"edges":[{"from","to","label"}]}
- map: {"id","type":"map","title","baseFeatures":[],"states":[{"id","label","features":[]}],"legend":[{"category","label"}]}
Map feature shapes:
- area: {"id","kind":"area","category","label","points":[[x,y]]}
- building: {"id","kind":"building","category","label","x","y","width","height"}
- route: {"id","kind":"route","category","label","points":[[x,y]]}
- marker: {"id","kind":"marker","category","label","x","y"}
Rules:
- Use Academic Writing only, not General Training letters.
- Task 1 prompt and visual must match exactly.
- Use 2-4 data series or categories for charts/tables.
- Diagram max 12 nodes and 16 edges. Branch nodes need row/column 0-5.
- Map has 2-3 states, coordinates 0-100, max 20 features per state including base features.
- Do not include colors, SVG, HTML, URLs, base64, or image data.`;

export async function generateExamWritingContent({ wordList = [], topicName = 'General', difficulty = 'Trung bình' }, apiKey, model) {
  const wordSummary = wordList
    .slice(0, 12)
    .map(w => `${w.word}:${w.meaning}`)
    .join('|');
  const prompt = `Topic: ${topicName || 'General'}
Difficulty label: ${difficulty}
Optional vocabulary context: ${wordSummary || 'None'}
Generate the full IELTS Academic Writing test now.`;

  const result = await callGeminiJson({
    apiKey,
    model,
    systemInstruction: EXAM_WRITING_SYSTEM_INSTRUCTION,
    prompt,
    generationConfig: { temperature: 0.8 },
  });

  const validation = validateExamWritingContent(result);
  if (!validation.valid) {
    throw new Error(`AI trả về bài Writing không hợp lệ: ${validation.error}`);
  }

  return {
    instructions: result.instructions || 'Hoàn thành Task 1 và Task 2 trong 60 phút.',
    rubricWeights: { task1: 1, task2: 2, ...(result.rubricWeights || {}) },
    tasks: result.tasks,
  };
}

const EXAM_WRITING_EVALUATION_SYSTEM_INSTRUCTION = `You are a strict senior IELTS Writing examiner.
Evaluate IELTS Academic Writing Task 1 and Task 2 using official IELTS Writing criteria:
- Task Achievement for Task 1 / Task Response for Task 2
- Coherence & Cohesion
- Lexical Resource
- Grammatical Range & Accuracy
Task 2 carries twice the weight of Task 1.
Return ONLY one JSON object:
{
  "task1Band": <number>,
  "task2Band": <number>,
  "overallWritingBand": <number>,
  "taskReports": [
    {
      "taskType": "1",
      "criteria": [
        {"name":"Task Achievement","band":<number>,"comment":"Vietnamese"},
        {"name":"Coherence & Cohesion","band":<number>,"comment":"Vietnamese"},
        {"name":"Lexical Resource","band":<number>,"comment":"Vietnamese"},
        {"name":"Grammatical Range & Accuracy","band":<number>,"comment":"Vietnamese"}
      ]
    },
    {
      "taskType": "2",
      "criteria": [
        {"name":"Task Response","band":<number>,"comment":"Vietnamese"},
        {"name":"Coherence & Cohesion","band":<number>,"comment":"Vietnamese"},
        {"name":"Lexical Resource","band":<number>,"comment":"Vietnamese"},
        {"name":"Grammatical Range & Accuracy","band":<number>,"comment":"Vietnamese"}
      ]
    }
  ],
  "summary": "Vietnamese overall feedback",
  "strengths": ["Vietnamese"],
  "weaknesses": ["Vietnamese"],
  "highlights": [{"taskType":"1|2","text":"exact essay substring","type":"grammar|clarity|lexical|cohesion|task","explanation":"Vietnamese","rewrites":["..."]}],
  "upgradedRewrites": [{"taskType":"1|2","original":"exact sentence","upgraded":"higher-band rewrite","explanation":"Vietnamese"}]
}
Rules:
- Bands must be multiples of 0.5 from 0 to 9.
- Penalize responses under 150 words for Task 1 and under 250 words for Task 2.
- Give concise Vietnamese feedback.`;

export async function evaluateExamWritingSubmission({ tasks, answers }, apiKey, model) {
  const task1 = tasks?.[0] || {};
  const task2 = tasks?.[1] || {};
  const task1VisualSummary = serializeWritingVisualsForAI(task1.visuals);
  const userPrompt = `TASK 1 PROMPT:
${task1.prompt || ''}

TASK 1 VISUAL SUMMARY:
${task1VisualSummary || 'No visual summary'}

TASK 1 ESSAY:
${answers?.[0] || ''}

TASK 2 PROMPT:
${task2.prompt || ''}

TASK 2 ESSAY:
${answers?.[1] || ''}

Evaluate both tasks now.`;

  const result = await callGeminiJson({
    apiKey,
    model,
    systemInstruction: EXAM_WRITING_EVALUATION_SYSTEM_INSTRUCTION,
    prompt: userPrompt,
    generationConfig: { temperature: 0.2 },
  });

  const normalized = normalizeExamWritingEvaluation(result);
  return {
    ...normalized,
    overallWritingBand: normalized.overallWritingBand
      || calculateOverallWritingBand(normalized.task1Band, normalized.task2Band),
  };
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

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey || GEMINI_DEFAULT_KEY}`, {
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
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey || GEMINI_DEFAULT_KEY}`, {
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

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey || GEMINI_DEFAULT_KEY}`, {
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

export async function generateIELTSReadingTest(wordList, difficulty, apiKey, model) {
  const wordSummary = wordList.map(w => `${w.word}:${w.meaning}`).join(' | ');
  
  const systemInstruction = `You are an IELTS Academic Reading examiner.
Generate a Mini IELTS Reading test (1 passage, 13-14 questions).
The reading passage MUST be academic and roughly 600-800 words.
Incorporate as many of these words as possible naturally: ${wordSummary}.

Questions should include a mix of:
- multiple_choice
- true_false_not_given
- gap_fill

Return ONLY one JSON object with this exact schema:
{
  "title": "Passage Title",
  "passage": "Passage text...",
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "text": "Question text...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Vietnamese explanation of why this is correct based on the passage"
    },
    {
      "id": 2,
      "type": "true_false_not_given",
      "text": "Statement...",
      "options": ["True", "False", "Not Given"],
      "correctAnswer": "True",
      "explanation": "Vietnamese explanation"
    },
    {
      "id": 3,
      "type": "gap_fill",
      "text": "Sentence with ____ blank...",
      "options": [],
      "correctAnswer": "exact word(s) from passage",
      "explanation": "Vietnamese explanation"
    }
  ]
}
Do NOT include Markdown formatting outside the JSON block.`;

  const prompt = `Topic difficulty: ${difficulty}. Generate the Mini IELTS Reading test now.`;

  const result = await callGeminiJson({
    apiKey,
    model,
    systemInstruction,
    prompt,
    generationConfig: { temperature: 0.8 },
  });

  return result;
}

export async function generateIELTSListeningTest(wordList, difficulty, apiKey, model) {
  const wordSummary = wordList.map(w => `${w.word}:${w.meaning}`).join(' | ');
  
  const systemInstruction = `You are an IELTS Academic Listening examiner.
Generate a Mini IELTS Listening test (1 section, roughly 10-15 questions).
The audio transcript MUST be an academic monologue (similar to Part 4) and roughly 500-700 words.
Incorporate as many of these words as possible naturally: ${wordSummary}.

Questions should include a mix of:
- multiple_choice
- gap_fill

Return ONLY one JSON object with this exact schema:
{
  "title": "Transcript Title",
  "transcript": "Full text of the monologue to be spoken by TTS...",
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "text": "Question text...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "answerSentence": "Exact sentence from the transcript containing the answer (must be an exact substring)",
      "hint": "A helpful hint for the user in Vietnamese without revealing the exact answer",
      "explanation": "Vietnamese explanation of why this is correct based on the transcript"
    },
    {
      "id": 2,
      "type": "gap_fill",
      "text": "Sentence with ____ blank...",
      "options": [],
      "correctAnswer": "exact word(s) from transcript",
      "answerSentence": "Exact sentence from the transcript containing the answer (must be an exact substring)",
      "hint": "A helpful hint for the user in Vietnamese without revealing the exact answer",
      "explanation": "Vietnamese explanation"
    }
  ]
}
Do NOT include Markdown formatting outside the JSON block.`;

  const prompt = `Topic difficulty: ${difficulty}. Generate the Mini IELTS Listening test now.`;

  const result = await callGeminiJson({
    apiKey,
    model,
    systemInstruction,
    prompt,
    generationConfig: { temperature: 0.8 },
  });

  return result;
}

// ─── Writing Practice AI Functions ───────────────────────────

/**
 * Internal helper — calls Gemini and parses a JSON response.
 * Static systemInstruction is placed first for prompt-prefix caching.
 */
async function callGeminiJson({ apiKey, model, systemInstruction, prompt, generationConfig = {} }) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      ...generationConfig,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model || GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey || GEMINI_DEFAULT_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Lỗi kết nối AI. Kiểm tra lại API Key.');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI không trả về nội dung.');
  return JSON.parse(text);
}

const TASK1_DIAGRAM_SYSTEM_INSTRUCTION = `You are an IELTS Academic Writing Task 1 examiner and information-design specialist.
Generate one realistic process-diagram task. Return ONLY one JSON object with this shape:
{
  "prompt": "Standard IELTS Academic Task 1 instruction",
  "topic": "Short topic label",
  "visuals": [{
    "id": "diagram-1",
    "type": "diagram",
    "title": "Diagram title",
    "layout": "linear|cycle|branch",
    "nodes": [{ "id": "step-1", "label": "Short label", "detail": "Short optional detail", "role": "input|process|output", "row": 0, "column": 0 }],
    "edges": [{ "from": "step-1", "to": "step-2", "label": "Short optional transition" }]
  }]
}
Rules:
- Create 5-10 nodes and no more than 16 edges.
- Every edge must reference an existing node; ids and branch positions must be unique.
- Use linear for a sequence, cycle for a repeating natural process, and branch only when the process genuinely splits or merges.
- For branch, every node must include integer row and column values from 0 to 5. For linear/cycle, omit row and column.
- Keep labels under 8 words and details under 20 words. Do not include colors, HTML, SVG, URLs, or image data.
- The written prompt and visual must describe exactly the same process.`;

const TASK1_MAP_SYSTEM_INSTRUCTION = `You are an IELTS Academic Writing Task 1 examiner and schematic-map designer.
Generate one realistic map-comparison task. Return ONLY one JSON object with this shape:
{
  "prompt": "Standard IELTS Academic Task 1 instruction",
  "topic": "Short topic label",
  "visuals": [{
    "id": "map-1",
    "type": "map",
    "title": "Map title",
    "baseFeatures": [],
    "states": [{ "id": "state-1", "label": "Year or period", "features": [] }],
    "legend": [{ "category": "water", "label": "Water" }]
  }]
}
Each feature must use exactly one of these shapes:
- area: { "id", "kind":"area", "category", "label", "points":[[x,y], ...] }
- building: { "id", "kind":"building", "category", "label", "x", "y", "width", "height" }
- route: { "id", "kind":"route", "category", "label", "points":[[x,y], ...] }
- marker: { "id", "kind":"marker", "category", "label", "x", "y" }
Rules:
- Provide 2-3 states of the same place and the same 0-100 coordinate system.
- Put only unchanged features in baseFeatures; each state contains its own changed or unique features.
- Common features plus each state's features must total no more than 20.
- Allowed categories: water, green, farmland, residential, commercial, industrial, civic, road, rail, path, other.
- Use at least four meaningful changes and short labels of no more than three words.
- All coordinates must remain within 0-100. Areas need at least 3 points; routes need at least 2.
- Legend categories must be unique and must use the allowed list.
- Do not include colors, HTML, SVG, URLs, or image data. The written prompt and maps must match exactly.`;

/**
 * Generate an IELTS Task 1 process diagram or map without touching chart generation.
 */
export async function generateTask1SpatialPrompt(
  { topicName, bandTarget, wordHints = [], visualKind },
  apiKey,
  model
) {
  if (visualKind !== 'diagram' && visualKind !== 'map') {
    throw new Error('Dạng visual Task 1 không được hỗ trợ.');
  }

  const hints = wordHints.slice(0, 8).join(', ');
  const languageRequirement = bandTarget <= 5.0
    ? 'Write the prompt bilingually: English first, then Vietnamese on a new line.'
    : 'Write the prompt in English only.';
  const prompt = `Visual kind: ${visualKind}
Topic area: ${topicName || 'General'}
Target band: ${bandTarget}
Prompt language: ${languageRequirement}
${hints ? `Optional vocabulary context: ${hints}` : ''}
Generate the task now.`;

  const result = await callGeminiJson({
    apiKey,
    model,
    systemInstruction: visualKind === 'diagram'
      ? TASK1_DIAGRAM_SYSTEM_INSTRUCTION
      : TASK1_MAP_SYSTEM_INSTRUCTION,
    prompt,
    generationConfig: { temperature: 0.8 },
  });

  if (!validWritingPromptResult(result)) {
    throw new Error('AI không trả về đề Task 1 hợp lệ. Vui lòng tạo lại.');
  }
  const validation = validateWritingVisuals(result.visuals, visualKind);
  if (!validation.valid) {
    throw new Error(`AI trả về visual không hợp lệ: ${validation.error}`);
  }
  return result;
}

function validWritingPromptResult(result) {
  return result && typeof result === 'object'
    && typeof result.prompt === 'string' && result.prompt.trim().length > 0
    && Array.isArray(result.visuals);
}

/**
 * Generate an IELTS Writing prompt.
 * @param {{ topicName: string, taskType: '1'|'2', bandTarget: number, wordHints: string[] }} opts
 */
export async function generateWritingPrompt({ topicName, taskType, bandTarget, wordHints = [] }, apiKey, model) {
  const hints = wordHints.slice(0, 15).join(', ');

  const systemInstruction = `You are an IELTS Writing examiner. Generate a realistic IELTS Writing Task ${taskType} prompt.
${bandTarget <= 5.0 ? 'Because the target band is for beginners, you MUST provide the "prompt" bilingually (English on top, Vietnamese below it, separated by a newline).' : ''}
Return ONLY a JSON object with this exact schema:
{
  "prompt": "The full exam prompt (bilingual if requested)",
  "topic": "Short topic label"${taskType === '1' ? `,
  "visuals": [
    // Array of at least 1 chart/table data object for Task 1
    // For line/bar: { "id": "...", "type": "line"|"bar", "title": "...", "unit": "...", "xKey": "...", "series": [{ "key": "...", "name": "..." }], "data": [{...}] }
    // For pie: { "type": "pie", "title": "...", "nameKey": "...", "valueKey": "...", "unit": "...", "data": [{...}] }
    // For table: { "type": "table", "title": "...", "columns": ["...", "..."], "rows": [["...", "..."]] }
  ]` : ''}
}
Do NOT add any explanation outside the JSON.`;

  const prompt = `Topic area: ${topicName || 'General'}
Target band: ${bandTarget}
${hints ? `Try to relate to these vocabulary words if natural: ${hints}` : ''}
Generate one IELTS Writing Task ${taskType} prompt now.`;

  const result = await callGeminiJson({
    apiKey, model, systemInstruction, prompt,
    generationConfig: { temperature: 0.9 },
  });

  if (taskType === '1' && (!result.visuals || result.visuals.length === 0)) {
    throw new Error('AI không sinh ra dữ liệu biểu đồ cho Task 1.');
  }
  return result;
}

/**
 * Analyze a writing prompt — returns outline suggestions and useful vocabulary.
 */
export async function analyzeWritingPrompt({ prompt, taskType, bandTarget, visuals }, apiKey, model) {
  const systemInstruction = `You are an IELTS Writing tutor. Analyze the given prompt and provide a structured outline and useful vocabulary.
${bandTarget <= 5.0 ? 'Because the target band is for beginners, EVERY item in the "suggestedVocab" array MUST be bilingual in the format: "English word/phrase - Vietnamese meaning".' : ''}
Return ONLY JSON with this schema:
{
  "outline": ["Point 1", "Point 2", "..."],
  "suggestedVocab": ["word/phrase 1", "word/phrase 2", "..."],
  "tips": "One short paragraph of strategic advice in Vietnamese"
}`;

  const visualSummary = serializeWritingVisualsForAI(visuals);
  const userPrompt = `Task ${taskType} | Target band: ${bandTarget}
Prompt: ${prompt}
${visualSummary ? `\nVisual Data:\n${visualSummary}\n` : ''}
Analyze this prompt now.`;

  return callGeminiJson({
    apiKey, model, systemInstruction, prompt: userPrompt,
    generationConfig: { temperature: 0.3 },
  });
}

/**
 * Evaluate a submitted IELTS essay against Cambridge band descriptors.
 * Only sends the prompt, outline (short), and essay — no history.
 */
export async function evaluateWritingSubmission({ prompt, outline, essay, taskType, bandTarget, visuals }, apiKey, model) {
  const systemInstruction = `You are a senior IELTS Writing examiner. Evaluate the essay strictly following Cambridge IELTS band descriptors.

Return ONLY JSON with this exact schema:
{
  "overallBand": <number>,
  "criteria": [
    { "name": "Task Response", "band": <number>, "comment": "<Vietnamese>" },
    { "name": "Coherence & Cohesion", "band": <number>, "comment": "<Vietnamese>" },
    { "name": "Lexical Resource", "band": <number>, "comment": "<Vietnamese>" },
    { "name": "Grammar Range & Accuracy", "band": <number>, "comment": "<Vietnamese>" }
  ],
  "summary": "<Overall feedback in Vietnamese, 2-3 sentences>",
  "strengths": ["<strength in Vietnamese>"],
  "weaknesses": ["<weakness in Vietnamese>"],
  "highlights": [
    {
      "text": "<exact substring from the essay that has an issue>",
      "type": "grammar|clarity|lexical|cohesion",
      "explanation": "<explanation in Vietnamese>",
      "rewrites": ["<rewrite option 1>", "<rewrite option 2>"]
    }
  ],
  "upgradedRewrites": [
    {
      "original": "<original sentence>",
      "upgraded": "<band-upgraded version>",
      "explanation": "<why this is better, in Vietnamese>"
    }
  ]
}

Rules:
- "highlights" should contain 5-15 items covering the most important issues.
- Each "rewrites" array has at most 2-3 options.
- "upgradedRewrites" should have 2-3 standout sentences that could be elevated to a higher band.
- All comments, explanations, summary, strengths, weaknesses in Vietnamese.
- Band scores are multiples of 0.5 (e.g. 5.0, 5.5, 6.0, ..., 9.0).`;

  const visualSummary = serializeWritingVisualsForAI(visuals);
  const userPrompt = `Task Type: IELTS Writing Task ${taskType}
Target Band: ${bandTarget}

PROMPT:
${prompt}

${visualSummary ? `VISUAL DATA:\n${visualSummary}\n\n` : ''}${outline ? `STUDENT'S OUTLINE:\n${outline}\n` : ''}STUDENT'S ESSAY:
${essay}

Evaluate this essay now.`;

  return callGeminiJson({
    apiKey, model, systemInstruction, prompt: userPrompt,
    generationConfig: { temperature: 0.2 },
  });
}

export async function translateTranscriptChunks(chunksText, apiKey, model) {
  const systemInstruction = `You are a professional English-Vietnamese translator.
Translate the following video transcript chunks from English to Vietnamese.
The input will be a JSON array of objects with "text" (English).
You must return a JSON array of strings, where each string is the Vietnamese translation corresponding to the input chunk in the exact same order.
Make the translation sound natural in the context of a video transcript.
Return ONLY a JSON array of strings.`;

  const prompt = `Translate these chunks:
${chunksText}`;

  const result = await callGeminiJson({
    apiKey,
    model,
    systemInstruction,
    prompt,
    generationConfig: { temperature: 0.3 },
  });

  return result;
}
