import hashlib
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from ..dependencies import get_current_user, get_database
from ..schemas import BackupEnvelope
from ..services.data_service import export_backup, has_user_data, replace_from_backup, validate_backup_data


router = APIRouter(prefix="/api", tags=["backups"])


def validate_envelope(backup: BackupEnvelope) -> dict[str, int]:
    if backup.format != "minuslearn-local-storage-backup" or backup.version != 1:
        raise HTTPException(status_code=422, detail="Unsupported backup format or version")
    try:
        return validate_backup_data(backup.data)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def backup_hash(backup: BackupEnvelope) -> str:
    canonical = json.dumps(backup.model_dump(mode="json"), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def transactional_replace(
    database,
    user_id: str,
    backup: BackupEnvelope,
    migration_hash: str | None = None,
) -> dict[str, int]:
    async with database.client.start_session() as session:
        async def callback(active_session):
            counts = await replace_from_backup(database, user_id, backup.data, session=active_session)
            if migration_hash:
                await database.migration_records.update_one(
                    {"userId": user_id, "backupHash": migration_hash},
                    {"$set": {
                        "userId": user_id,
                        "backupHash": migration_hash,
                        "status": "completed",
                        "counts": counts,
                        "completedAt": datetime.now(timezone.utc),
                    }},
                    upsert=True,
                    session=active_session,
                )
            return counts

        return await session.with_transaction(callback)


@router.get("/backups/export")
async def export_cloud_backup(user=Depends(get_current_user), database=Depends(get_database)):
    data = await export_backup(database, user["userId"])
    return {
        "format": "minuslearn-local-storage-backup",
        "version": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "data": data,
        "metadata": {"source": "mongodb", "entryCount": len(data)},
    }


@router.post("/backups/restore")
async def restore_cloud_backup(
    backup: BackupEnvelope,
    replace: bool = Query(False),
    user=Depends(get_current_user),
    database=Depends(get_database),
):
    validate_envelope(backup)
    if not replace:
        raise HTTPException(status_code=400, detail="replace=true is required")
    counts = await transactional_replace(database, user["userId"], backup)
    return {"status": "restored", "counts": counts}


@router.post("/migrations/local-storage/preview")
async def preview_local_storage(backup: BackupEnvelope, user=Depends(get_current_user)):
    return {"status": "valid", "counts": validate_envelope(backup), "backupHash": backup_hash(backup)}


@router.post("/migrations/local-storage/import")
async def import_local_storage(backup: BackupEnvelope, user=Depends(get_current_user), database=Depends(get_database)):
    validate_envelope(backup)
    uid = user["userId"]
    digest = backup_hash(backup)
    previous = await database.migration_records.find_one({"userId": uid, "backupHash": digest, "status": "completed"})
    if previous:
        return {"status": "already_imported", "counts": previous.get("counts", {}), "backupHash": digest}
    if await has_user_data(database, uid):
        raise HTTPException(status_code=409, detail="The account already contains learning data")

    counts = await transactional_replace(database, uid, backup, migration_hash=digest)
    return {"status": "imported", "counts": counts, "backupHash": digest}
