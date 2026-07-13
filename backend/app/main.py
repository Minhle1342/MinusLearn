from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import create_client, create_indexes
from .routers import auth, backups, data


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = create_client(settings.mongodb_uri)
    database = client[settings.mongodb_db]
    await database.command("ping")
    await create_indexes(database)
    app.state.mongodb_client = client
    app.state.database = database
    yield
    await client.close()


import os
from fastapi.staticfiles import StaticFiles

settings = get_settings()
app = FastAPI(title="MinusLearn API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploadImage", exist_ok=True)
app.mount("/uploadImage", StaticFiles(directory="uploadImage"), name="uploadImage")

app.include_router(auth.router)
app.include_router(data.router)
app.include_router(backups.router)

@app.get("/api/health")
async def health():
    return {"status": "ok"}

