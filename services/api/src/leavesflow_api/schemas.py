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


class MeResponse(BaseModel):
    userId: str
    tagProfile: UserTagProfileOut
    skillTags: list[SkillTagOut]


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
        return text if text.startswith(("http://", "https://")) else "https://example.com"


class ResourceRecommendation(BaseModel):
    title: str
    url: str
    description: str | None = None

    @field_validator("url", mode="before")
    @classmethod
    def normalize_url(cls, value: object) -> str:
        text = str(value or "").strip()
        return text if text.startswith(("http://", "https://")) else "https://example.com"


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
