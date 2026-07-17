from pymongo import ASCENDING, DESCENDING, AsyncMongoClient


async def create_indexes(database) -> None:
    await database.users.create_index("email", unique=True)
    for collection_name in (
        "topics",
        "words",
        "writing_sessions",
        "writing_sentence_mistakes",
        "exam_results",
    ):
        collection = database[collection_name]
        await collection.create_index(
            [("userId", ASCENDING), ("legacyId", ASCENDING)], unique=True
        )
        await collection.create_index("userId")

    await database.words.create_index([("userId", ASCENDING), ("topicId", ASCENDING)])
    await database.writing_sessions.create_index(
        [("userId", ASCENDING), ("startedAt", DESCENDING)]
    )
    await database.writing_sentence_mistakes.create_index(
        [("userId", ASCENDING), ("topicId", ASCENDING)]
    )
    await database.exam_results.create_index(
        [
            ("userId", ASCENDING),
            ("topicId", ASCENDING),
            ("difficulty", ASCENDING),
            ("totalScore", DESCENDING),
            ("timestamp", DESCENDING),
        ]
    )
    await database.video_learning_states.create_index(
        [("userId", ASCENDING), ("videoId", ASCENDING)], unique=True
    )
    await database.video_learning_states.create_index("userId")
    await database.video_learning_attempts.create_index(
        [("userId", ASCENDING), ("videoId", ASCENDING), ("createdAt", DESCENDING)]
    )
    await database.video_learning_attempts.create_index(
        [("userId", ASCENDING), ("videoId", ASCENDING), ("activity", ASCENDING)]
    )
    for collection_name in ("study_state", "user_settings", "exam_writing_drafts"):
        await database[collection_name].create_index("userId", unique=True)
    await database.migration_records.create_index(
        [("userId", ASCENDING), ("backupHash", ASCENDING)], unique=True
    )


def create_client(uri: str) -> AsyncMongoClient:
    return AsyncMongoClient(uri)
