import asyncio
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Body, Depends, HTTPException, Response
import edge_tts
from edge_tts.exceptions import NoAudioReceived
import httpx
from youtube_transcript_api import YouTubeTranscriptApi
import yt_dlp
from yt_dlp.utils import DownloadError

from ..dependencies import get_current_user, get_database
from ..services.data_service import list_documents, replace_documents, upsert_document, patch_document

router = APIRouter(prefix="/api", tags=["video"])
HOAIMY_VOICE = "vi-VN-HoaiMyNeural"
HOAIMY_MAX_CONCURRENT_REQUESTS = 2
HOAIMY_RETRY_DELAYS = (0.25, 0.75)
hoaimy_request_semaphore = asyncio.Semaphore(HOAIMY_MAX_CONCURRENT_REQUESTS)

def user_id(user: dict) -> str:
    return user["userId"]

async def replace_resource(collection: str, payload: list[dict], user: dict, database):
    return await replace_documents(database, collection, user_id(user), payload)

def extract_youtube_id(url: str) -> str | None:
    parsed = urlparse(url.strip())
    host = parsed.netloc.lower().removeprefix("www.")

    if host in {"youtube.com", "m.youtube.com"}:
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [None])[0]
        if parsed.path.startswith("/shorts/") or parsed.path.startswith("/embed/"):
            return parsed.path.split("/")[2] or None

    if host == "youtu.be":
        return parsed.path.lstrip("/").split("/")[0] or None

    if len(url.strip()) == 11:
        return url.strip()

    return None


def extract_youtube_playlist_id(url: str) -> str | None:
    parsed = urlparse(str(url or "").strip())
    host = parsed.netloc.lower().removeprefix("www.")
    if host not in {"youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}:
        return None

    playlist_id = parse_qs(parsed.query).get("list", [None])[0]
    if not playlist_id or not all(character.isalnum() or character in "-_" for character in playlist_id):
        return None
    return playlist_id


def fetch_youtube_playlist_info(playlist_url: str) -> dict:
    options = {
        "extract_flat": "in_playlist",
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        return downloader.extract_info(playlist_url, download=False)


def playlist_video_urls(playlist_info: dict) -> list[str]:
    urls = []
    known_ids = set()

    for entry in playlist_info.get("entries") or []:
        if not entry:
            continue
        video_id = str(entry.get("id") or "")
        if len(video_id) != 11 or not all(character.isalnum() or character in "-_" for character in video_id):
            video_id = extract_youtube_id(str(entry.get("url") or "")) or ""
        if (
            len(video_id) != 11
            or not all(character.isalnum() or character in "-_" for character in video_id)
            or video_id in known_ids
        ):
            continue
        known_ids.add(video_id)
        urls.append(f"https://www.youtube.com/watch?v={video_id}")

    return urls


async def fetch_youtube_metadata(video_id: str) -> tuple[str, str]:
    title = "Unknown Title"
    thumbnail = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://www.youtube.com/oembed",
                params={
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "format": "json",
                },
            )
            response.raise_for_status()
            metadata = response.json()
            title = metadata.get("title") or title
            thumbnail = metadata.get("thumbnail_url") or thumbnail
    except (httpx.HTTPError, ValueError):
        pass

    return title, thumbnail


def format_edge_rate(value) -> str:
    try:
        rate = round(float(value))
    except (TypeError, ValueError):
        rate = 0
    return f"{max(-50, min(100, rate)):+d}%"


async def synthesize_hoaimy_audio_once(text: str, rate: str) -> bytes:
    audio = bytearray()
    communicate = edge_tts.Communicate(
        text,
        HOAIMY_VOICE,
        rate=rate,
    )

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])

    if not audio:
        raise RuntimeError("Edge TTS returned no audio")
    return bytes(audio)


async def synthesize_hoaimy_audio(text: str, rate) -> bytes:
    requested_rate = format_edge_rate(rate)
    attempt_rates = (requested_rate, requested_rate, "+0%")
    last_error = None

    async with hoaimy_request_semaphore:
        for attempt, attempt_rate in enumerate(attempt_rates):
            try:
                return await synthesize_hoaimy_audio_once(text, attempt_rate)
            except NoAudioReceived as error:
                last_error = error
                if attempt < len(HOAIMY_RETRY_DELAYS):
                    await asyncio.sleep(HOAIMY_RETRY_DELAYS[attempt])

    raise last_error or RuntimeError("Edge TTS returned no audio")

@router.post("/videos/extract-info")
async def extract_video_info(payload: dict = Body(...), user=Depends(get_current_user)):
    youtube_url = payload.get("url")
    if not youtube_url:
        raise HTTPException(status_code=400, detail="Missing YouTube URL")

    parsed_video_id = extract_youtube_id(youtube_url)
    if not parsed_video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    title, thumbnail = await fetch_youtube_metadata(parsed_video_id)

    try:
        transcript = (
            YouTubeTranscriptApi()
            .fetch(parsed_video_id, languages=["en", "en-US", "en-GB"])
            .to_raw_data()
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract transcript: {str(e)}") from e

    return {
        "videoId": parsed_video_id,
        "title": title,
        "thumbnail": thumbnail,
        "transcript": transcript
    }


@router.post("/videos/playlist-items")
async def extract_playlist_items(payload: dict = Body(...), user=Depends(get_current_user)):
    playlist_id = extract_youtube_playlist_id(payload.get("url"))
    if not playlist_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube playlist URL")

    playlist_url = f"https://www.youtube.com/playlist?list={playlist_id}"
    try:
        playlist_info = await asyncio.to_thread(fetch_youtube_playlist_info, playlist_url)
    except DownloadError as error:
        raise HTTPException(status_code=400, detail=f"Failed to extract playlist: {error}") from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Failed to extract playlist: {error}") from error

    urls = playlist_video_urls(playlist_info)
    if not urls:
        raise HTTPException(status_code=400, detail="No accessible videos found in this playlist")

    return {
        "playlistId": playlist_id,
        "title": playlist_info.get("title") or "YouTube playlist",
        "count": len(urls),
        "urls": urls,
    }


@router.post("/videos/tts")
async def generate_vietnamese_speech(payload: dict = Body(...), user=Depends(get_current_user)):
    text = str(payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Missing Vietnamese text")
    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="Vietnamese text is too long")

    try:
        audio = await synthesize_hoaimy_audio(text, payload.get("rate", 0))
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Failed to generate HoaiMy voice: {error}") from error

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-TTS-Voice": HOAIMY_VOICE,
        },
    )

@router.get("/videos")
async def get_videos(user=Depends(get_current_user), database=Depends(get_database)):
    return await list_documents(database, "videos", user_id(user))

@router.put("/videos")
async def put_videos(payload: list[dict] = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    return await replace_resource("videos", payload, user, database)

@router.post("/videos", status_code=201)
async def create_video(payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    return await upsert_document(database, "videos", user_id(user), payload)

@router.patch("/videos/{legacy_id}")
async def update_video(legacy_id: str, payload: dict = Body(...), user=Depends(get_current_user), database=Depends(get_database)):
    result = await patch_document(database, "videos", user_id(user), legacy_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Video not found")
    return result

@router.delete("/videos/{legacy_id}", status_code=204)
async def delete_video(legacy_id: str, user=Depends(get_current_user), database=Depends(get_database)):
    await database.videos.delete_one({"userId": user_id(user), "legacyId": legacy_id})
