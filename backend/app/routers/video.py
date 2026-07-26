import asyncio
from collections import OrderedDict
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import time
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Body, Depends, HTTPException, Response
import edge_tts
from edge_tts.exceptions import NoAudioReceived
import httpx
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import IpBlocked, RequestBlocked
from youtube_transcript_api.proxies import GenericProxyConfig
import yt_dlp
from yt_dlp.utils import DownloadError

from ..config import get_settings
from ..dependencies import get_current_user, get_database
from ..services.data_service import list_documents, replace_documents, upsert_document, patch_document
from ..services.video_learning_service import (
    add_learning_attempt,
    delete_learning_data,
    get_learning_state,
    list_learning_attempts,
    patch_learning_state,
)

router = APIRouter(prefix="/api", tags=["video"])
HOAIMY_VOICE = "vi-VN-HoaiMyNeural"
HOAIMY_MAX_CONCURRENT_REQUESTS = 2
HOAIMY_RETRY_DELAYS = (0.25, 0.75)
hoaimy_request_semaphore = asyncio.Semaphore(HOAIMY_MAX_CONCURRENT_REQUESTS)
YOUTUBE_TRANSCRIPT_LANGUAGES = ["en", "en-US", "en-GB"]
YOUTUBE_TRANSCRIPT_CACHE_MAX_ITEMS = 256
YOUTUBE_IP_BLOCK_MESSAGE = (
    "YouTube đang giới hạn IP của máy chủ (HTTP 429). MinusLearn đã thử các nguồn phụ đề "
    "khả dụng. Hãy cấu hình YOUTUBE_PROXY_URL bằng rotating residential proxy rồi khởi "
    "động lại backend, hoặc chờ IP được gỡ chặn."
)
youtube_request_lock = asyncio.Lock()
youtube_last_request_started_at = 0.0
youtube_transcript_cache: OrderedDict[str, tuple[float, list[dict]]] = OrderedDict()
youtube_caption_blocked_until = 0.0
youtube_whisper_models = {}


class YouTubeIpBlockedError(RuntimeError):
    pass


class YouTubeTranscriptUnavailableError(RuntimeError):
    pass


class YouTubeLocalTranscriptionError(RuntimeError):
    pass


class YtDlpSilentLogger:
    def debug(self, _message):
        pass

    def info(self, _message):
        pass

    def warning(self, _message):
        pass

    def error(self, _message):
        pass


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


def youtube_proxy_url() -> str:
    return get_settings().youtube_proxy_url.strip()


def youtube_dlp_options() -> dict:
    settings = get_settings()
    options = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "retries": 1,
        "logger": YtDlpSilentLogger(),
    }
    if settings.youtube_proxy_url.strip():
        options["proxy"] = settings.youtube_proxy_url.strip()
    if settings.youtube_cookies_file.strip():
        options["cookiefile"] = settings.youtube_cookies_file.strip()
    return options


def fetch_youtube_playlist_info(playlist_url: str) -> dict:
    options = {
        **youtube_dlp_options(),
        "extract_flat": "in_playlist",
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        return downloader.extract_info(playlist_url, download=False)


def parse_ytdlp_json3_transcript(payload: dict) -> list[dict]:
    transcript = []
    for event in payload.get("events") or []:
        segments = event.get("segs") or []
        text = "".join(str(segment.get("utf8") or "") for segment in segments)
        text = " ".join(text.replace("\n", " ").split())
        if not text:
            continue

        try:
            start = max(0.0, float(event.get("tStartMs") or 0) / 1000)
            duration = max(0.0, float(event.get("dDurationMs") or 0) / 1000)
        except (TypeError, ValueError):
            continue

        transcript.append({"text": text, "start": start, "duration": duration})
    return transcript


def fetch_youtube_transcript_with_ytdlp(video_id: str) -> list[dict]:
    with tempfile.TemporaryDirectory(prefix="minuslearn-youtube-") as temp_dir:
        options = {
            **youtube_dlp_options(),
            "noplaylist": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["en"],
            "subtitlesformat": "json3",
            "outtmpl": str(Path(temp_dir) / "%(id)s.%(ext)s"),
        }
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(
                f"https://www.youtube.com/watch?v={video_id}",
                download=True,
            )

        requested_subtitles = info.get("requested_subtitles") or {}
        subtitle = requested_subtitles.get("en") or next(iter(requested_subtitles.values()), None)
        subtitle_path = Path(str((subtitle or {}).get("filepath") or ""))
        if not subtitle_path.is_file():
            matches = list(Path(temp_dir).glob(f"{video_id}*.json3"))
            subtitle_path = matches[0] if matches else subtitle_path
        if not subtitle_path.is_file():
            raise YouTubeTranscriptUnavailableError("yt-dlp did not return an English subtitle")

        with subtitle_path.open("r", encoding="utf-8") as subtitle_file:
            transcript = parse_ytdlp_json3_transcript(json.load(subtitle_file))
        if not transcript:
            raise YouTubeTranscriptUnavailableError("yt-dlp returned an empty English subtitle")
        return transcript


def youtube_transcript_mode() -> str:
    mode = get_settings().youtube_transcript_mode.strip().lower()
    return mode if mode in {"auto", "captions", "local"} else "auto"


def get_youtube_whisper_model():
    settings = get_settings()
    model_key = (
        settings.youtube_whisper_model.strip() or "base.en",
        settings.youtube_whisper_device.strip() or "cpu",
        settings.youtube_whisper_compute_type.strip() or "int8",
    )
    if model_key not in youtube_whisper_models:
        try:
            from faster_whisper import WhisperModel
        except ImportError as error:
            raise YouTubeLocalTranscriptionError(
                "Thiếu faster-whisper. Hãy cài lại backend requirements."
            ) from error
        youtube_whisper_models[model_key] = WhisperModel(
            model_key[0],
            device=model_key[1],
            compute_type=model_key[2],
        )
    return youtube_whisper_models[model_key]


def download_youtube_audio(video_id: str, temp_dir: str) -> Path:
    max_duration = max(60, get_settings().youtube_whisper_max_duration_seconds)

    def reject_long_video(info, *, incomplete):
        if incomplete:
            return None
        duration = float(info.get("duration") or 0)
        if duration > max_duration:
            return f"Video dài hơn giới hạn local transcription ({max_duration} giây)"
        return None

    options = {
        **youtube_dlp_options(),
        "skip_download": False,
        "noplaylist": True,
        "format": "ba[abr<=96]/ba/b[height<=360]",
        "match_filter": reject_long_video,
        "outtmpl": str(Path(temp_dir) / "%(id)s.%(ext)s"),
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        downloader.extract_info(
            f"https://www.youtube.com/watch?v={video_id}",
            download=True,
        )

    audio_files = [
        path for path in Path(temp_dir).iterdir()
        if path.is_file() and path.suffix not in {".part", ".ytdl"}
    ]
    if not audio_files:
        raise YouTubeLocalTranscriptionError("yt-dlp không tải được luồng audio của video")
    return max(audio_files, key=lambda path: path.stat().st_size)


def transcribe_youtube_audio_locally(audio_path: Path) -> list[dict]:
    try:
        segments, _info = get_youtube_whisper_model().transcribe(
            str(audio_path),
            language="en",
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        transcript = []
        for segment in segments:
            text = " ".join(str(segment.text or "").split())
            if not text:
                continue
            start = max(0.0, float(segment.start or 0))
            end = max(start, float(segment.end or start))
            transcript.append({
                "text": text,
                "start": start,
                "duration": end - start,
            })
    except YouTubeLocalTranscriptionError:
        raise
    except Exception as error:
        raise YouTubeLocalTranscriptionError("Whisper không thể nhận dạng audio của video") from error

    if not transcript:
        raise YouTubeLocalTranscriptionError("Whisper không nhận dạng được câu tiếng Anh nào")
    return transcript


def fetch_youtube_transcript_locally(video_id: str) -> list[dict]:
    with tempfile.TemporaryDirectory(prefix="minuslearn-whisper-") as temp_dir:
        audio_path = download_youtube_audio(video_id, temp_dir)
        return transcribe_youtube_audio_locally(audio_path)


def fetch_youtube_transcript_with_api(video_id: str) -> list[dict]:
    proxy_url = youtube_proxy_url()
    transcript_api = YouTubeTranscriptApi(
        proxy_config=GenericProxyConfig(http_url=proxy_url, https_url=proxy_url)
    ) if proxy_url else YouTubeTranscriptApi()
    return transcript_api.fetch(video_id, languages=YOUTUBE_TRANSCRIPT_LANGUAGES).to_raw_data()


def is_youtube_ip_block(error: Exception) -> bool:
    message = str(error).lower()
    return isinstance(error, (IpBlocked, RequestBlocked)) or any(marker in message for marker in (
        "http error 429",
        "too many requests",
        "blocking requests from your ip",
        "requestblocked",
        "ipblocked",
    ))


def fetch_youtube_caption_transcript(video_id: str) -> list[dict]:
    settings = get_settings()
    providers = (
        (fetch_youtube_transcript_with_ytdlp, fetch_youtube_transcript_with_api)
        if settings.youtube_cookies_file.strip()
        else (fetch_youtube_transcript_with_api, fetch_youtube_transcript_with_ytdlp)
    )
    errors = []
    for provider in providers:
        try:
            return provider(video_id)
        except Exception as error:
            errors.append(error)
            if is_youtube_ip_block(error) and not (
                settings.youtube_proxy_url.strip() or settings.youtube_cookies_file.strip()
            ):
                break

    if any(is_youtube_ip_block(error) for error in errors):
        raise YouTubeIpBlockedError(YOUTUBE_IP_BLOCK_MESSAGE) from errors[-1]
    raise YouTubeTranscriptUnavailableError(
        "Video không có phụ đề tiếng Anh khả dụng hoặc YouTube đã từ chối truy cập phụ đề."
    ) from errors[-1]


def fetch_youtube_transcript(video_id: str) -> list[dict]:
    global youtube_caption_blocked_until
    mode = youtube_transcript_mode()
    caption_error = None

    if mode != "local" and (
        mode == "captions" or time.monotonic() >= youtube_caption_blocked_until
    ):
        try:
            return fetch_youtube_caption_transcript(video_id)
        except Exception as error:
            caption_error = error
            if is_youtube_ip_block(error) or isinstance(error, YouTubeIpBlockedError):
                circuit_seconds = max(60, get_settings().youtube_transcript_cache_ttl_seconds)
                youtube_caption_blocked_until = time.monotonic() + circuit_seconds
            if mode == "captions":
                raise

    try:
        return fetch_youtube_transcript_locally(video_id)
    except Exception as local_error:
        if is_youtube_ip_block(local_error):
            raise YouTubeIpBlockedError(
                "YouTube đang giới hạn cả luồng audio; local transcription chưa thể chạy."
            ) from local_error
        if caption_error:
            raise YouTubeLocalTranscriptionError(
                "Không lấy được caption và local Whisper cũng không thể tạo transcript."
            ) from local_error
        raise


def get_cached_youtube_transcript(video_id: str) -> list[dict] | None:
    cached = youtube_transcript_cache.get(video_id)
    if not cached:
        return None
    cached_at, transcript = cached
    if time.monotonic() - cached_at > max(0, get_settings().youtube_transcript_cache_ttl_seconds):
        youtube_transcript_cache.pop(video_id, None)
        return None
    youtube_transcript_cache.move_to_end(video_id)
    return deepcopy(transcript)


def cache_youtube_transcript(video_id: str, transcript: list[dict]) -> None:
    youtube_transcript_cache[video_id] = (time.monotonic(), deepcopy(transcript))
    youtube_transcript_cache.move_to_end(video_id)
    while len(youtube_transcript_cache) > YOUTUBE_TRANSCRIPT_CACHE_MAX_ITEMS:
        youtube_transcript_cache.popitem(last=False)


async def fetch_rate_limited_youtube_transcript(video_id: str) -> list[dict]:
    cached = get_cached_youtube_transcript(video_id)
    if cached is not None:
        return cached

    global youtube_last_request_started_at
    async with youtube_request_lock:
        cached = get_cached_youtube_transcript(video_id)
        if cached is not None:
            return cached

        interval = max(0.0, get_settings().youtube_request_interval_seconds)
        wait_seconds = interval - (time.monotonic() - youtube_last_request_started_at)
        if wait_seconds > 0:
            await asyncio.sleep(wait_seconds)
        youtube_last_request_started_at = time.monotonic()
        transcript = await asyncio.to_thread(fetch_youtube_transcript, video_id)
        cache_youtube_transcript(video_id, transcript)
        return transcript


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
        transcript = await fetch_rate_limited_youtube_transcript(parsed_video_id)
    except YouTubeIpBlockedError as error:
        raise HTTPException(status_code=429, detail=str(error), headers={"Retry-After": "60"}) from error
    except YouTubeTranscriptUnavailableError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except YouTubeLocalTranscriptionError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Không thể trích xuất phụ đề YouTube lúc này.") from error

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
        if is_youtube_ip_block(error):
            raise HTTPException(
                status_code=429,
                detail=YOUTUBE_IP_BLOCK_MESSAGE,
                headers={"Retry-After": "60"},
            ) from error
        raise HTTPException(status_code=400, detail="Không thể lấy danh sách phát YouTube.") from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Không thể kết nối YouTube để lấy danh sách phát.") from error

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
    uid = user_id(user)
    await database.videos.delete_one({"userId": uid, "legacyId": legacy_id})
    await delete_learning_data(database, uid, legacy_id)


@router.get("/videos/{video_id}/learning-state")
async def get_video_learning_state(video_id: str, user=Depends(get_current_user), database=Depends(get_database)):
    return await get_learning_state(database, user_id(user), video_id)


@router.patch("/videos/{video_id}/learning-state")
async def update_video_learning_state(
    video_id: str,
    payload: dict = Body(...),
    user=Depends(get_current_user),
    database=Depends(get_database),
):
    return await patch_learning_state(database, user_id(user), video_id, payload)


@router.delete("/videos/{video_id}/learning-state", status_code=204)
async def reset_video_learning_state(video_id: str, user=Depends(get_current_user), database=Depends(get_database)):
    await delete_learning_data(database, user_id(user), video_id)


@router.get("/videos/{video_id}/learning-attempts")
async def get_video_learning_attempts(
    video_id: str,
    limit: int = 100,
    user=Depends(get_current_user),
    database=Depends(get_database),
):
    return await list_learning_attempts(database, user_id(user), video_id, limit)


@router.post("/videos/{video_id}/learning-attempts", status_code=201)
async def create_video_learning_attempt(
    video_id: str,
    payload: dict = Body(...),
    user=Depends(get_current_user),
    database=Depends(get_database),
):
    return await add_learning_attempt(database, user_id(user), video_id, payload)
