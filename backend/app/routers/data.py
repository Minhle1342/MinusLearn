from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pymongo import DESCENDING, ReturnDocument

from ..dependencies import get_current_user, get_database
from ..services.data_service import (
    get_singleton,
    list_documents,
    patch_document,
    put_singleton,
    replace_documents,
    sanitize_settings,
    upsert_document,
)


router = APIRouter(prefix="/api", tags=["data"])


def user_id(user: dict) -> str:
    return user["userId"]


@router.get("/bootstrap")
async def bootstrap(user=Depends(get_current_user), database=Depends(get_database)):
    uid = user_id(user)
    topics = await list_documents(database, "topics", uid)
    if not topics:
        topics = [{"id": "default", "name": "General", "colorClass": "bg-accent-sky"}]
    settings_doc = await database.user_settings.find_one({"userId": uid}) or {}
    study = await database.study_state.find_one({"userId": uid}) or {}
    return {
        "topics": topics,
        "words": await list_documents(database, "words", uid),
        "settings": sanitize_settings(settings_doc.get("settings", {})),
        "viewMode": settings_doc.get("viewMode", "card"),
        "studyState": {
            "srData": study.get("srData", {}),
            "listeningMistakes": study.get("listeningMistakes", {}),
            "readingMistakes": study.get("readingMistakes", {}),
            "speakingMistakes": study.get("speakingMistakes", {}),
            "academicCalendar": study.get("academicCalendar", None),
        },
    }


async def replace_resource(collection: str, payload: list[dict], user: dict, database):
    return await replace_documents(database, collection, user_id(user), payload)


@router.get("/topics")
async def get_topics(user=Depends(get_current_user), database=Depends(get_database)):
    topics = await list_documents(database, "topics", user_id(user))
    return topics or [{"id": "default", "name": "General", "colorClass": "bg-accent-sky"}]


@router.put("/topics")
async def put_topics(payload: list[dict] = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    return await replace_resource("topics", payload, user, database)


@router.get("/video-topics")
async def get_video_topics(user=Depends(get_current_user), database=Depends(get_database)):
    topics = await list_documents(database, "video_topics", user_id(user))
    return topics or [{"id": "default-video", "name": "General Video", "colorClass": "bg-accent-sky"}]


@router.put("/video-topics")
async def put_video_topics(payload: list[dict] = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    return await replace_resource("video_topics", payload, user, database)


@router.post("/topics", status_code=201)
async def create_topic(payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    return await upsert_document(database, "topics", user_id(user), payload)


@router.patch("/topics/{legacy_id}")
async def update_topic(legacy_id: str, payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    result = await patch_document(database, "topics", user_id(user), legacy_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Topic not found")
    return result


@router.delete("/topics/{legacy_id}", status_code=204)
async def delete_topic(legacy_id: str, user=Depends(get_current_user), database=Depends(get_database)):
    uid = user_id(user)
    await database.topics.delete_one({"userId": uid, "legacyId": legacy_id})
    await database.words.delete_many({"userId": uid, "topicId": legacy_id})


@router.get("/words")
async def get_words(user=Depends(get_current_user), database=Depends(get_database)):
    return await list_documents(database, "words", user_id(user))


@router.put("/words")
async def put_words(payload: list[dict] = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    return await replace_resource("words", payload, user, database)


@router.post("/words", status_code=201)
async def create_word(payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    return await upsert_document(database, "words", user_id(user), payload)


@router.patch("/words/{legacy_id}")
async def update_word(legacy_id: str, payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    result = await patch_document(database, "words", user_id(user), legacy_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Word not found")
    return result


@router.delete("/words/{legacy_id}", status_code=204)
async def delete_word(legacy_id: str, user=Depends(get_current_user), database=Depends(get_database)):
    await database.words.delete_one({"userId": user_id(user), "legacyId": legacy_id})


@router.get("/settings")
async def get_settings(user=Depends(get_current_user), database=Depends(get_database)):
    uid = user_id(user)
    document = await database.user_settings.find_one({"userId": uid}) or {}
    return {"settings": sanitize_settings(document.get("settings", {})), "viewMode": document.get("viewMode", "card")}


@router.put("/settings")
async def put_settings(payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    uid = user_id(user)
    changes: dict[str, Any] = {}
    if "settings" in payload:
        changes["settings"] = sanitize_settings(payload["settings"])
    if "viewMode" in payload:
        changes["viewMode"] = payload["viewMode"]
    changes["updatedAt"] = datetime.now(timezone.utc)
    await database.user_settings.update_one({"userId": uid}, {"$set": {"userId": uid, **changes}}, upsert=True)
    return await get_settings(user, database)


@router.get("/study-state")
async def get_study_state(user=Depends(get_current_user), database=Depends(get_database)):
    document = await database.study_state.find_one({"userId": user_id(user)}) or {}
    return {
        "srData": document.get("srData", {}),
        "listeningMistakes": document.get("listeningMistakes", {}),
        "readingMistakes": document.get("readingMistakes", {}),
        "speakingMistakes": document.get("speakingMistakes", {}),
        "academicCalendar": document.get("academicCalendar", None),
    }


@router.put("/study-state")
async def put_study_state(payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    allowed = {key: value for key, value in payload.items() if key in {"srData", "listeningMistakes", "readingMistakes", "speakingMistakes", "academicCalendar"}}
    uid = user_id(user)
    await database.study_state.update_one(
        {"userId": uid}, {"$set": {"userId": uid, **allowed, "updatedAt": datetime.now(timezone.utc)}}, upsert=True
    )
    return await get_study_state(user, database)


@router.get("/writing-sessions")
async def get_writing_sessions(status_filter: str | None = Query(None, alias="status"), user=Depends(get_current_user), database=Depends(get_database)):
    query = {"userId": user_id(user)}
    if status_filter:
        query["status"] = status_filter
    cursor = database.writing_sessions.find(query).sort("startedAt", DESCENDING)
    from ..services.data_service import public_document
    return [public_document(item) async for item in cursor]


@router.post("/writing-sessions", status_code=201)
async def create_writing_session(payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    payload = {"id": payload.get("id") or str(uuid4()), "startedAt": payload.get("startedAt") or int(datetime.now(timezone.utc).timestamp() * 1000), **payload}
    return await upsert_document(database, "writing_sessions", user_id(user), payload)


@router.patch("/writing-sessions/{legacy_id}")
async def update_writing_session(legacy_id: str, payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    payload["autoSaveAt"] = int(datetime.now(timezone.utc).timestamp() * 1000)
    result = await patch_document(database, "writing_sessions", user_id(user), legacy_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Writing session not found")
    return result


@router.delete("/writing-sessions/{legacy_id}", status_code=204)
async def delete_writing_session(legacy_id: str, user=Depends(get_current_user), database=Depends(get_database)):
    await database.writing_sessions.delete_one({"userId": user_id(user), "legacyId": legacy_id})


@router.get("/writing-mistakes")
async def get_writing_mistakes(topic_id: str | None = None, user=Depends(get_current_user), database=Depends(get_database)):
    query = {"userId": user_id(user)}
    if topic_id:
        query["topicId"] = topic_id
    from ..services.data_service import public_document
    return [public_document(item) async for item in database.writing_sentence_mistakes.find(query)]


@router.post("/writing-mistakes", status_code=201)
async def create_writing_mistake(payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    payload = {"id": payload.get("id") or str(uuid4()), "timestamp": payload.get("timestamp") or int(datetime.now(timezone.utc).timestamp() * 1000), **payload}
    return await upsert_document(database, "writing_sentence_mistakes", user_id(user), payload)


@router.delete("/writing-mistakes", status_code=204)
async def clear_writing_mistakes(topic_id: str | None = None, user=Depends(get_current_user), database=Depends(get_database)):
    query = {"userId": user_id(user)}
    if topic_id:
        query["topicId"] = topic_id
    await database.writing_sentence_mistakes.delete_many(query)


@router.get("/exam-results")
async def get_exam_results(difficulty: str | None = None, topic_id: str | None = None, limit: int = Query(5, ge=1, le=100), user=Depends(get_current_user), database=Depends(get_database)):
    query = {"userId": user_id(user)}
    if difficulty:
        query["difficulty"] = difficulty
    if topic_id:
        query["topicId"] = topic_id
    from ..services.data_service import public_document
    cursor = database.exam_results.find(query).sort([("totalScore", DESCENDING), ("timestamp", DESCENDING)]).limit(limit)
    return [public_document(item) async for item in cursor]


@router.post("/exam-results", status_code=201)
async def create_exam_result(payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    payload = {"id": payload.get("id") or str(uuid4()), "timestamp": payload.get("timestamp") or int(datetime.now(timezone.utc).timestamp() * 1000), "reviewCount": payload.get("reviewCount", 0), **payload}
    return await upsert_document(database, "exam_results", user_id(user), payload)


@router.patch("/exam-results/{legacy_id}/review")
async def increment_exam_review(legacy_id: str, user=Depends(get_current_user), database=Depends(get_database)):
    from ..services.data_service import public_document
    result = await database.exam_results.find_one_and_update(
        {"userId": user_id(user), "legacyId": legacy_id}, {"$inc": {"reviewCount": 1}}, return_document=ReturnDocument.AFTER
    )
    if not result:
        raise HTTPException(status_code=404, detail="Exam result not found")
    return public_document(result)


@router.delete("/exam-results", status_code=204)
async def clear_exam_results(user=Depends(get_current_user), database=Depends(get_database)):
    await database.exam_results.delete_many({"userId": user_id(user)})


@router.get("/exam-writing-draft")
async def get_exam_writing_draft(user=Depends(get_current_user), database=Depends(get_database)):
    return {"draft": await get_singleton(database, "exam_writing_drafts", user_id(user), "draft", None)}


@router.put("/exam-writing-draft")
async def put_exam_writing_draft(payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    return {"draft": await put_singleton(database, "exam_writing_drafts", user_id(user), "draft", payload)}


@router.delete("/exam-writing-draft", status_code=204)
async def delete_exam_writing_draft(user=Depends(get_current_user), database=Depends(get_database)):
    await database.exam_writing_drafts.delete_many({"userId": user_id(user)})


@router.post("/download-image")
async def download_image(payload: dict = Body(...), user=Depends(get_current_user)):
    url = payload.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="Missing url")
    
    import httpx
    from pathlib import Path
    import uuid

    upload_dir = Path("uploadImage")
    upload_dir.mkdir(exist_ok=True)
    
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(url, follow_redirects=True)
            r.raise_for_status()
            
            # Simple assumption that the file is an image
            filename = f"{uuid.uuid4().hex}.jpg"
            file_path = upload_dir / filename
            file_path.write_bytes(r.content)
            
            # Return relative path for frontend to use via backend's static file serving
            return {"localImageUrl": f"/uploadImage/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
