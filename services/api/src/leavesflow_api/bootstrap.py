from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import Base, engine
from .default_tags import DEFAULT_TAG_OPTIONS
from .models import TagOption, User, UserTagProfile
from .utils import dumps_json, new_id, utc_now


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_users_table()


def _migrate_users_table() -> None:
    required_columns = {
        "username": "VARCHAR",
        "display_name": "VARCHAR",
        "password_hash": "TEXT",
        "auth_token": "VARCHAR",
    }
    with engine.begin() as connection:
        existing = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(users)").fetchall()}
        for column, column_type in required_columns.items():
            if column not in existing:
                connection.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {column} {column_type}")


def seed_demo_data(db: Session) -> None:
    settings = get_settings()
    now = utc_now()

    user = db.get(User, settings.app.demo_user_id)
    if not user:
        db.add(
            User(
                id=settings.app.demo_user_id,
                username="demo",
                display_name="Demo 用户",
                password_hash=None,
                auth_token=settings.app.demo_bearer_token,
                created_at=now,
                updated_at=now,
            )
        )
    else:
        if not user.username:
            user.username = "demo"
        if not user.display_name:
            user.display_name = "Demo 用户"
        if not user.auth_token:
            user.auth_token = settings.app.demo_bearer_token
        user.updated_at = now

    profile = db.get(UserTagProfile, settings.app.demo_user_id)
    if not profile:
        db.add(
            UserTagProfile(
                user_id=settings.app.demo_user_id,
                identity_tag_ids=dumps_json([]),
                background_tag_ids=dumps_json([]),
                level_tag_ids=dumps_json([]),
                goal_type_tag_ids=dumps_json([]),
                time_range_tag_ids=dumps_json([]),
                output_preference_tag_ids=dumps_json([]),
                updated_at=now,
            )
        )

    existing = {
        (row.category, row.label)
        for row in db.execute(select(TagOption.category, TagOption.label)).all()
    }
    for category, items in DEFAULT_TAG_OPTIONS.items():
        for index, (label, prompt_text) in enumerate(items):
            if (category, label) in existing:
                continue
            db.add(
                TagOption(
                    id=new_id(),
                    category=category,
                    label=label,
                    prompt_text=prompt_text,
                    sort_order=index,
                    enabled=1,
                    created_at=now,
                    updated_at=now,
                )
            )
    db.commit()
