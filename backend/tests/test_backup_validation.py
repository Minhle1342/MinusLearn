import pytest

from app.services.data_service import sanitize_settings, validate_backup_data


def test_sensitive_settings_are_removed():
    assert sanitize_settings({"theme": "tokyo", "apiKey": "secret", "pexelsApiKey": "secret"}) == {
        "theme": "tokyo"
    }


def test_backup_validation_counts_array_data():
    counts = validate_backup_data(
        {
            "minuslearn_topics": [{"id": "default"}],
            "minuslearn_words": [{"id": "word-1"}],
            "minuslearn_writing_sessions": [],
            "minuslearn_writing_sentence_mistakes": [],
            "minuslearn_exam_history": [],
            "minuslearn_settings": {},
        }
    )
    assert counts["topics"] == 1
    assert counts["words"] == 1


def test_backup_validation_rejects_invalid_arrays():
    with pytest.raises(ValueError):
        validate_backup_data({"minuslearn_topics": {"id": "bad"}})

