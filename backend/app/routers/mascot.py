from fastapi import APIRouter, Depends, HTTPException, status

from ..config import get_settings
from ..dependencies import get_current_user, get_database
from ..schemas import (
    MascotChatRequest,
    MascotChatResponse,
    MascotLiveHistoryRequest,
    MascotLiveTokenResponse,
)
from ..services.gemini_live_service import create_live_token
from ..services.mascot_service import (
    append_history,
    build_study_context,
    check_ollama,
    clear_history,
    generate_reply,
    get_history,
)


router = APIRouter(prefix="/api/mascot", tags=["mascot"])


@router.get("/health")
async def mascot_health(user=Depends(get_current_user)):
    del user
    settings = get_settings()
    result = await check_ollama(settings)
    return {
        **result,
        "liveVoiceConfigured": bool(settings.gemini_live_api_key.strip()),
        "liveVoiceModel": settings.gemini_live_model,
    }


@router.post("/live-token", response_model=MascotLiveTokenResponse)
async def mascot_live_token(user=Depends(get_current_user)):
    del user
    return await create_live_token(get_settings())


@router.get("/history")
async def mascot_history(user=Depends(get_current_user), database=Depends(get_database)):
    return {"messages": await get_history(database, user["userId"])}


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mascot_history(user=Depends(get_current_user), database=Depends(get_database)):
    await clear_history(database, user["userId"])


@router.post("/chat", response_model=MascotChatResponse)
async def mascot_chat(
    payload: MascotChatRequest,
    user=Depends(get_current_user),
    database=Depends(get_database),
):
    message = payload.message.strip()
    if payload.trigger == "user" and not message:
        raise HTTPException(status_code=422, detail="A user message is required")

    user_id = user["userId"]
    history = await get_history(database, user_id)
    context = await build_study_context(database, user_id, payload.context)
    reply = await generate_reply(get_settings(), history, message, payload.trigger, context)

    if payload.trigger == "user":
        await append_history(database, user_id, [
            {"role": "user", "text": message},
            {"role": "assistant", "text": reply.text},
        ])
    return reply


@router.post("/live-history", status_code=status.HTTP_204_NO_CONTENT)
async def mascot_live_history(
    payload: MascotLiveHistoryRequest,
    user=Depends(get_current_user),
    database=Depends(get_database),
):
    await append_history(database, user["userId"], [
        {"role": "user", "text": payload.userText.strip()},
        {"role": "assistant", "text": payload.assistantText.strip()},
    ])
