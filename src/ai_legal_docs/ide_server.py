"""Loopback-only prototype server. Run from repository via scripts/run_ide.py."""

from __future__ import annotations

import json
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .ide_agent import MAX_BYTES, AgentError, Settings, complete, prepare


def make_server(root: Path, settings: Settings, port: int = 8765):
    csrf = secrets.token_urlsafe(32)
    tickets = {}
    lock = threading.Lock()
    inflight = threading.Semaphore(1)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass  # No document, query, response or API key logs.

        def setup(self):
            super().setup()
            self.connection.settimeout(110)

        def valid_host(self):
            return self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"

        def reply(self, code, data, mime="application/json; charset=utf-8"):
            body = json.dumps(data, ensure_ascii=False).encode() if isinstance(data, dict) else data
            self.send_response(code)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            if not self.valid_host():
                return self.reply(403, {"error": "Недопустимый Host."})
            if self.path == "/api/config":
                return self.reply(
                    200,
                    {
                        "csrf": csrf,
                        "endpoint": settings.endpoint,
                        "model": settings.model,
                        "has_key": bool(settings.api_key),
                    },
                )
            files = {
                "/": ("index.html", "text/html"),
                "/app.js": ("app.js", "text/javascript"),
                "/live.js": ("live.js", "text/javascript"),
                "/styles.css": ("styles.css", "text/css"),
            }
            if self.path not in files:
                return self.reply(404, {"error": "Не найдено."})
            filename, mime = files[self.path]
            content = (root / filename).read_bytes()
            if filename == "index.html":
                content = content.replace(b"connect-src 'none'", b"connect-src 'self'")
            self.reply(200, content, mime + "; charset=utf-8")

        def do_POST(self):
            origin = f"http://127.0.0.1:{self.server.server_port}"
            if (
                not self.valid_host()
                or self.headers.get("Origin") != origin
                or not secrets.compare_digest(self.headers.get("X-IDE-Token", ""), csrf)
            ):
                return self.reply(403, {"error": "Недопустимый источник запроса."})
            if self.path not in ("/api/preview", "/api/run"):
                return self.reply(404, {"error": "Не найдено."})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BYTES:
                    return self.reply(413, {"error": "Запрос слишком большой или пустой."})
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise AgentError("Ожидается JSON объект.")
                if self.path == "/api/preview":
                    prepared = prepare(data, settings)
                    ticket = secrets.token_urlsafe(32)
                    with lock:
                        for key, (created, _) in list(tickets.items()):
                            if time.monotonic() - created > 600:
                                del tickets[key]
                        if len(tickets) >= 20:
                            del tickets[next(iter(tickets))]
                        tickets[ticket] = (time.monotonic(), prepared)
                    return self.reply(200, {"ticket": ticket, "payload": prepared.payload})
                if not inflight.acquire(blocking=False):
                    return self.reply(409, {"error": "Дождитесь текущего ответа модели."})
                try:
                    ticket = data.get("ticket")
                    if not isinstance(ticket, str):
                        raise AgentError("Неверный идентификатор предпросмотра.")
                    with lock:
                        entry = tickets.pop(ticket, None)
                    if not entry or time.monotonic() - entry[0] > 600:
                        raise AgentError(
                            "Предпросмотр устарел или уже отправлен. Подготовьте новый."
                        )
                    result = complete(entry[1].payload, settings)
                    answer = entry[1].result(result["content"])
                    answer["model"] = result["model"]
                    return self.reply(200, answer)
                finally:
                    inflight.release()
            except AgentError as exc:
                self.reply(400, {"error": str(exc)})
            except (ValueError, TypeError, TimeoutError):
                self.reply(400, {"error": "Не удалось прочитать запрос."})

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)
