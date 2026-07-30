from __future__ import annotations

import asyncio

import edge_tts


MINO_VIETNAMESE_VOICE = "vi-VN-NamMinhNeural"
EDGE_TTS_RETRY_DELAYS = (0.25, 0.75)
edge_tts_semaphore = asyncio.Semaphore(2)


async def _synthesize_once(text: str, voice: str, rate: str) -> bytes:
    audio = bytearray()
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    if not audio:
        raise RuntimeError("Edge TTS returned no audio")
    return bytes(audio)


async def synthesize_mino_speech(text: str) -> bytes:
    last_error = None
    async with edge_tts_semaphore:
        for attempt in range(3):
            try:
                return await _synthesize_once(text, MINO_VIETNAMESE_VOICE, "+0%")
            except Exception as error:
                last_error = error
                if attempt < len(EDGE_TTS_RETRY_DELAYS):
                    await asyncio.sleep(EDGE_TTS_RETRY_DELAYS[attempt])
    raise last_error or RuntimeError("Edge TTS returned no audio")
