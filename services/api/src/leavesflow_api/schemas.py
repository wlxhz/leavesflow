from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

SkillLevel = Literal["入门", "进阶", "熟练"]
GoalStatus = Literal["active", "completed"]
TaskStatus = Literal["pending", "completed"]


class ErrorBody(BaseModel):
    code: str
    message: str
    requestId: str
    details: dict | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class TagOptionOut(BaseModel):
    id: str
    label: str
    promptText: str
    sortOrder: int


class TagOptionCategoryOut(BaseModel):
    key: str
    name: str
    options: list[TagOptionOut]


class TagOptionsResponse(BaseModel):
    categories: list[TagOptionCategoryOut]


class UserTagProfileIds(BaseModel):
    identityTagIds: list[str] = Field(default_factory=list)
    backgroundTagIds: list[str] = Field(default_factory=list)
    levelTagIds: list[str] = Field(default_factory=list)
    goalTypeTagIds: list[str] = Field(default_factory=list)
    timeRangeTagIds: list[str] = Field(default_factory=list)
    outputPreferenceTagIds: list[str] = Field(default_factory=list)


class SelectedTagOut(BaseModel):
    id: str
    label: str
    promptText: str


class UserTagProfileOut(BaseModel):
    identityTags: list[SelectedTagOut] = Field(default_factory=list)
    backgroundTags: list[SelectedTagOut] = Field(default_factory=list)
    levelTags: list[SelectedTagOut] = Field(default_factory=list)
    goalTypeTags: list[SelectedTagOut] = Field(default_factory=list)
    timeRangeTags: list[SelectedTagOut] = Field(default_factory=list)
    outputPreferenceTags: list[SelectedTagOut] = Field(default_factory=list)


class UserOut(BaseModel):
    id: str
    username: str
    displayName: str
    createdAt: str


class SkillTagOut(BaseModel):
    id: str
    name: str
    level: SkillLevel
    count: int
    prompt: str
    sourceTaskId: str
    sourceGoalId: str
    evidence: str
    updatedAt: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut
    tagProfile: UserTagProfileOut


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=128)
    displayName: str | None = Field(default=None, max_length=32)
    profile: UserTagProfileIds

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        username = value.strip().lower()
        if not username:
            raise ValueError("用户名不能为空")
        allowed = set("abcdefghijklmnopqrstuvwxyz0123456789_-")
        if any(char not in allowed for char in username):
            raise ValueError("用户名只能包含英文、数字、下划线或短横线")
        return username

    @field_validator("displayName")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        text = (value or "").strip()
        return text or None


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


class UpdateMeRequest(BaseModel):
    displayName: str = Field(min_length=1, max_length=32)


class UpdateTagProfileResponse(BaseModel):
    tagProfile: UserTagProfileOut


class CreateGoalRequest(BaseModel):
    rawInput: str = Field(min_length=1, max_length=1000)
    profileSnapshot: UserTagProfileIds | None = None


class CreateGoalResponse(BaseModel):
    id: str
    title: str
    rawInput: str
    status: GoalStatus
    profileSnapshot: UserTagProfileOut
    createdAt: str


class ToolRecommendation(BaseModel):
    name: str
    usage: str
    url: str

    @field_validator("url", mode="before")
    @classmethod
    def normalize_url(cls, value: object) -> str:
        text = str(value or "").strip()
        if not text.startswith(("http://", "https://")):
            raise ValueError("URL 必须是 http 或 https")
        if "example.com" in text:
            raise ValueError("URL 不能使用占位链接")
        return text


class ResourceRecommendation(BaseModel):
    title: str
    url: str
    description: str | None = None

    @field_validator("url", mode="before")
    @classmethod
    def normalize_url(cls, value: object) -> str:
        text = str(value or "").strip()
        if not text.startswith(("http://", "https://")):
            raise ValueError("URL 必须是 http 或 https")
        if "example.com" in text:
            raise ValueError("URL 不能使用占位链接")
        return text


class DecompositionTask(BaseModel):
    title: str
    description: str
    contextForAI: str
    vibeCodingPrompt: str
    expectedOutput: str
    path: list[str] = Field(min_length=1)
    tools: list[ToolRecommendation] = Field(default_factory=list)
    resources: list[ResourceRecommendation] = Field(default_factory=list)
    completionCriteria: list[str] = Field(min_length=1)
    skillTags: list[str] = Field(default_factory=list)


class DecompositionStage(BaseModel):
    title: str
    description: str
    tasks: list[DecompositionTask] = Field(min_length=1)


class DecompositionResult(BaseModel):
    goalTitle: str
    goalSummary: str
    stages: list[DecompositionStage] = Field(min_length=1)


class TaskNodeOut(BaseModel):
    id: str
    title: str
    description: str
    contextForAI: str
    vibeCodingPrompt: str
    expectedOutput: str
    pathSteps: list[str]
    tools: list[ToolRecommendation]
    resources: list[ResourceRecommendation]
    completionCriteria: list[str]
    predictedSkillTags: list[str]
    status: TaskStatus
    sortOrder: int


class StageOut(BaseModel):
    id: str
    title: str
    description: str
    sortOrder: int
    tasks: list[TaskNodeOut]


class PlanResponse(BaseModel):
    goalId: str
    goalTitle: str
    goalSummary: str
    stages: list[StageOut]


class ActivePlanResponse(BaseModel):
    goalId: str
    goalTitle: str
    goalSummary: str
    status: GoalStatus
    completedTasks: int
    totalTasks: int
    isComplete: bool
    stages: list[StageOut]


class MeResponse(BaseModel):
    userId: str
    user: UserOut
    tagProfile: UserTagProfileOut
    skillTags: list[SkillTagOut]
    activePlan: ActivePlanResponse | None = None


class GoalDetailResponse(BaseModel):
    id: str
    title: str
    rawInput: str
    status: GoalStatus
    goalSummary: str | None
    profileSnapshot: UserTagProfileOut
    createdAt: str
    plan: PlanResponse | None


class GeneratePlanRequest(BaseModel):
    pass


class CheckInRequest(BaseModel):
    whatDone: str | None = Field(default=None, max_length=2000)
    whatProduced: str | None = Field(default=None, max_length=2000)
    problems: str | None = Field(default=None, max_length=2000)


class ExtractedSkillPrompt(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    level: SkillLevel
    prompt: str = Field(min_length=1)
    source: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class SkillExtractionResult(BaseModel):
    newSkillTags: list[ExtractedSkillPrompt] = Field(default_factory=list)


class CheckInSkillOut(BaseModel):
    id: str
    name: str
    level: SkillLevel
    prompt: str
    source: str
    reason: str


class CheckInResponse(BaseModel):
    checkInId: str
    taskNodeId: str
    newSkillTags: list[CheckInSkillOut]
