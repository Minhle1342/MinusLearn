from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from ..config import Settings
from ..schemas import MascotChatResponse


ALLOWED_EMOTIONS = {
    "neutral", "happy", "excited", "thinking", "confused", "concerned", "proud"
}
ALLOWED_SKILLS = {
    "general",
    "mistake_explanation",
    "sentence_correction",
    "vocabulary",
    "grammar",
    "roleplay",
    "skill_coaching",
    "study_plan",
    "review_coach",
}
ALLOWED_PAGES = {
    "vocabulary", "listening", "reading", "speaking", "writing", "exam", "review",
    "bilingual-video", "video-detail",
}
MAX_HISTORY_MESSAGES = 30
MAX_CONTEXT_WORDS = 8

SKILL_CONTRACTS = {
    "general": "Answer the English-learning request directly. If it is ambiguous, ask one short clarifying question.",
    "mistake_explanation": "Use the exact question, userAnswer, and correctAnswer from the event. In Vietnamese: state the correction gently, explain one real rule, then give one tiny retry. Do not invent a rule.",
    "sentence_correction": "In Vietnamese, use exactly three short parts: 'Sửa:', 'Lý do:', and 'Tự kiểm tra:'. Keep the corrected English sentence unchanged inside the explanation.",
    "vocabulary": "Teach only one word at a time. Give its Vietnamese meaning, one collocation, one natural English example, then one recall question.",
    "grammar": "In simple Vietnamese, explain one rule, show one wrong/correct contrast, then ask one check question.",
    "roleplay": "Answer entirely in English as the other person in the scene. Use 1-2 natural sentences, at most 30 words, and end with exactly one question. No coaching or stage directions.",
    "skill_coaching": "Coach the skill on the current page in Vietnamese. Use only supplied text/event evidence and give one short practice step. Transcript feedback is not acoustic feedback.",
    "study_plan": "In Vietnamese, create one 5-minute mission with no more than 3 concrete steps. A timed response must stay under 30 words.",
    "review_coach": "Use the exact due/mistake data. Quiz one supplied word at a time. For a timed response, mention the real due count and ask one question in under 30 words.",
}

DEFAULT_QUICK_REPLIES = {
    "general": ["Hỏi tiếp", "Luyện 5 phút"],
    "mistake_explanation": ["Cho ví dụ tương tự", "Cho mình thử lại"],
    "sentence_correction": ["Cho thêm ví dụ", "Luyện câu tương tự"],
    "vocabulary": ["Cho ví dụ khác", "Kiểm tra mình"],
    "grammar": ["Cho ví dụ dễ hơn", "Cho mình một câu hỏi"],
    "roleplay": ["Continue", "Change scenario", "End role-play"],
    "skill_coaching": ["Giải thích kỹ hơn", "Cho bài luyện ngắn"],
    "study_plan": ["Bắt đầu ngay", "Đổi nhiệm vụ"],
    "review_coach": ["Kiểm tra mình", "Mở phần ôn tập"],
}

SKILL_EXAMPLES = {
    "general": (
        {"trigger": "user", "selectedSkill": "general", "message": "Mình nên bắt đầu học thế nào?", "learningContext": {"page": "vocabulary"}},
        {"text": "Hãy bắt đầu thật nhỏ: chọn 3 từ, đọc ví dụ và tự đặt một câu cho mỗi từ. Bạn muốn học theo chủ đề nào?", "language": "vi", "emotion": "happy", "skill": "general", "quickReplies": ["Travel", "Work"], "action": None},
    ),
    "mistake_explanation": (
        {"trigger": "user", "selectedSkill": "mistake_explanation", "message": "Vì sao mình sai?", "learningContext": {"event": {"type": "wrong_answer", "question": "Yesterday she ___ home.", "userAnswer": "go", "correctAnswer": "went"}}},
        {"text": "Bạn dùng ‘go’, nhưng đáp án là ‘went’ vì ‘yesterday’ yêu cầu quá khứ đơn. Câu đúng: ‘Yesterday she went home.’ Thử nhé: Yesterday I ___ to school.", "language": "vi", "emotion": "thinking", "skill": "mistake_explanation", "quickReplies": ["Cho ví dụ tương tự", "Cho mình thử lại"], "action": None},
    ),
    "sentence_correction": (
        {"trigger": "user", "selectedSkill": "sentence_correction", "message": "Please correct: She go to school yesterday.", "learningContext": {"page": "writing"}},
        {"text": "Sửa: She went to school yesterday.\nLý do: ‘Yesterday’ cần quá khứ đơn, nên ‘go’ đổi thành ‘went’.\nTự kiểm tra: They ___ to school yesterday.", "language": "vi", "emotion": "thinking", "skill": "sentence_correction", "quickReplies": ["Cho thêm ví dụ", "Luyện câu tương tự"], "action": None},
    ),
    "vocabulary": (
        {"trigger": "user", "selectedSkill": "vocabulary", "message": "Dạy mình từ itinerary", "learningContext": {"focusWords": [{"word": "itinerary", "meaning": "lịch trình", "example": "Our itinerary is full."}]}},
        {"text": "‘Itinerary’ nghĩa là ‘lịch trình’. Cụm hay dùng: ‘travel itinerary’. Ví dụ: ‘I emailed our travel itinerary.’ Kiểm tra nhé: itinerary nghĩa là gì?", "language": "vi", "emotion": "happy", "skill": "vocabulary", "quickReplies": ["Cho ví dụ khác", "Kiểm tra mình"], "action": None},
    ),
    "grammar": (
        {"trigger": "user", "selectedSkill": "grammar", "message": "Giải thích hiện tại hoàn thành", "learningContext": {"page": "writing"}},
        {"text": "Hiện tại hoàn thành nối quá khứ với hiện tại: have/has + V3. Sai: ‘I have saw it.’ Đúng: ‘I have seen it.’ Thử nhé: She ___ finished her work.", "language": "vi", "emotion": "thinking", "skill": "grammar", "quickReplies": ["Cho ví dụ dễ hơn", "Cho mình một câu hỏi"], "action": None},
    ),
    "roleplay": (
        {"trigger": "event", "selectedSkill": "roleplay", "message": "Start a coffee-shop role-play.", "learningContext": {"event": {"type": "roleplay_start", "detail": "Ordering coffee"}}},
        {"text": "Good morning! Welcome to Mino Café. What would you like to order?", "language": "en", "emotion": "happy", "skill": "roleplay", "quickReplies": ["Continue", "Change scenario", "End role-play"], "action": None},
    ),
    "skill_coaching": (
        {"trigger": "user", "selectedSkill": "skill_coaching", "message": "Mình đọc đoạn này không hiểu", "learningContext": {"page": "reading"}},
        {"text": "Bạn gửi đoạn văn hoặc câu hỏi đang vướng nhé. Mình cần đúng nội dung đó để chỉ ra từ khóa và bằng chứng, thay vì đoán.", "language": "vi", "emotion": "thinking", "skill": "skill_coaching", "quickReplies": ["Giải thích kỹ hơn", "Cho bài luyện ngắn"], "action": None},
    ),
    "study_plan": (
        {"trigger": "timed", "selectedSkill": "study_plan", "message": "", "learningContext": {"wordCounts": {"due": 0, "new": 4}}},
        {"text": "Nhiệm vụ 5 phút: học 3 từ mới, đặt 2 câu ngắn rồi đọc to mỗi câu một lần nhé!", "language": "vi", "emotion": "excited", "skill": "study_plan", "quickReplies": ["Bắt đầu ngay", "Đổi nhiệm vụ"], "action": None},
    ),
    "review_coach": (
        {"trigger": "timed", "selectedSkill": "review_coach", "message": "", "learningContext": {"wordCounts": {"due": 3}, "dueWords": [{"word": "itinerary", "meaning": "lịch trình"}]}},
        {"text": "Bạn có 3 từ đến hạn. Khởi động nhé: ‘itinerary’ nghĩa là gì?", "language": "vi", "emotion": "thinking", "skill": "review_coach", "quickReplies": ["Kiểm tra mình", "Mở phần ôn tập"], "action": None},
    ),
}

SYSTEM_PROMPT = """You are Mino, MinusLearn's friendly learner-robot astronaut and a light English coach.

The application supplies exactly one selectedSkill. Follow it and return the same value:
- general: brief English-learning conversation or clarification.
- mistake_explanation: compare event.userAnswer with event.correctAnswer, explain one cause in Vietnamese, show the correction, then offer one tiny retry. Never invent missing answer data.
- sentence_correction: give a natural corrected sentence, explain the most important change in Vietnamese, and optionally give one alternative.
- vocabulary: teach meaning, one useful collocation, one natural example, or a one-question recall check. Prefer learningContext.focusWords when personalization is requested.
- grammar: explain one rule in simple Vietnamese, contrast correct/incorrect examples, then ask one check question.
- roleplay: for roleplay_start or roleplay_turn, stay in character, use English only, write 1-2 short natural sentences, and end with one question. Do not interrupt the role-play with corrections.
- skill_coaching: help reading, listening, speaking, or writing using the current page/event. For speaking transcripts, discuss wording/grammar only; never claim acoustic or phoneme analysis.
- study_plan: create one realistic 5-minute mission with at most 3 steps based on the supplied counts and current page.
- review_coach: prioritize due words and recorded mistakes, quiz one item at a time, and never claim a word is due unless context says so.

Routing priorities:
1. roleplay_start/roleplay_turn -> roleplay.
2. wrong_answer or transcript_mismatch with answer data -> mistake_explanation.
3. timed daily_mission/check-in -> study_plan or review_coach.
4. Otherwise follow the user's explicit request and current page.

Behavior rules:
- Use Vietnamese for coaching/explanations and English for role-play. Set language to the dominant spoken language for TTS.
- Keep normal replies under 120 words. Timed proactive replies must be under 30 words.
- Use supplied learningContext as the only source of personal study facts. If required passage, audio, sentence, or answer is absent, ask the user to provide it.
- Do not give official IELTS scores, fabricate progress, or diagnose pronunciation from text.
- Give one useful next step. quickReplies must be 0-3 short replies that naturally continue the selected skill.
- action is null unless opening an existing MinusLearn page is clearly useful. Allowed pages: vocabulary, listening, reading, speaking, writing, exam, review, bilingual-video, video-detail.
- Never output Markdown fences or text outside the JSON object.

Return JSON only:
{"text":"...","language":"vi|en","emotion":"neutral|happy|excited|thinking|confused|concerned|proud","skill":"general|mistake_explanation|sentence_correction|vocabulary|grammar|roleplay|skill_coaching|study_plan|review_coach","quickReplies":["..."],"action":null}
action may be null or {"type":"navigate","page":"allowed-page"}.
"""


def _word_id(word: dict[str, Any]) -> str:
    return str(word.get("legacyId") or word.get("id") or "")


def _truncate(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def sanitize_client_context(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, Any] = {}
    page = _truncate(value.get("activePage"), 40)
    if page in ALLOWED_PAGES:
        result["activePage"] = page
    topic_id = _truncate(value.get("topicId"), 120)
    if topic_id:
        result["topicId"] = topic_id
    event = value.get("event")
    if isinstance(event, dict):
        result["event"] = {
            key: _truncate(event.get(key), 400)
            for key in ("type", "question", "userAnswer", "correctAnswer", "detail")
            if event.get(key) is not None
        }
    return result


def select_skill(message: str, trigger: str, context: dict[str, Any]) -> str:
    event = context.get("event") if isinstance(context.get("event"), dict) else {}
    event_type = _truncate(event.get("type"), 80).lower()
    normalized_message = _truncate(message, 1500).lower()

    if event_type in {"roleplay_start", "roleplay_turn"}:
        return "roleplay"
    if (
        (event_type == "wrong_answer" or "mismatch" in event_type)
        and event.get("userAnswer")
        and event.get("correctAnswer")
    ):
        return "mistake_explanation"
    if trigger == "timed":
        has_mistakes = any(context.get("mistakes", {}).values())
        return "review_coach" if context.get("wordCounts", {}).get("due", 0) or has_mistakes else "study_plan"

    keyword_routes = (
        ("roleplay", ("role-play", "roleplay", "đóng vai", "hội thoại")),
        ("sentence_correction", ("correct:", "correct this", "sửa câu", "chữa câu", "check sentence")),
        ("grammar", ("grammar", "ngữ pháp", "tense", "thì ", "cấu trúc")),
        ("vocabulary", ("vocabulary", "từ vựng", "collocation", "nghĩa của", "meaning of")),
        ("study_plan", ("5 phút", "kế hoạch", "nhiệm vụ", "mission", "luyện gì")),
        ("review_coach", ("ôn tập", "review", "đến hạn", "kiểm tra mình")),
    )
    for skill, keywords in keyword_routes:
        if any(keyword in normalized_message for keyword in keywords):
            return skill
    if context.get("page") in {"reading", "listening", "speaking", "writing"}:
        return "skill_coaching"
    return "general"


async def _cursor_to_list(cursor, limit: int | None = None) -> list[dict[str, Any]]:
    if limit is not None and hasattr(cursor, "limit"):
        cursor = cursor.limit(limit)
    return [item async for item in cursor]


def _streak_summary(sr_data: dict[str, Any]) -> dict[str, Any]:
    study_dates: set[str] = set()
    for state in sr_data.values():
        if not isinstance(state, dict):
            continue
        timestamps = [*(state.get("reviewHistory") or []), state.get("lastReviewDate")]
        for timestamp in timestamps:
            if not isinstance(timestamp, (int, float)):
                continue
            study_dates.add(datetime.fromtimestamp(timestamp / 1000, timezone.utc).date().isoformat())

    today = datetime.now(timezone.utc).date()
    studied_today = today.isoformat() in study_dates
    cursor = today if studied_today else today.fromordinal(today.toordinal() - 1)
    streak = 0
    while cursor.isoformat() in study_dates:
        streak += 1
        cursor = cursor.fromordinal(cursor.toordinal() - 1)
    return {"days": streak, "studiedToday": studied_today}


async def build_study_context(database, user_id: str, client_context: Any) -> dict[str, Any]:
    safe_client = sanitize_client_context(client_context)
    topic_id = safe_client.get("topicId")
    topic = None
    if topic_id:
        topic = await database.topics.find_one({"userId": user_id, "legacyId": topic_id})

    word_query: dict[str, Any] = {"userId": user_id}
    if topic_id:
        word_query["topicId"] = topic_id
    words = await _cursor_to_list(database.words.find(word_query))
    study = await database.study_state.find_one({"userId": user_id}) or {}
    sr_data = study.get("srData", {}) if isinstance(study.get("srData", {}), dict) else {}
    now_ms = datetime.now(timezone.utc).timestamp() * 1000

    due: list[dict[str, str]] = []
    due_ids: list[str] = []
    new_ids: list[str] = []
    due_count = 0
    new_count = 0
    learned_count = 0
    for word in words:
        state = sr_data.get(_word_id(word))
        next_review = state.get("nextReviewDate") if isinstance(state, dict) else None
        if next_review is None:
            new_count += 1
            new_ids.append(_word_id(word))
        elif isinstance(next_review, (int, float)) and next_review <= now_ms:
            due_count += 1
            due_ids.append(_word_id(word))
            if len(due) < MAX_CONTEXT_WORDS:
                due.append({
                    "word": _truncate(word.get("word"), 80),
                    "meaning": _truncate(word.get("meaning"), 160),
                })
        else:
            learned_count += 1

    mistake_fields = {
        "listening": study.get("listeningMistakes", {}),
        "reading": study.get("readingMistakes", {}),
        "speaking": study.get("speakingMistakes", {}),
    }
    words_by_id = {_word_id(word): word for word in words}
    mistakes: dict[str, list[str]] = {}
    mistake_ids: list[str] = []
    for skill, values in mistake_fields.items():
        ids = list(values.keys()) if isinstance(values, dict) else []
        mistake_ids.extend(ids)
        mistakes[skill] = [
            _truncate(words_by_id[word_id].get("word"), 80)
            for word_id in ids
            if word_id in words_by_id
        ][:5]

    focus_ids: list[str] = []
    for word_id in [*mistake_ids, *due_ids, *new_ids, *words_by_id.keys()]:
        if word_id in words_by_id and word_id not in focus_ids:
            focus_ids.append(word_id)
        if len(focus_ids) >= MAX_CONTEXT_WORDS:
            break
    focus_words = [
        {
            "word": _truncate(words_by_id[word_id].get("word"), 80),
            "meaning": _truncate(words_by_id[word_id].get("meaning"), 160),
            "example": _truncate(words_by_id[word_id].get("example"), 240),
        }
        for word_id in focus_ids
    ]

    return {
        "page": safe_client.get("activePage", "vocabulary"),
        "topic": _truncate((topic or {}).get("name"), 120) or "General",
        "wordCounts": {
            "total": len(words), "due": due_count, "new": new_count, "learned": learned_count
        },
        "dueWords": due,
        "focusWords": focus_words,
        "mistakes": mistakes,
        "streak": _streak_summary(sr_data),
        "event": safe_client.get("event"),
    }


async def get_history(database, user_id: str) -> list[dict[str, Any]]:
    document = await database.mascot_conversations.find_one({"userId": user_id}) or {}
    messages = document.get("messages", [])
    if not isinstance(messages, list):
        return []
    return [
        {
            "role": item.get("role"),
            "text": _truncate(item.get("text"), 1500),
            "createdAt": item.get("createdAt"),
        }
        for item in messages[-MAX_HISTORY_MESSAGES:]
        if isinstance(item, dict) and item.get("role") in {"user", "assistant"}
    ]


async def append_history(database, user_id: str, entries: list[dict[str, Any]]) -> None:
    messages = await get_history(database, user_id)
    timestamp = datetime.now(timezone.utc)
    normalized = [
        {
            "role": entry["role"],
            "text": _truncate(entry.get("text"), 1500),
            "createdAt": entry.get("createdAt") or timestamp,
        }
        for entry in entries
        if entry.get("role") in {"user", "assistant"} and entry.get("text")
    ]
    await database.mascot_conversations.update_one(
        {"userId": user_id},
        {"$set": {
            "userId": user_id,
            "messages": (messages + normalized)[-MAX_HISTORY_MESSAGES:],
            "updatedAt": timestamp,
        }},
        upsert=True,
    )


async def clear_history(database, user_id: str) -> None:
    await database.mascot_conversations.delete_many({"userId": user_id})


def _normalize_action(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict) or value.get("type") != "navigate":
        return None
    page = value.get("page")
    if page not in ALLOWED_PAGES:
        return None
    return {"type": "navigate", "page": page}


def _clean_model_text(value: Any) -> str:
    text = re.sub(r"<[^>]+>", "", _truncate(value, 1500))
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _normalize_quick_replies(value: Any, skill: str) -> list[str]:
    if skill != "general":
        return DEFAULT_QUICK_REPLIES[skill]
    candidates = value if isinstance(value, list) else []
    replies = [
        _truncate(item, 40)
        for item in candidates
        if _truncate(item, 60)
        and len(_truncate(item, 60)) <= 40
        and "<" not in _truncate(item, 60)
        and "\n" not in _truncate(item, 60)
    ][:3]
    return replies or DEFAULT_QUICK_REPLIES[skill]


def normalize_model_response(value: Any, expected_skill: str | None = None) -> MascotChatResponse:
    if not isinstance(value, dict) or not _truncate(value.get("text"), 1500):
        raise ValueError("Ollama returned an invalid mascot response")
    emotion = value.get("emotion") if value.get("emotion") in ALLOWED_EMOTIONS else "neutral"
    skill = expected_skill if expected_skill in ALLOWED_SKILLS else (
        value.get("skill") if value.get("skill") in ALLOWED_SKILLS else "general"
    )
    if skill == "roleplay":
        language = "en"
    elif skill == "general":
        language = value.get("language") if value.get("language") in {"vi", "en"} else "vi"
    else:
        language = "vi"
    return MascotChatResponse(
        text=_clean_model_text(value.get("text")),
        language=language,
        emotion=emotion,
        skill=skill,
        quickReplies=_normalize_quick_replies(value.get("quickReplies"), skill),
        action=_normalize_action(value.get("action")),
        source="qwen",
    )


def apply_response_guardrails(
    response: MascotChatResponse,
    trigger: str,
    context: dict[str, Any],
) -> MascotChatResponse:
    if trigger != "timed":
        return response
    counts = context.get("wordCounts", {})
    if response.skill == "review_coach":
        due_count = int(counts.get("due", 0) or 0)
        due_words = context.get("dueWords", [])
        if due_count and due_words:
            word = _truncate(due_words[0].get("word"), 80)
            text = f"Bạn có {due_count} từ đến hạn. Khởi động nhé: ‘{word}’ nghĩa là gì?"
        else:
            text = "Mình thấy vài lỗi cần ôn. Chọn một kỹ năng và cùng sửa một câu ngắn nhé!"
    else:
        new_count = int(counts.get("new", 0) or 0)
        target = min(max(new_count, 3), 5)
        text = f"Nhiệm vụ 5 phút: học {target} từ, đặt 2 câu ngắn rồi đọc to mỗi câu một lần nhé!"
    return response.model_copy(update={"text": text, "language": "vi"})


def fallback_response(context: dict[str, Any], trigger: str) -> MascotChatResponse:
    counts = context.get("wordCounts", {})
    due = counts.get("due", 0)
    topic = context.get("topic", "chủ đề hiện tại")
    if due:
        text = f"Mino đang mất kết nối với Qwen, nhưng mình thấy bạn có {due} từ cần ôn trong {topic}. Ôn nhanh nhé!"
        quick = ["Mở phần ôn tập", "Xem từ đến hạn"]
        skill = "review_coach"
    elif trigger == "user":
        text = "Qwen local chưa sẵn sàng. Hãy mở Ollama và kiểm tra model qwen2.5:1.5b, rồi thử lại nhé."
        quick = ["Thử lại", "Kiểm tra kết nối"]
        skill = "general"
    else:
        text = f"Mino đang ở chế độ offline. Một vòng luyện ngắn trong {topic} vẫn là bước tiến tốt hôm nay!"
        quick = ["Luyện 5 phút"]
        skill = "study_plan"
    return MascotChatResponse(
        text=text,
        language="vi",
        emotion="concerned",
        skill=skill,
        quickReplies=quick,
        source="fallback",
    )


async def check_ollama(settings: Settings) -> dict[str, Any]:
    url = f"{settings.ollama_base_url.rstrip('/')}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=min(settings.mascot_timeout_seconds, 5.0)) as client:
            response = await client.get(url)
            response.raise_for_status()
        models = [item.get("name", "") for item in response.json().get("models", [])]
        available = settings.mascot_model in models
        return {"online": True, "modelAvailable": available, "model": settings.mascot_model}
    except (httpx.HTTPError, ValueError):
        return {"online": False, "modelAvailable": False, "model": settings.mascot_model}


async def generate_reply(
    settings: Settings,
    history: list[dict[str, Any]],
    message: str,
    trigger: str,
    context: dict[str, Any],
) -> MascotChatResponse:
    selected_skill = select_skill(message, trigger, context)
    user_prompt = {
        "trigger": trigger,
        "selectedSkill": selected_skill,
        "skillContract": SKILL_CONTRACTS[selected_skill],
        "message": _truncate(message, 1500),
        "learningContext": context,
    }
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    example_input, example_output = SKILL_EXAMPLES[selected_skill]
    messages.extend([
        {"role": "user", "content": json.dumps(example_input, ensure_ascii=False)},
        {"role": "assistant", "content": json.dumps(example_output, ensure_ascii=False)},
    ])
    for item in history[-12:]:
        messages.append({"role": item["role"], "content": item["text"]})
    messages.append({"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)})

    try:
        async with httpx.AsyncClient(timeout=settings.mascot_timeout_seconds) as client:
            response = await client.post(
                f"{settings.ollama_base_url.rstrip('/')}/api/chat",
                json={
                    "model": settings.mascot_model,
                    "messages": messages,
                    "stream": False,
                    "format": "json",
                    "options": {
                        "temperature": 0.5 if selected_skill == "general" else 0.25,
                        "num_predict": settings.mascot_max_tokens,
                    },
                },
            )
            response.raise_for_status()
        content = response.json().get("message", {}).get("content", "")
        normalized = normalize_model_response(json.loads(content), selected_skill)
        return apply_response_guardrails(normalized, trigger, context)
    except (httpx.HTTPError, ValueError, TypeError, json.JSONDecodeError):
        return fallback_response(context, trigger)
