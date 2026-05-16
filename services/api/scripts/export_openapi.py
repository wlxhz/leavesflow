from __future__ import annotations

import json
from pathlib import Path

from leavesflow_api.main import app


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    output = repo_root / "docs" / "openapi.yaml"
    output.parent.mkdir(parents=True, exist_ok=True)
    # JSON is valid YAML 1.2; keeping this dependency-free avoids adding PyYAML just for export.
    output.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OpenAPI exported to {output}")


if __name__ == "__main__":
    main()
