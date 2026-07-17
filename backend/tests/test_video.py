import asyncio

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
        def fetch(self, video_id, languages):
            assert video_id == "pJdTyvufOdg"
            assert languages == ["en", "en-US", "en-GB"]
            return self

        def to_raw_data(self):
            return [{"text": "Hello", "start": 0.0, "duration": 1.0}]

    monkeypatch.setattr(video, "fetch_youtube_metadata", fake_metadata)
    monkeypatch.setattr(video, "YouTubeTranscriptApi", FakeTranscript)

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
