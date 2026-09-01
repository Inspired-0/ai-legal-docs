from __future__ import annotations

from pathlib import Path


class LocalOutputStore:
    """Create output paths inside one explicit directory."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

    def path_for(self, filename: str) -> Path:
        if Path(filename).name != filename or not filename.lower().endswith(".docx"):
            raise ValueError("filename must be one .docx basename")
        self.root.mkdir(parents=True, exist_ok=True)
        return self.root / filename
