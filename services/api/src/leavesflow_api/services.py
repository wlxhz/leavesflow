from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .default_tags import CATEGORY_NAMES
from .errors import AppError
from .models import Goal, SkillTag, Stage, TagOption, TaskCheckIn, TaskNode, UserTagProfile
from .schemas import (
    CheckInSkillOut,
    DecompositionResult,
    PlanResponse,
    SelectedTagOut,
    StageOut,
    TagOptionCategoryOut,
    TagOptionOut,
    TaskNodeOut,
    UserTagProfileIds,
    UserTagProfileOut,
)
from .utils import dumps_json, loads_json, new_id, utc_now


CATEGORY_TO_ID_FIELD = {
    "identity_tags": "identityTagIds",
    "background_tags": "backgroundTagIds",
    "level_tags": "levelTagIds",
    "goal_type_tags": "goalTypeTagIds",
    "time_range_tags": "timeRangeTagIds",
    "output_preference_tags": "outputPreferenceTagIds",
}

PROFILE_DB_FIELDS = {
    "identity_tags": "identity_tag_ids",
    "background_tags": "background_tag_ids",
    "level_tags": "level_tag_ids",
    "goal_type_tags": "goal_type_tag_ids",
    "time_range_tags": "time_range_tag_ids",
    "output_preference_tags": "output_preference_tag_ids",
}

PROFILE_OUT_FIELDS = {
    "identity_tags": "identityTags",
    "background_tags": "backgroundTags",
    "level_tags": "levelTags",
    "goal_type_tags": "goalTypeTags",
    "time_range_tags": "timeRangeTags",
    "output_preference_tags": "outputPreferenceTags",
}


def list_tag_options(db: Session) -> list[TagOptionCategoryOut]:
    rows = db.scalars(
        select(TagOption).where(TagOption.enabled == 1).order_by(TagOption.category, TagOption.sort_order)
    ).all()
    grouped: dict[str, list[TagOptionOut]] = {key: [] for key in CATEGORY_NAMES}
    for row in rows:
        grouped.setdefault(row.category, []).append(
            TagOptionOut(id=row.id, label=row.label, promptText=row.prompt_text, sortOrder=row.sort_order)
        )
    return [
        TagOptionCategoryOut(key=key, name=CATEGORY_NAMES[key], options=grouped.get(key, []))
        for key in CATEGORY_NAMES
    ]


def _tag_map(db: Session, ids: list[str] | None = None) -> dict[str, TagOption]:
    stmt = select(TagOption).where(TagOption.enabled == 1)
    if ids is not None:
        if not ids:
            return {}
        stmt = stmt.where(TagOption.id.in_(ids))
    return {tag.id: tag for tag in db.scalars(stmt).all()}


def _profile_ids_from_db(profile: UserTagProfile) -> UserTagProfileIds:
    return UserTagProfileIds(
        identityTagIds=loads_json(profile.identity_tag_ids),
        backgroundTagIds=loads_json(profile.background_tag_ids),
        levelTagIds=loads_json(profile.level_tag_ids),
        goalTypeTagIds=loads_json(profile.goal_type_tag_ids),
        timeRangeTagIds=loads_json(profile.time_range_tag_ids),
        outputPreferenceTagIds=loads_json(profile.output_preference_tag_ids),
    )


def _validate_profile_ids(db: Session, profile_ids: UserTagProfileIds) -> None:
    all_ids: list[str] = []
    for value in profile_ids.model_dump().values():
        all_ids.extend(value)
    tags = _tag_map(db, all_ids)
    fields: dict[str, list[str]] = {}
    for category, api_field in CATEGORY_TO_ID_FIELD.items():
        ids = getattr(profile_ids, api_field)
        for tag_id in ids:
            tag = tags.get(tag_id)
            if not tag:
                fields.setdefault(api_field, []).append("标签不存在或已停用")
            elif tag.category != category:
                fields.setdefault(api_field, []).append(f"标签分类不匹配：{tag.label}")
    if fields:
        raise AppError(400, "VALIDATION_ERROR", "标签选择不符合要求", {"fields": fields})


def profile_ids_to_out(db: Session, profile_ids: UserTagProfileIds) -> UserTagProfileOut:
    all_ids: list[str] = []
    for value in profile_ids.model_dump().values():
        all_ids.extend(value)
    tags = _tag_map(db, all_ids)
    data: dict[str, list[SelectedTagOut]] = {}
    for category, api_field in CATEGORY_TO_ID_FIELD.items():
        selected = []
        for tag_id in getattr(profile_ids, api_field):
            tag = tags.get(tag_id)
            if tag:
                selected.append(SelectedTagOut(id=tag.id, label=tag.label, promptText=tag.prompt_text))
        data[PROFILE_OUT_FIELDS[category]] = selected
    return UserTagProfileOut(**data)


def get_or_create_profile(db: Session, user_id: str) -> UserTagProfile:
    profile = db.get(UserTagProfile, user_id)
    if profile:
        return profile
    now = utc_now()
    profile = UserTagProfile(
        user_id=user_id,
        identity_tag_ids=dumps_json([]),
        background_tag_ids=dumps_json([]),
        level_tag_ids=dumps_json([]),
        goal_type_tag_ids=dumps_json([]),
        time_range_tag_ids=dumps_json([]),
        output_preference_tag_ids=dumps_json([]),
        updated_at=now,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def update_profile(db: Session, user_id: str, profile_ids: UserTagProfileIds) -> UserTagProfileOut:
    _validate_profile_ids(db, profile_ids)
    profile = get_or_create_profile(db, user_id)
    profile.identity_tag_ids = dumps_json(profile_ids.identityTagIds)
    profile.background_tag_ids = dumps_json(profile_ids.backgroundTagIds)
    profile.level_tag_ids = dumps_json(profile_ids.levelTagIds)
    profile.goal_type_tag_ids = dumps_json(profile_ids.goalTypeTagIds)
    profile.time_range_tag_ids = dumps_json(profile_ids.timeRangeTagIds)
    profile.output_preference_tag_ids = dumps_json(profile_ids.outputPreferenceTagIds)
    profile.updated_at = utc_now()
    seed_profile_skill_prompts(db, user_id, profile_ids)
    db.commit()
    return profile_ids_to_out(db, profile_ids)


def current_profile_out(db: Session, user_id: str) -> UserTagProfileOut:
    profile = get_or_create_profile(db, user_id)
    return profile_ids_to_out(db, _profile_ids_from_db(profile))


def current_profile_ids(db: Session, user_id: str) -> UserTagProfileIds:
    return _profile_ids_from_db(get_or_create_profile(db, user_id))


def tag_context_for_profile(db: Session, profile_ids: UserTagProfileIds) -> list[dict[str, str]]:
    all_ids: list[str] = []
    for value in profile_ids.model_dump().values():
        all_ids.extend(value)
    tags = _tag_map(db, all_ids)
    context = []
    for category, api_field in CATEGORY_TO_ID_FIELD.items():
        for tag_id in getattr(profile_ids, api_field):
            tag = tags.get(tag_id)
            if tag:
                context.append(
                    {
                        "category": category,
                        "categoryName": CATEGORY_NAMES.get(category, category),
                        "label": tag.label,
                        "promptText": tag.prompt_text,
                    }
                )
    return context


def plan_to_response(db: Session, goal: Goal) -> PlanResponse | None:
    stages = db.scalars(select(Stage).where(Stage.goal_id == goal.id).order_by(Stage.sort_order)).all()
    if not stages:
        return None
    stage_items: list[StageOut] = []
    for stage in stages:
        tasks = db.scalars(
            select(TaskNode).where(TaskNode.stage_id == stage.id).order_by(TaskNode.sort_order)
        ).all()
        stage_items.append(
            StageOut(
                id=stage.id,
                title=stage.title,
                description=stage.description,
                sortOrder=stage.sort_order,
                tasks=[
                    TaskNodeOut(
                        id=task.id,
                        title=task.title,
                        description=task.description,
                        contextForAI=task.context_for_ai,
                        vibeCodingPrompt=task.vibe_coding_prompt,
                        expectedOutput=task.expected_output,
                        pathSteps=loads_json(task.path_steps),
                        tools=loads_json(task.tools),
                        resources=loads_json(task.resources),
                        completionCriteria=loads_json(task.completion_criteria),
                        predictedSkillTags=loads_json(task.predicted_skill_tags),
                        status=task.status,
                        sortOrder=task.sort_order,
                    )
                    for task in tasks
                ],
            )
        )
    return PlanResponse(
        goalId=goal.id,
        goalTitle=goal.title,
        goalSummary=goal.goal_summary or "",
        stages=stage_items,
    )


def persist_plan(db: Session, goal: Goal, result: DecompositionResult) -> PlanResponse:
    if db.scalar(select(Stage.id).where(Stage.goal_id == goal.id).limit(1)):
        raise AppError(409, "CONFLICT", "该目标已经生成过任务路径，V1 暂不支持覆盖重算")
    goal.title = result.goalTitle
    goal.goal_summary = result.goalSummary
    goal.updated_at = utc_now()
    for stage_index, stage_data in enumerate(result.stages):
        stage = Stage(
            id=new_id(),
            goal_id=goal.id,
            title=stage_data.title,
            description=stage_data.description,
            sort_order=stage_index,
        )
        db.add(stage)
        for task_index, task_data in enumerate(stage_data.tasks):
            task_dump = task_data.model_dump(mode="json")
            db.add(
                TaskNode(
                    id=new_id(),
                    goal_id=goal.id,
                    stage_id=stage.id,
                    title=task_data.title,
                    description=task_data.description,
                    context_for_ai=task_data.contextForAI,
                    vibe_coding_prompt=task_data.vibeCodingPrompt,
                    expected_output=task_data.expectedOutput,
                    path_steps=dumps_json(task_dump["path"]),
                    tools=dumps_json(task_dump["tools"]),
                    resources=dumps_json(task_dump["resources"]),
                    completion_criteria=dumps_json(task_dump["completionCriteria"]),
                    predicted_skill_tags=dumps_json(task_dump["skillTags"]),
                    status="pending",
                    sort_order=task_index,
                )
            )
    db.commit()
    db.refresh(goal)
    plan = plan_to_response(db, goal)
    if not plan:
        raise AppError(502, "AI_INVALID_SCHEMA", "AI 任务路径为空")
    return plan


def merge_skill_tags(db: Session, user_id: str, goal_id: str, task_id: str, skills: list) -> list[CheckInSkillOut]:
    now = utc_now()
    output: list[CheckInSkillOut] = []
    for skill in skills:
        existing = db.scalar(
            select(SkillTag).where(
                SkillTag.user_id == user_id,
                SkillTag.name == skill.name,
                SkillTag.level == skill.level,
            )
        )
        if existing:
            existing.count += 1
            existing.source_task_id = task_id
            existing.source_goal_id = goal_id
            existing.skill_prompt = skill.prompt
            existing.evidence = (existing.evidence + "\n---\n" + skill.reason)[-4000:]
            existing.updated_at = now
            row = existing
        else:
            row = SkillTag(
                id=new_id(),
                user_id=user_id,
                name=skill.name,
                level=skill.level,
                skill_prompt=skill.prompt,
                source_task_id=task_id,
                source_goal_id=goal_id,
                evidence=skill.reason,
                count=1,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
        output.append(
            CheckInSkillOut(
                id=row.id,
                name=skill.name,
                level=skill.level,
                prompt=skill.prompt,
                source=skill.source,
                reason=skill.reason,
            )
        )
    return output


def seed_profile_skill_prompts(db: Session, user_id: str, profile_ids: UserTagProfileIds) -> None:
    now = utc_now()
    all_ids: list[str] = []
    for value in profile_ids.model_dump().values():
        all_ids.extend(value)
    tags = _tag_map(db, all_ids)
    for category, api_field in CATEGORY_TO_ID_FIELD.items():
        for tag_id in getattr(profile_ids, api_field):
            tag = tags.get(tag_id)
            if not tag:
                continue
            name = f"{tag.label}画像"
            existing = db.scalar(
                select(SkillTag).where(
                    SkillTag.user_id == user_id,
                    SkillTag.name == name,
                    SkillTag.level == "入门",
                )
            )
            prompt = f"当我以“{tag.label}”这个标签作为背景或偏好推进任务时，请你遵循以下上下文来帮助我：{tag.prompt_text}"
            evidence = f"用户在「{CATEGORY_NAMES.get(category, category)}」中选择了「{tag.label}」，该标签封装内容已加入个人画像。"
            if existing:
                existing.skill_prompt = prompt
                existing.evidence = evidence
                existing.updated_at = now
            else:
                db.add(
                    SkillTag(
                        id=new_id(),
                        user_id=user_id,
                        name=name[:32],
                        level="入门",
                        skill_prompt=prompt,
                        source_task_id="profile",
                        source_goal_id="profile",
                        evidence=evidence,
                        count=1,
                        created_at=now,
                        updated_at=now,
                    )
                )
