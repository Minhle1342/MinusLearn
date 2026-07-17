import asyncio
from copy import deepcopy

import pytest
from fastapi import HTTPException

from app.routers.video import delete_video
from app.services.data_service import validate_backup_data
from app.services.video_learning_service import (
    MAX_ATTEMPTS_PER_VIDEO,
    add_learning_attempt,
    delete_learning_data,
    get_learning_state,
    list_learning_attempts,
    patch_learning_state,
)


def nested_set(document, path, value):
    target = document
    parts = path.split('.')
    for part in parts[:-1]:
        target = target.setdefault(part, {})
    target[parts[-1]] = value


def nested_get(document, path):
    target = document
    for part in path.split('.'):
        target = target.get(part, {})
    return target if target != {} else 0


class MemoryCursor:
    def __init__(self, documents):
        self.documents = [deepcopy(document) for document in documents]
        self.position = 0

    def sort(self, key, direction):
        self.documents.sort(key=lambda item: item.get(key), reverse=direction < 0)
        return self

    def limit(self, count):
        self.documents = self.documents[:count]
        return self

    def skip(self, count):
        self.documents = self.documents[count:]
        return self

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.position >= len(self.documents):
            raise StopAsyncIteration
        result = self.documents[self.position]
        self.position += 1
        return result


class MemoryCollection:
    def __init__(self):
        self.documents = []
        self.next_id = 1

    @staticmethod
    def matches(document, query):
        for key, expected in query.items():
            actual = document.get(key)
            if isinstance(expected, dict) and '$in' in expected:
                if actual not in expected['$in']:
                    return False
            elif actual != expected:
                return False
        return True

    async def find_one(self, query, **_kwargs):
        return next((deepcopy(item) for item in self.documents if self.matches(item, query)), None)

    async def replace_one(self, query, replacement, upsert=False, **_kwargs):
        for index, item in enumerate(self.documents):
            if self.matches(item, query):
                stored = deepcopy(replacement)
                stored.setdefault('_id', item.get('_id'))
                self.documents[index] = stored
                return
        if upsert:
            await self.insert_one(replacement)

    async def update_one(self, query, update, upsert=False, **_kwargs):
        document = next((item for item in self.documents if self.matches(item, query)), None)
        inserted = document is None
        if inserted:
            if not upsert:
                return
            document = {**query, '_id': self.next_id}
            self.next_id += 1
            self.documents.append(document)
        if inserted:
            for path, value in update.get('$setOnInsert', {}).items():
                nested_set(document, path, deepcopy(value))
        for path, value in update.get('$set', {}).items():
            nested_set(document, path, deepcopy(value))
        for path, value in update.get('$inc', {}).items():
            nested_set(document, path, nested_get(document, path) + value)

    async def insert_one(self, document, **_kwargs):
        stored = deepcopy(document)
        stored.setdefault('_id', self.next_id)
        self.next_id += 1
        self.documents.append(stored)

    def find(self, query, _projection=None):
        return MemoryCursor([item for item in self.documents if self.matches(item, query)])

    async def delete_many(self, query, **_kwargs):
        self.documents = [item for item in self.documents if not self.matches(item, query)]

    async def delete_one(self, query, **_kwargs):
        for index, item in enumerate(self.documents):
            if self.matches(item, query):
                self.documents.pop(index)
                return


class MemoryDatabase:
    def __init__(self):
        self.video_learning_states = MemoryCollection()
        self.video_learning_attempts = MemoryCollection()
        self.videos = MemoryCollection()


def test_learning_state_crud_is_isolated_by_user_and_filters_secrets():
    async def scenario():
        database = MemoryDatabase()
        updated = await patch_learning_state(database, 'user-a', 'video-1', {
            'bookmarks': [2],
            'notes': {'2': 'Useful line'},
            'preferences': {'playbackRate': 0.75},
            'apiKey': 'must-not-be-stored',
        })
        other_user = await get_learning_state(database, 'user-b', 'video-1')

        assert updated['bookmarks'] == [2]
        assert updated['preferences']['playbackRate'] == 0.75
        assert 'apiKey' not in database.video_learning_states.documents[0]
        assert other_user['bookmarks'] == []

        await delete_learning_data(database, 'user-a', 'video-1')
        assert await get_learning_state(database, 'user-a', 'video-1') == await get_learning_state(database, 'user-b', 'video-1')

    asyncio.run(scenario())


def test_learning_state_rejects_notes_over_one_thousand_characters():
    async def scenario():
        database = MemoryDatabase()
        with pytest.raises(HTTPException) as error:
            await patch_learning_state(database, 'user-a', 'video-1', {'notes': {'0': 'x' * 1001}})
        assert error.value.status_code == 422

    asyncio.run(scenario())


def test_learning_state_validates_ai_pack_before_persisting():
    async def scenario():
        database = MemoryDatabase()
        with pytest.raises(HTTPException) as error:
            await patch_learning_state(database, 'user-a', 'video-1', {
                'learningPackCache': {'bad-key': {'pack': {'summaryEnglish': 'Missing schema'}}},
            })
        assert error.value.status_code == 422

    asyncio.run(scenario())


def test_attempt_retention_keeps_latest_500_and_aggregate_all_time():
    async def scenario():
        database = MemoryDatabase()
        for index in range(MAX_ATTEMPTS_PER_VIDEO + 5):
            await add_learning_attempt(database, 'user-a', 'video-1', {
                'activity': 'dictation', 'lineIndex': index % 3, 'score': index % 101, 'hints': 1,
            })
        attempts = await list_learning_attempts(database, 'user-a', 'video-1', 500)
        state = await get_learning_state(database, 'user-a', 'video-1')
        assert len(attempts) == MAX_ATTEMPTS_PER_VIDEO
        assert state['aggregateStats']['totalAttempts'] == MAX_ATTEMPTS_PER_VIDEO + 5
        assert state['aggregateStats']['activities']['dictation']['attempts'] == MAX_ATTEMPTS_PER_VIDEO + 5

    asyncio.run(scenario())


def test_delete_video_cascades_only_its_learning_data():
    async def scenario():
        database = MemoryDatabase()
        await database.videos.insert_one({'userId': 'user-a', 'legacyId': 'video-1'})
        await patch_learning_state(database, 'user-a', 'video-1', {'bookmarks': [1]})
        await patch_learning_state(database, 'user-a', 'video-2', {'bookmarks': [2]})

        await delete_video('video-1', user={'userId': 'user-a'}, database=database)
        assert await database.videos.find_one({'legacyId': 'video-1'}) is None
        assert (await get_learning_state(database, 'user-a', 'video-1'))['bookmarks'] == []
        assert (await get_learning_state(database, 'user-a', 'video-2'))['bookmarks'] == [2]

    asyncio.run(scenario())


def test_old_and_new_backups_are_both_valid():
    old_counts = validate_backup_data({'minuslearn_topics': [], 'minuslearn_words': []})
    new_counts = validate_backup_data({
        'minuslearn_video_learning_states': [{'videoId': 'video-1'}],
        'minuslearn_video_learning_attempts': [{'videoId': 'video-1', 'activity': 'dictation'}],
    })
    assert old_counts['video_learning_states'] == 0
    assert old_counts['video_learning_attempts'] == 0
    assert new_counts['video_learning_states'] == 1
    assert new_counts['video_learning_attempts'] == 1
