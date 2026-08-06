import os
from pathlib import Path
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.routers.data import delete_word_image_files


@pytest.mark.anyio
async def test_delete_word_image_files_removes_file():
    upload_dir = Path("uploadImage")
    upload_dir.mkdir(exist_ok=True)
    
    dummy_file = upload_dir / "test_dummy_delete_123.jpg"
    dummy_file.write_bytes(b"dummy image data")
    
    assert dummy_file.exists()
    
    mock_db = MagicMock()
    mock_db.words.find_one = AsyncMock(return_value=None)
    
    words_to_delete = [
        {
            "id": "word-1",
            "legacyId": "word-1",
            "word": "test",
            "localImageUrl": "/uploadImage/test_dummy_delete_123.jpg"
        }
    ]
    
    await delete_word_image_files(mock_db, "user-1", words_to_delete)
    
    assert not dummy_file.exists()


@pytest.mark.anyio
async def test_delete_word_image_files_keeps_shared_file():
    upload_dir = Path("uploadImage")
    upload_dir.mkdir(exist_ok=True)
    
    dummy_file = upload_dir / "test_dummy_shared_456.jpg"
    dummy_file.write_bytes(b"shared image data")
    
    assert dummy_file.exists()
    
    mock_db = MagicMock()
    # Another word still uses this image
    mock_db.words.find_one = AsyncMock(return_value={"id": "other-word", "localImageUrl": "/uploadImage/test_dummy_shared_456.jpg"})
    
    words_to_delete = [
        {
            "id": "word-2",
            "legacyId": "word-2",
            "word": "shared_test",
            "localImageUrl": "/uploadImage/test_dummy_shared_456.jpg"
        }
    ]
    
    await delete_word_image_files(mock_db, "user-1", words_to_delete)
    
    assert dummy_file.exists()
    
    # Cleanup dummy file after test
    if dummy_file.exists():
        dummy_file.unlink()
