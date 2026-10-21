"""Start the local synthetic IDE, without extra dependencies."""

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_legal_docs.ide_agent import DEFAULT_ENDPOINT, DEFAULT_MODEL, Settings  # noqa: E402
from ai_legal_docs.ide_server import make_server  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    settings = Settings(
        endpoint=os.environ.get("LEGAL_IDE_ENDPOINT", DEFAULT_ENDPOINT),
        model=os.environ.get("LEGAL_IDE_MODEL", DEFAULT_MODEL),
        api_key=os.environ.get("LEGAL_IDE_API_KEY", ""),
    )
    url = urlsplit(settings.endpoint)
    if (
        url.scheme not in ("http", "https")
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
    ):
        parser.error("Endpoint должен быть HTTP(S) URL без учетных данных/query/fragment.")
    server = make_server(ROOT / "prototypes" / "legal-ide", settings, args.port)
    print(f"Legal IDE: http://127.0.0.1:{server.server_port}", flush=True)
    print(f"Model: {settings.model}. Synthetic documents only. Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
