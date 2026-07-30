from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..config import get_settings
from ..dependencies import get_current_user, get_database
from ..schemas import (
    MascotChatRequest,
    MascotChatResponse,
    MascotSpeechRequest,
)
from ..services.edge_tts_service import MINO_VIETNAMESE_VOICE, synthesize_mino_speech
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
        "speechProvider": "edge-tts",
        "speechVoice": MINO_VIETNAMESE_VOICE,
    }


@router.post("/speech")
async def mascot_speech(
    payload: MascotSpeechRequest,
    user=Depends(get_current_user),
):
    del user
    try:
        audio = await synthesize_mino_speech(payload.text.strip())
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không thể tạo giọng Nam Minh lúc này",
        ) from error
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-TTS-Voice": MINO_VIETNAMESE_VOICE,
        },
    )


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
