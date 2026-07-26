from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AuthRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    remember_me: bool = True


class UserResponse(BaseModel):
    id: str
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class BackupEnvelope(BaseModel):
    format: str
    version: int
    exportedAt: str | None = None
    data: dict[str, Any]
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")


MascotEmotion = Literal[
    "neutral", "happy", "excited", "thinking", "confused", "concerned", "proud"
]
MascotLanguage = Literal["vi", "en"]
MascotTrigger = Literal["user", "timed", "event"]
MascotSkill = Literal[
    "general",
    "mistake_explanation",
    "sentence_correction",
    "vocabulary",
    "grammar",
    "roleplay",
    "skill_coaching",
    "study_plan",
    "review_coach",
]


class MascotChatRequest(BaseModel):
    message: str = Field(default="", max_length=1500)
    trigger: MascotTrigger = "user"
    context: dict[str, Any] = Field(default_factory=dict)


class MascotChatResponse(BaseModel):
    text: str
    language: MascotLanguage = "vi"
    emotion: MascotEmotion = "neutral"
    skill: MascotSkill = "general"
    quickReplies: list[str] = Field(default_factory=list)
    action: dict[str, Any] | None = None
    source: Literal["qwen", "fallback"] = "qwen"


class MascotLiveTokenResponse(BaseModel):
    token: str
    model: str
    websocketUrl: str
    expiresAt: str


class MascotLiveHistoryRequest(BaseModel):
    userText: str = Field(min_length=1, max_length=1500)
    assistantText: str = Field(min_length=1, max_length=1500)
