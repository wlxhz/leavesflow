from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("username", name="uq_users_username"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_token: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class TagOption(Base):
    __tablename__ = "tag_options"
    __table_args__ = (UniqueConstraint("category", "label", name="uq_tag_options_category_label"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    category: Mapped[str] = mapped_column(String, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enabled: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class UserTagProfile(Base):
    __tablename__ = "user_tag_profile"

    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), primary_key=True)
    identity_tag_ids: Mapped[str] = mapped_column(Text, nullable=False)
    background_tag_ids: Mapped[str] = mapped_column(Text, nullable=False)
    level_tag_ids: Mapped[str] = mapped_column(Text, nullable=False)
    goal_type_tag_ids: Mapped[str] = mapped_column(Text, nullable=False)
    time_range_tag_ids: Mapped[str] = mapped_column(Text, nullable=False)
    output_preference_tag_ids: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    raw_input: Mapped[str] = mapped_column(Text, nullable=False)
    profile_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    goal_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    goal_id: Mapped[str] = mapped_column(String, ForeignKey("goals.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class TaskNode(Base):
    __tablename__ = "task_nodes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    goal_id: Mapped[str] = mapped_column(String, ForeignKey("goals.id"), nullable=False, index=True)
    stage_id: Mapped[str] = mapped_column(String, ForeignKey("stages.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    context_for_ai: Mapped[str] = mapped_column(Text, nullable=False)
    vibe_coding_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output: Mapped[str] = mapped_column(Text, nullable=False)
    path_steps: Mapped[str] = mapped_column(Text, nullable=False)
    tools: Mapped[str] = mapped_column(Text, nullable=False)
    resources: Mapped[str] = mapped_column(Text, nullable=False)
    completion_criteria: Mapped[str] = mapped_column(Text, nullable=False)
    predicted_skill_tags: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class TaskCheckIn(Base):
    __tablename__ = "task_check_ins"
    __table_args__ = (UniqueConstraint("task_node_id", name="uq_task_check_ins_task_node_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    task_node_id: Mapped[str] = mapped_column(String, ForeignKey("task_nodes.id"), nullable=False, index=True)
    goal_id: Mapped[str] = mapped_column(String, ForeignKey("goals.id"), nullable=False, index=True)
    what_done: Mapped[str | None] = mapped_column(Text, nullable=True)
    what_produced: Mapped[str | None] = mapped_column(Text, nullable=True)
    problems: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)


class SkillTag(Base):
    __tablename__ = "skill_tags"
    __table_args__ = (UniqueConstraint("user_id", "name", "level", name="uq_skill_tags_user_name_level"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    level: Mapped[str] = mapped_column(String, nullable=False)
    skill_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    source_task_id: Mapped[str] = mapped_column(String, ForeignKey("task_nodes.id"), nullable=False)
    source_goal_id: Mapped[str] = mapped_column(String, ForeignKey("goals.id"), nullable=False)
    evidence: Mapped[str] = mapped_column(Text, nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
