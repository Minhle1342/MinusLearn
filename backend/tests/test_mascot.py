import asyncio
from copy import deepcopy

import httpx
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.services import mascot_service
from app.services import gemini_live_service
from app.services.gemini_live_service import create_live_token
from app.services.mascot_service import (
    apply_response_guardrails,
    append_history,
    build_study_context,
    check_ollama,
    generate_reply,
    get_history,
    normalize_model_response,
    select_skill,
)


class MemoryCursor:
    def __init__(self, documents):
        self.documents = [deepcopy(item) for item in documents]

    def limit(self, count):
        self.documents = self.documents[:count]
        return self

    def __aiter__(self):
        self.position = 0
        return self

    async def __anext__(self):
        if self.position >= len(self.documents):
            raise StopAsyncIteration
        item = self.documents[self.position]
        self.position += 1
        return deepcopy(item)


class MemoryCollection:
    def __init__(self, documents=None):
        self.documents = [deepcopy(item) for item in (documents or [])]

    @staticmethod
    def matches(document, query):
        return all(document.get(key) == value for key, value in query.items())

    async def find_one(self, query):
        return next((deepcopy(item) for item in self.documents if self.matches(item, query)), None)

    def find(self, query):
        return MemoryCursor([item for item in self.documents if self.matches(item, query)])

    async def update_one(self, query, update, upsert=False):
        document = next((item for item in self.documents if self.matches(item, query)), None)
        if document is None:
            if not upsert:
                return
            document = dict(query)
            self.documents.append(document)
        document.update(deepcopy(update.get('$set', {})))

    async def delete_many(self, query):
        self.documents = [item for item in self.documents if not self.matches(item, query)]


class MemoryDatabase:
    def __init__(self, words=None, topics=None, study=None):
        self.words = MemoryCollection(words)
        self.topics = MemoryCollection(topics)
        self.study_state = MemoryCollection(study)
        self.mascot_conversations = MemoryCollection()


def test_context_is_user_scoped_and_caps_due_word_samples():
    async def scenario():
        words = [
            {'userId': 'user-a', 'legacyId': f'word-{index}', 'topicId': 'topic-1', 'word': f'word{index}', 'meaning': 'meaning'}
            for index in range(10)
        ] + [
            {'userId': 'user-b', 'legacyId': 'private-word', 'topicId': 'topic-1', 'word': 'private'}
        ]
        sr_data = {f'word-{index}': {'nextReviewDate': 1} for index in range(10)}
        database = MemoryDatabase(
            words=words,
            topics=[{'userId': 'user-a', 'legacyId': 'topic-1', 'name': 'Travel'}],
            study=[{'userId': 'user-a', 'srData': sr_data, 'readingMistakes': {'word-0': True}}],
        )

        context = await build_study_context(database, 'user-a', {
            'activePage': 'reading', 'topicId': 'topic-1', 'apiKey': 'must-not-pass',
        })

        assert context['topic'] == 'Travel'
        assert context['wordCounts']['total'] == 10
        assert context['wordCounts']['due'] == 10
        assert len(context['dueWords']) == 8
        assert len(context['focusWords']) == 8
        assert context['focusWords'][0]['word'] == 'word0'
        assert context['mistakes']['reading'] == ['word0']
        assert 'private' not in str(context)
        assert 'apiKey' not in str(context)

    asyncio.run(scenario())


def test_history_is_isolated_and_capped_at_thirty_messages():
    async def scenario():
        database = MemoryDatabase()
        await append_history(database, 'user-a', [
            {'role': 'user' if index % 2 == 0 else 'assistant', 'text': f'message-{index}'}
            for index in range(35)
        ])
        assert len(await get_history(database, 'user-a')) == 30
        assert (await get_history(database, 'user-a'))[0]['text'] == 'message-5'
        assert await get_history(database, 'user-b') == []

    asyncio.run(scenario())


def test_model_output_is_allowlisted_and_trimmed():
    response = normalize_model_response({
        'text': 'Keep going!',
        'language': 'xx',
        'emotion': 'angry',
        'skill': 'do_everything',
        'quickReplies': ['one', 'two', 'three', 'four'],
        'action': {'type': 'navigate', 'page': 'admin'},
    })
    assert response.language == 'vi'
    assert response.emotion == 'neutral'
    assert response.skill == 'general'
    assert response.quickReplies == ['one', 'two', 'three']
    assert response.action is None


def test_skill_routing_prefers_learning_events_and_due_work():
    assert select_skill('Let us begin', 'event', {
        'event': {'type': 'roleplay_start'}, 'wordCounts': {'due': 0}, 'mistakes': {},
    }) == 'roleplay'
    assert select_skill('Vì sao mình sai?', 'user', {
        'event': {'type': 'wrong_answer', 'userAnswer': 'go', 'correctAnswer': 'went'},
        'wordCounts': {'due': 0}, 'mistakes': {},
    }) == 'mistake_explanation'
    assert select_skill('', 'timed', {
        'event': {'type': 'daily_mission'}, 'wordCounts': {'due': 2}, 'mistakes': {},
    }) == 'review_coach'
    assert select_skill('Please correct: She go home.', 'user', {
        'page': 'writing', 'wordCounts': {'due': 0}, 'mistakes': {},
    }) == 'sentence_correction'


def test_timed_review_guardrail_uses_real_due_count_and_word():
    response = normalize_model_response({
        'text': 'An overly long and unreliable proactive answer.',
        'language': 'en',
        'emotion': 'neutral',
        'skill': 'review_coach',
    }, 'review_coach')
    guarded = apply_response_guardrails(response, 'timed', {
        'wordCounts': {'due': 3},
        'dueWords': [{'word': 'itinerary', 'meaning': 'lịch trình'}],
    })
    assert guarded.text == "Bạn có 3 từ đến hạn. Khởi động nhé: ‘itinerary’ nghĩa là gì?"
    assert guarded.language == 'vi'


def test_invalid_ollama_json_returns_contextual_fallback(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {'message': {'content': 'not-json'}}

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return Response()

    async def scenario():
        monkeypatch.setattr(mascot_service.httpx, 'AsyncClient', Client)
        response = await generate_reply(
            Settings(), [], 'Help me', 'user',
            {'topic': 'Travel', 'wordCounts': {'due': 4}},
        )
        assert response.source == 'fallback'
        assert response.emotion == 'concerned'
        assert '4 từ cần ôn' in response.text

    asyncio.run(scenario())


def test_health_reports_offline_without_raising(monkeypatch):
    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, *_args, **_kwargs):
            raise httpx.ConnectError('offline')

    async def scenario():
        monkeypatch.setattr(mascot_service.httpx, 'AsyncClient', Client)
        result = await check_ollama(Settings())
        assert result == {'online': False, 'modelAvailable': False, 'model': 'qwen2.5:1.5b'}

    asyncio.run(scenario())


def test_live_token_is_short_lived_and_hides_api_key(monkeypatch):
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {'name': 'ephemeral-token'}

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, headers, json):
            captured.update({'url': url, 'headers': headers, 'json': json})
            return Response()

    async def scenario():
        monkeypatch.setattr(gemini_live_service.httpx, 'AsyncClient', Client)
        result = await create_live_token(Settings(gemini_live_api_key='server-secret'))
        assert result['token'] == 'ephemeral-token'
        assert result['model'] == 'gemini-3.1-flash-live-preview'
        assert 'server-secret' not in str(result)
        assert captured['headers']['x-goog-api-key'] == 'server-secret'
        assert captured['json']['uses'] == 1
        assert captured['json']['newSessionExpireTime'] < captured['json']['expireTime']

    asyncio.run(scenario())


def test_live_token_requires_server_configuration():
    async def scenario():
        with pytest.raises(HTTPException) as error:
            await create_live_token(Settings(gemini_live_api_key=''))
        assert error.value.status_code == 503

    asyncio.run(scenario())
