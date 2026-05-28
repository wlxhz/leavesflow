from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, HttpUrl


class AppConfig(BaseModel):
    name: str = "leavesflow-api"
    env: str = "dev"
    demo_bearer_token: str = "dev-demo-token"
    demo_user_id: str


class DatabaseConfig(BaseModel):
    url: str = "sqlite:///./data/leavesflow.db"


class OpenAICompatibleConfig(BaseModel):
    base_url: str = ""
    api_key: str = ""
    chat_model: str = "gpt-4o-mini"
    timeout_seconds: int = Field(default=120, ge=30, le=600)
    max_retries: int = Field(default=2, ge=0, le=5)


class AIConfig(BaseModel):
    decomposition_temperature: float = Field(default=0.3, ge=0, le=2)
    skill_extraction_temperature: float = Field(default=0.2, ge=0, le=2)
    json_mode: bool = True


class CORSConfig(BaseModel):
    allow_origins: list[str] = Field(default_factory=list)


class MCPConfig(BaseModel):
    enabled: bool = False
    servers: list[dict] = Field(default_factory=list)


class SkillsConfig(BaseModel):
    enabled: bool = False
    registry_path: str = "./skills/registry.yaml"


class AdminConfig(BaseModel):
    access_password: str = ""


class Settings(BaseModel):
    app: AppConfig
    database: DatabaseConfig
    openai_compatible: OpenAICompatibleConfig
    ai: AIConfig = Field(default_factory=AIConfig)
    cors: CORSConfig = Field(default_factory=CORSConfig)
    mcp: MCPConfig = Field(default_factory=MCPConfig)
    skills: SkillsConfig = Field(default_factory=SkillsConfig)
    admin: AdminConfig = Field(default_factory=AdminConfig)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _default_config_path() -> Path:
    return _repo_root() / "config" / "config.json"


def _example_config_path() -> Path:
    return _repo_root() / "config" / "config.example.json"


@lru_cache
def get_settings() -> Settings:
    raw_path = os.getenv("LEAVESFLOW_CONFIG_PATH")
    config_path = Path(raw_path) if raw_path else _default_config_path()
    if not config_path.exists():
        config_path = _example_config_path()
    data = json.loads(config_path.read_text(encoding="utf-8"))
    return Settings.model_validate(data)
