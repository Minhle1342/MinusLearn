from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi.encoders import jsonable_encoder


SECRET_SETTING_KEYS = {"apiKey", "pixabayApiKey", "unsplashApiKey", "pexelsApiKey"}
ARRAY_BACKUP_KEYS = {
    "minuslearn_topics": "topics",
    "minuslearn_words": "words",
    "minuslearn_writing_sessions": "writing_sessions",
    "minuslearn_writing_sentence_mistakes": "writing_sentence_mistakes",
    "minuslearn_exam_history": "exam_results",
    "minuslearn_video_learning_states": "video_learning_states",
    "minuslearn_video_learning_attempts": "video_learning_attempts",
}
STUDY_BACKUP_KEYS = {
    "minuslearn_sr_data": "srData",
    "minuslearn_mistakes": "listeningMistakes",
    "minuslearn_reading_mistakes": "readingMistakes",
    "minuslearn_speaking_mistakes": "speakingMistakes",
}
USER_DATA_COLLECTIONS = [
    *ARRAY_BACKUP_KEYS.values(),
    "study_state",
    "user_settings",
    "exam_writing_drafts",
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def sanitize_settings(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {key: item for key, item in value.items() if key not in SECRET_SETTING_KEYS}


def public_document(document: dict[str, Any]) -> dict[str, Any]:
    result = {key: value for key, value in document.items() if key not in {"_id", "userId", "legacyId"}}
    result["id"] = str(document.get("legacyId") or document.get("id"))
    return result


def stored_document(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = jsonable_encoder(dict(payload))
    data.pop("_id", None)
    data.pop("userId", None)
    legacy_id = str(data.pop("legacyId", None) or data.get("id") or uuid4())
    data["id"] = legacy_id
    data["legacyId"] = legacy_id
    data["userId"] = user_id
    return data


async def list_documents(database, collection_name: str, user_id: str, sort=None) -> list[dict[str, Any]]:
    cursor = database[collection_name].find({"userId": user_id})
    if sort:
        cursor = cursor.sort(sort)
    return [public_document(document) async for document in cursor]


async def replace_documents(
    database,
    collection_name: str,
    user_id: str,
    payloads: list[dict[str, Any]],
    session=None,
) -> list[dict[str, Any]]:
    documents = [stored_document(user_id, payload) for payload in payloads]
    await database[collection_name].delete_many({"userId": user_id}, session=session)
    if documents:
        await database[collection_name].insert_many(documents, session=session)
    return [public_document(document) for document in documents]


async def upsert_document(database, collection_name: str, user_id: str, payload: dict[str, Any]):
    document = stored_document(user_id, payload)
    await database[collection_name].replace_one(
        {"userId": user_id, "legacyId": document["legacyId"]}, document, upsert=True
    )
    return public_document(document)


async def patch_document(database, collection_name: str, user_id: str, legacy_id: str, payload: dict[str, Any]):
    changes = jsonable_encoder(dict(payload))
    for key in ("_id", "userId", "legacyId", "id"):
        changes.pop(key, None)
    result = await database[collection_name].find_one_and_update(
        {"userId": user_id, "legacyId": legacy_id}, {"$set": changes}, return_document=True
    )
    return public_document(result) if result else None


async def get_singleton(database, collection_name: str, user_id: str, field: str, default):
    document = await database[collection_name].find_one({"userId": user_id})
    return document.get(field, default) if document else default


async def put_singleton(database, collection_name: str, user_id: str, field: str, value, session=None):
    value = jsonable_encoder(value)
    await database[collection_name].update_one(
        {"userId": user_id},
        {"$set": {"userId": user_id, field: value, "updatedAt": utc_now()}},
        upsert=True,
        session=session,
    )
    return value


async def has_user_data(database, user_id: str, session=None) -> bool:
    for collection_name in USER_DATA_COLLECTIONS:
        if await database[collection_name].find_one({"userId": user_id}, session=session):
            return True
    return False


def validate_backup_data(data: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for key, collection_name in ARRAY_BACKUP_KEYS.items():
        value = data.get(key, [])
        if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
            raise ValueError(f"{key} must be an array of objects")
        counts[collection_name] = len(value)
    for key in STUDY_BACKUP_KEYS:
        value = data.get(key, {})
        if not isinstance(value, dict):
            raise ValueError(f"{key} must be an object")
    settings = data.get("minuslearn_settings", {})
    if not isinstance(settings, dict):
        raise ValueError("minuslearn_settings must be an object")
    draft = data.get("minuslearn_exam_writing_draft")
    if draft is not None and not isinstance(draft, dict):
        raise ValueError("minuslearn_exam_writing_draft must be an object or null")
    counts["study_state"] = int(any(data.get(key) for key in STUDY_BACKUP_KEYS))
    counts["user_settings"] = int(bool(settings) or "minuslearn_view_mode" in data)
    counts["exam_writing_drafts"] = int(draft is not None)
    return counts


async def export_backup(database, user_id: str) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for key, collection_name in ARRAY_BACKUP_KEYS.items():
        data[key] = await list_documents(database, collection_name, user_id)
    study_state = await database.study_state.find_one({"userId": user_id}) or {}
    for key, field in STUDY_BACKUP_KEYS.items():
        data[key] = study_state.get(field, {})
    settings_doc = await database.user_settings.find_one({"userId": user_id}) or {}
    data["minuslearn_settings"] = sanitize_settings(settings_doc.get("settings", {}))
    data["minuslearn_view_mode"] = settings_doc.get("viewMode", "card")
    data["minuslearn_exam_writing_draft"] = await get_singleton(
        database, "exam_writing_drafts", user_id, "draft", None
    )
    return data


async def replace_from_backup(database, user_id: str, data: dict[str, Any], session=None) -> dict[str, int]:
    counts = validate_backup_data(data)
    for key, collection_name in ARRAY_BACKUP_KEYS.items():
        await replace_documents(database, collection_name, user_id, data.get(key, []), session=session)

    study_state = {field: data.get(key, {}) for key, field in STUDY_BACKUP_KEYS.items()}
    await database.study_state.replace_one(
        {"userId": user_id},
        {"userId": user_id, **jsonable_encoder(study_state), "updatedAt": utc_now()},
        upsert=True,
        session=session,
    )
    await database.user_settings.replace_one(
        {"userId": user_id},
        {
            "userId": user_id,
            "settings": jsonable_encoder(sanitize_settings(data.get("minuslearn_settings", {}))),
            "viewMode": data.get("minuslearn_view_mode", "card"),
            "updatedAt": utc_now(),
        },
        upsert=True,
        session=session,
    )
    draft = data.get("minuslearn_exam_writing_draft")
    await database.exam_writing_drafts.delete_many({"userId": user_id}, session=session)
    if draft is not None:
        await database.exam_writing_drafts.insert_one(
            {"userId": user_id, "draft": jsonable_encoder(draft), "updatedAt": utc_now()}, session=session
        )
    return counts
