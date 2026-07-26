import asyncio
from types import SimpleNamespace

import pytest
from youtube_transcript_api._errors import RequestBlocked

from app.routers import video


def test_extract_youtube_id_supports_common_url_shapes():
    assert video.extract_youtube_id("https://www.youtube.com/watch?v=pJdTyvufOdg") == "pJdTyvufOdg"
    assert video.extract_youtube_id("https://youtu.be/pJdTyvufOdg?si=test") == "pJdTyvufOdg"
    assert video.extract_youtube_id("https://www.youtube.com/shorts/pJdTyvufOdg") == "pJdTyvufOdg"
    assert video.extract_youtube_id("pJdTyvufOdg") == "pJdTyvufOdg"


def test_extract_youtube_playlist_id_supports_playlist_and_watch_urls():
    playlist_id = "PL123_test-playlist"
    assert video.extract_youtube_playlist_id(f"https://www.youtube.com/playlist?list={playlist_id}") == playlist_id
    assert video.extract_youtube_playlist_id(f"https://www.youtube.com/watch?v=pJdTyvufOdg&list={playlist_id}") == playlist_id
    assert video.extract_youtube_playlist_id(f"https://music.youtube.com/playlist?list={playlist_id}") == playlist_id
    assert video.extract_youtube_playlist_id("https://example.com/playlist?list=PL123") is None


def test_playlist_video_urls_normalizes_and_deduplicates_entries():
    result = video.playlist_video_urls({
        "entries": [
            {"id": "pJdTyvufOdg"},
            {"id": "pJdTyvufOdg"},
            {"url": "https://www.youtube.com/watch?v=abcdefghijk"},
            {"id": "not-a-video-id"},
            None,
        ]
    })

    assert result == [
        "https://www.youtube.com/watch?v=pJdTyvufOdg",
        "https://www.youtube.com/watch?v=abcdefghijk",
    ]


def test_extract_playlist_items_uses_canonical_playlist_url(monkeypatch):
    def fake_fetch(playlist_url):
        assert playlist_url == "https://www.youtube.com/playlist?list=PL123_test-playlist"
        return {
            "title": "English lessons",
            "entries": [{"id": "pJdTyvufOdg"}, {"id": "abcdefghijk"}],
        }

    monkeypatch.setattr(video, "fetch_youtube_playlist_info", fake_fetch)

    result = asyncio.run(video.extract_playlist_items(
        {"url": "https://www.youtube.com/watch?v=pJdTyvufOdg&list=PL123_test-playlist"},
        user={"userId": "test"},
    ))

    assert result == {
        "playlistId": "PL123_test-playlist",
        "title": "English lessons",
        "count": 2,
        "urls": [
            "https://www.youtube.com/watch?v=pJdTyvufOdg",
            "https://www.youtube.com/watch?v=abcdefghijk",
        ],
    }


def test_extract_video_info_does_not_require_video_formats(monkeypatch):
    async def fake_metadata(video_id):
        assert video_id == "pJdTyvufOdg"
        return "Test video", "https://example.com/thumbnail.jpg"

    class FakeTranscript:
        def __init__(self, *args, **kwargs):
            pass

        def fetch(self, video_id, languages):
            assert video_id == "pJdTyvufOdg"
            assert languages == ["en", "en-US", "en-GB"]
            return self

        def to_raw_data(self):
            return [{"text": "Hello", "start": 0.0, "duration": 1.0}]

    monkeypatch.setattr(video, "fetch_youtube_metadata", fake_metadata)
    monkeypatch.setattr(video, "YouTubeTranscriptApi", FakeTranscript)
    monkeypatch.setattr(video, "youtube_transcript_mode", lambda: "captions")

    result = asyncio.run(
        video.extract_video_info(
            {"url": "https://www.youtube.com/watch?v=pJdTyvufOdg"},
            user={"userId": "test"},
        )
    )

    assert result["videoId"] == "pJdTyvufOdg"
    assert result["title"] == "Test video"
    assert result["thumbnail"] == "https://example.com/thumbnail.jpg"
    assert result["transcript"] == [{"text": "Hello", "start": 0.0, "duration": 1.0}]


def test_parse_ytdlp_json3_transcript_normalizes_events():
    assert video.parse_ytdlp_json3_transcript({
        "events": [
            {
                "tStartMs": 1250,
                "dDurationMs": 2750,
                "segs": [{"utf8": "Hello"}, {"utf8": "\nworld"}],
            },
            {"tStartMs": 4000, "segs": [{"utf8": "   "}]},
            {"tStartMs": "bad", "segs": [{"utf8": "Ignored"}]},
        ]
    }) == [{"text": "Hello world", "start": 1.25, "duration": 2.75}]


def test_youtube_dlp_options_apply_server_side_proxy_and_cookie(monkeypatch):
    monkeypatch.setattr(video, "get_settings", lambda: SimpleNamespace(
        youtube_proxy_url="http://proxy-user:proxy-pass@example.test:8080",
        youtube_cookies_file="C:/private/youtube-cookies.txt",
    ))

    options = video.youtube_dlp_options()

    assert options["proxy"] == "http://proxy-user:proxy-pass@example.test:8080"
    assert options["cookiefile"] == "C:/private/youtube-cookies.txt"


def test_transcript_api_applies_generic_proxy(monkeypatch):
    class FakeFetchedTranscript:
        def to_raw_data(self):
            return [{"text": "Proxy works", "start": 0, "duration": 1}]

    class FakeTranscriptApi:
        def __init__(self, proxy_config):
            assert proxy_config.to_requests_dict() == {
                "http": "http://proxy.example.test:8080",
                "https": "http://proxy.example.test:8080",
            }

        def fetch(self, video_id, languages):
            assert video_id == "abcdefghijk"
            assert languages == ["en", "en-US", "en-GB"]
            return FakeFetchedTranscript()

    monkeypatch.setattr(video, "youtube_proxy_url", lambda: "http://proxy.example.test:8080")
    monkeypatch.setattr(video, "YouTubeTranscriptApi", FakeTranscriptApi)

    assert video.fetch_youtube_transcript_with_api("abcdefghijk")[0]["text"] == "Proxy works"


def test_caption_provider_stops_after_ip_block_without_proxy(monkeypatch):
    calls = []

    def blocked(_video_id):
        calls.append("api")
        raise RequestBlocked("abcdefghijk")

    def should_not_run(_video_id):
        calls.append("yt-dlp")
        raise AssertionError("yt-dlp subtitles should be skipped after a known direct-IP block")

    monkeypatch.setattr(video, "get_settings", lambda: SimpleNamespace(
        youtube_cookies_file="",
        youtube_proxy_url="",
    ))
    monkeypatch.setattr(video, "fetch_youtube_transcript_with_api", blocked)
    monkeypatch.setattr(video, "fetch_youtube_transcript_with_ytdlp", should_not_run)

    with pytest.raises(video.YouTubeIpBlockedError, match="YOUTUBE_PROXY_URL"):
        video.fetch_youtube_caption_transcript("abcdefghijk")

    assert calls == ["api"]


def test_ip_block_falls_back_to_local_whisper_and_opens_circuit(monkeypatch):
    calls = []

    def blocked(_video_id):
        calls.append("captions")
        raise RequestBlocked("abcdefghijk")

    def local(_video_id):
        calls.append("local")
        return [{"text": "Generated locally", "start": 0, "duration": 1}]

    monkeypatch.setattr(video, "get_settings", lambda: SimpleNamespace(
        youtube_transcript_mode="auto",
        youtube_transcript_cache_ttl_seconds=60,
    ))
    monkeypatch.setattr(video, "fetch_youtube_caption_transcript", blocked)
    monkeypatch.setattr(video, "fetch_youtube_transcript_locally", local)
    video.youtube_caption_blocked_until = 0

    try:
        first = video.fetch_youtube_transcript("abcdefghijk")
        second = video.fetch_youtube_transcript("abcdefghijk")

        assert first == second
        assert calls == ["captions", "local", "local"]
        assert video.youtube_caption_blocked_until > 0
    finally:
        video.youtube_caption_blocked_until = 0


def test_local_mode_never_calls_youtube_caption_endpoint(monkeypatch):
    monkeypatch.setattr(video, "get_settings", lambda: SimpleNamespace(
        youtube_transcript_mode="local",
    ))
    monkeypatch.setattr(
        video,
        "fetch_youtube_caption_transcript",
        lambda _video_id: pytest.fail("caption endpoint must not run in local mode"),
    )
    monkeypatch.setattr(
        video,
        "fetch_youtube_transcript_locally",
        lambda _video_id: [{"text": "Local only", "start": 0, "duration": 1}],
    )

    assert video.fetch_youtube_transcript("abcdefghijk")[0]["text"] == "Local only"


def test_local_whisper_segments_are_converted_to_video_transcript(monkeypatch):
    class FakeModel:
        def transcribe(self, audio_path, **options):
            assert audio_path.endswith("audio.webm")
            assert options["language"] == "en"
            assert options["vad_filter"] is True
            return iter([
                SimpleNamespace(text="  Hello   world ", start=1.25, end=3.5),
                SimpleNamespace(text=" ", start=4, end=5),
            ]), SimpleNamespace(language="en")

    monkeypatch.setattr(video, "get_youtube_whisper_model", lambda: FakeModel())

    assert video.transcribe_youtube_audio_locally(video.Path("audio.webm")) == [
        {"text": "Hello world", "start": 1.25, "duration": 2.25}
    ]


def test_local_transcription_deletes_temporary_audio(monkeypatch):
    captured_path = None

    def fake_download(_video_id, temp_dir):
        nonlocal captured_path
        captured_path = video.Path(temp_dir) / "audio.webm"
        captured_path.write_bytes(b"temporary audio")
        return captured_path

    def fake_transcribe(audio_path):
        assert audio_path.is_file()
        return [{"text": "Temporary", "start": 0, "duration": 1}]

    monkeypatch.setattr(video, "download_youtube_audio", fake_download)
    monkeypatch.setattr(video, "transcribe_youtube_audio_locally", fake_transcribe)

    assert video.fetch_youtube_transcript_locally("abcdefghijk")[0]["text"] == "Temporary"
    assert captured_path is not None and not captured_path.exists()


def test_rate_limited_transcript_reuses_successful_cache(monkeypatch):
    calls = []

    def fake_fetch(video_id):
        calls.append(video_id)
        return [{"text": "Cached", "start": 0, "duration": 1}]

    monkeypatch.setattr(video, "get_settings", lambda: SimpleNamespace(
        youtube_transcript_cache_ttl_seconds=60,
        youtube_request_interval_seconds=0,
    ))
    monkeypatch.setattr(video, "fetch_youtube_transcript", fake_fetch)
    video.youtube_transcript_cache.clear()
    video.youtube_last_request_started_at = 0

    async def scenario():
        first = await video.fetch_rate_limited_youtube_transcript("cachetest01")
        second = await video.fetch_rate_limited_youtube_transcript("cachetest01")
        assert first == second

    try:
        asyncio.run(scenario())
    finally:
        video.youtube_transcript_cache.clear()

    assert calls == ["cachetest01"]


def test_extract_video_info_returns_429_for_ip_block(monkeypatch):
    async def fake_metadata(_video_id):
        return "Blocked video", "https://example.com/thumbnail.jpg"

    async def blocked(_video_id):
        raise video.YouTubeIpBlockedError("Configure YOUTUBE_PROXY_URL")

    monkeypatch.setattr(video, "fetch_youtube_metadata", fake_metadata)
    monkeypatch.setattr(video, "fetch_rate_limited_youtube_transcript", blocked)

    with pytest.raises(video.HTTPException) as raised:
        asyncio.run(video.extract_video_info(
            {"url": "https://www.youtube.com/watch?v=abcdefghijk"},
            user={"userId": "test"},
        ))

    assert raised.value.status_code == 429
    assert raised.value.headers == {"Retry-After": "60"}
    assert "YOUTUBE_PROXY_URL" in raised.value.detail


def test_generate_vietnamese_speech_uses_hoaimy_voice(monkeypatch):
    class FakeCommunicate:
        def __init__(self, text, voice, rate):
            assert text == "Xin chào"
            assert voice == "vi-VN-HoaiMyNeural"
            assert rate == "+100%"

        async def stream(self):
            yield {"type": "SentenceBoundary"}
            yield {"type": "audio", "data": b"mp3-audio"}

    monkeypatch.setattr(video.edge_tts, "Communicate", FakeCommunicate)

    response = asyncio.run(
        video.generate_vietnamese_speech(
            {"text": "Xin chào", "rate": 150},
            user={"userId": "test"},
        )
    )

    assert response.body == b"mp3-audio"
    assert response.media_type == "audio/mpeg"
    assert response.headers["x-tts-voice"] == "vi-VN-HoaiMyNeural"


def test_synthesize_hoaimy_retries_without_rate_after_empty_audio(monkeypatch):
    requested_rates = []

    class FlakyCommunicate:
        def __init__(self, text, voice, rate):
            assert text == "Một câu ngắn"
            assert voice == "vi-VN-HoaiMyNeural"
            requested_rates.append(rate)

        async def stream(self):
            if len(requested_rates) < 3:
                raise video.NoAudioReceived("No audio was received")
            yield {"type": "audio", "data": b"recovered-audio"}

    async def skip_retry_delay(_delay):
        return None

    monkeypatch.setattr(video.edge_tts, "Communicate", FlakyCommunicate)
    monkeypatch.setattr(video.asyncio, "sleep", skip_retry_delay)

    audio = asyncio.run(video.synthesize_hoaimy_audio("Một câu ngắn", 100))

    assert audio == b"recovered-audio"
    assert requested_rates == ["+100%", "+100%", "+0%"]
