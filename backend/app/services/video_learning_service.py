from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from pymongo import DESCENDING


MAX_ATTEMPTS_PER_VIDEO = 500
MAX_DICTIONARY_ENTRIES = 500
MAX_NOTE_LENGTH = 1_000
ALLOWED_DIFFICULTIES = {"easy", "medium", "hard", "auto"}
DEFAULT_PREFERENCES = {
    "playbackRate": 1,
    "subtitleMode": "bilingual",
    "subtitleOffset": 0,
    "autoPause": False,
    "autoPauseDelay": 1.5,
    "repeatCount": 1,
    "progressiveReplay": False,
    "audioFocus": False,
    "difficulty": "auto",
}
DEFAULT_AGGREGATE_STATS = {
    "totalAttempts": 0,
    "practiceSeconds": 0,
    "watchSeconds": 0,
    "savedWords": 0,
}
FORBIDDEN_KEYS = {"apiKey", "geminiApiKey", "pixabayApiKey", "unsplashApiKey", "pexelsApiKey"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def default_learning_state(video_id: str) -> dict[str, Any]:
    return {
        "id": str(video_id),
        "videoId": str(video_id),
        "preferences": deepcopy(DEFAULT_PREFERENCES),
        "bookmarks": [],
        "notes": {},
        "knownTokens": [],
        "dictionaryCache": {},
        "learningPackCache": {},
        "aggregateStats": deepcopy(DEFAULT_AGGREGATE_STATS),
        "lineStats": {},
        "updatedAt": None,
    }


def public_state(document: dict[str, Any] | None, video_id: str) -> dict[str, Any]:
    state = default_learning_state(video_id)
    if document:
        state.update({key: value for key, value in document.items() if key not in {"_id", "userId"}})
        state["preferences"] = {**DEFAULT_PREFERENCES, **(document.get("preferences") or {})}
        state["aggregateStats"] = {**DEFAULT_AGGREGATE_STATS, **(document.get("aggregateStats") or {})}
    return jsonable_encoder(state)


def public_attempt(document: dict[str, Any]) -> dict[str, Any]:
    return jsonable_encoder({key: value for key, value in document.items() if key not in {"_id", "userId"}})


def without_secrets(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: without_secrets(item) for key, item in value.items() if key not in FORBIDDEN_KEYS}
    if isinstance(value, list):
        return [without_secrets(item) for item in value]
    return value


def deep_merge(current: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(current)
    for key, value in changes.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def valid_learning_pack(pack: Any) -> bool:
    if not isinstance(pack, dict):
        return False
    if not isinstance(pack.get("summaryEnglish"), str) or not isinstance(pack.get("summaryVietnamese"), str):
        return False
    for key in ("keyPhrases", "grammarNotes", "questions"):
        if not isinstance(pack.get(key), list):
            return False
        if any(not isinstance(item, dict) or not isinstance(item.get("lineIndex"), int) or item["lineIndex"] < 0 for item in pack[key]):
            return False
    for question in pack["questions"]:
        options = question.get("options")
        answer_index = question.get("answerIndex")
        if (
            not isinstance(question.get("question"), str)
            or not isinstance(question.get("explanation"), str)
            or not isinstance(options, list)
            or not isinstance(answer_index, int)
            or answer_index < 0
            or answer_index >= len(options)
        ):
            return False
    return True


def validate_learning_state_payload(payload: dict[str, Any], video_id: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Learning state must be an object")

    clean = without_secrets(jsonable_encoder(payload))
    clean.pop("_id", None)
    clean.pop("userId", None)
    clean["videoId"] = str(video_id)

    notes = clean.get("notes", {})
    if not isinstance(notes, dict) or any(len(str(note)) > MAX_NOTE_LENGTH for note in notes.values()):
        raise HTTPException(status_code=422, detail=f"Each note must contain at most {MAX_NOTE_LENGTH} characters")

    for list_key in ("bookmarks", "knownTokens"):
        if not isinstance(clean.get(list_key, []), list):
            raise HTTPException(status_code=422, detail=f"{list_key} must be an array")

    dictionary_cache = clean.get("dictionaryCache", {})
    if not isinstance(dictionary_cache, (dict, list)) or len(dictionary_cache) > MAX_DICTIONARY_ENTRIES:
        raise HTTPException(status_code=422, detail=f"dictionaryCache is limited to {MAX_DICTIONARY_ENTRIES} entries")

    learning_pack_cache = clean.get("learningPackCache", {})
    if not isinstance(learning_pack_cache, dict):
        raise HTTPException(status_code=422, detail="learningPackCache must be an object")
    for entry in learning_pack_cache.values():
        if not isinstance(entry, dict) or not valid_learning_pack(entry.get("pack")):
            raise HTTPException(status_code=422, detail="Invalid cached learning pack")

    preferences = clean.get("preferences", {})
    if not isinstance(preferences, dict):
        raise HTTPException(status_code=422, detail="preferences must be an object")
    difficulty = preferences.get("difficulty", "auto")
    if difficulty not in ALLOWED_DIFFICULTIES:
        raise HTTPException(status_code=422, detail="Invalid difficulty")
    preferences["subtitleOffset"] = max(-5, min(5, float(preferences.get("subtitleOffset", 0))))
    preferences["playbackRate"] = max(0.5, min(1.5, float(preferences.get("playbackRate", 1))))
    preferences["repeatCount"] = max(1, min(5, int(preferences.get("repeatCount", 1))))

    return clean


def validate_attempt_payload(payload: dict[str, Any], video_id: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Learning attempt must be an object")
    activity = str(payload.get("activity") or "").strip().lower()
    if not activity or not activity.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=422, detail="Invalid learning activity")

    try:
        score = max(0.0, min(100.0, float(payload.get("score", 0))))
        hints = max(0, int(payload.get("hints", 0)))
        replays = max(0, int(payload.get("replays", 0)))
        duration = max(0, int(payload.get("durationSeconds", 0)))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="Invalid attempt metrics") from error

    clean = without_secrets(jsonable_encoder(payload))
    for key in ("_id", "userId", "createdAt", "id"):
        clean.pop(key, None)
    clean.update({
        "id": str(uuid4()),
        "videoId": str(video_id),
        "activity": activity,
        "difficulty": clean.get("difficulty") if clean.get("difficulty") in ALLOWED_DIFFICULTIES else "medium",
        "score": round(score, 2),
        "hints": hints,
        "replays": replays,
        "durationSeconds": duration,
        "createdAt": utc_now(),
    })
    transcript = clean.get("recognizedTranscript")
    if transcript is not None:
        clean["recognizedTranscript"] = str(transcript)[:5_000]
    return clean


async def get_learning_state(database, user_id: str, video_id: str) -> dict[str, Any]:
    document = await database.video_learning_states.find_one({"userId": user_id, "videoId": video_id})
    return public_state(document, video_id)


async def patch_learning_state(database, user_id: str, video_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    current = await database.video_learning_states.find_one({"userId": user_id, "videoId": video_id})
    base = public_state(current, video_id)
    base.pop("updatedAt", None)
    merged = deep_merge(base, payload)
    clean = validate_learning_state_payload(merged, video_id)
    clean["userId"] = user_id
    clean["updatedAt"] = utc_now()
    await database.video_learning_states.replace_one(
        {"userId": user_id, "videoId": video_id}, clean, upsert=True
    )
    return public_state(clean, video_id)


async def list_learning_attempts(database, user_id: str, video_id: str, limit: int = 100) -> list[dict[str, Any]]:
    safe_limit = max(1, min(MAX_ATTEMPTS_PER_VIDEO, int(limit)))
    cursor = database.video_learning_attempts.find({"userId": user_id, "videoId": video_id})
    cursor = cursor.sort("createdAt", DESCENDING).limit(safe_limit)
    return [public_attempt(document) async for document in cursor]


async def add_learning_attempt(database, user_id: str, video_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    attempt = validate_attempt_payload(payload, video_id)
    stored = {**attempt, "userId": user_id}
    await database.video_learning_attempts.insert_one(stored)

    activity = attempt["activity"]
    increments = {
        "aggregateStats.totalAttempts": 1,
        "aggregateStats.practiceSeconds": attempt["durationSeconds"],
        f"aggregateStats.activities.{activity}.attempts": 1,
        f"aggregateStats.activities.{activity}.totalScore": attempt["score"],
        f"aggregateStats.activities.{activity}.hints": attempt["hints"],
        f"aggregateStats.activities.{activity}.replays": attempt["replays"],
    }
    line_index = attempt.get("lineIndex")
    if isinstance(line_index, int) and line_index >= 0:
        increments.update({
            f"lineStats.{line_index}.attempts": 1,
            f"lineStats.{line_index}.totalScore": attempt["score"],
        })
    await database.video_learning_states.update_one(
        {"userId": user_id, "videoId": video_id},
        {
            "$set": {"userId": user_id, "videoId": video_id, "updatedAt": utc_now()},
            "$setOnInsert": {
                "preferences": deepcopy(DEFAULT_PREFERENCES),
                "bookmarks": [],
                "notes": {},
                "knownTokens": [],
                "dictionaryCache": {},
                "learningPackCache": {},
            },
            "$inc": increments,
        },
        upsert=True,
    )

    retention_cursor = database.video_learning_attempts.find(
        {"userId": user_id, "videoId": video_id}, {"_id": 1}
    ).sort("createdAt", DESCENDING).skip(MAX_ATTEMPTS_PER_VIDEO)
    stale_ids = [document["_id"] async for document in retention_cursor]
    if stale_ids:
        await database.video_learning_attempts.delete_many({"_id": {"$in": stale_ids}})
    return public_attempt(stored)


async def delete_learning_data(database, user_id: str, video_id: str) -> None:
    await database.video_learning_states.delete_many({"userId": user_id, "videoId": video_id})
    await database.video_learning_attempts.delete_many({"userId": user_id, "videoId": video_id})
