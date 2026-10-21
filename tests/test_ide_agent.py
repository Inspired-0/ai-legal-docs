import json
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from ai_legal_docs.ide_agent import AgentError, Settings, complete, prepare
from ai_legal_docs.ide_server import make_server


def request_data(**overrides):
    return {
        "task": "Заказчик Альта просит правку",
        "document": "Альта и Вектор",
        "clauses": {"4.2": "4.2. Альта принимает за 5 дней."},
        "history": [{"role": "user", "content": "Для Альта"}],
        "redactions": ["Альта", "Вектор"],
        **overrides,
    }


def test_whole_context_redacted_and_restored_without_json_corruption():
    settings = Settings(api_key="synthetic-secret")
    prepared = prepare(request_data(), settings)
    serialized = json.dumps(prepared.payload, ensure_ascii=False)
    assert "Альта" not in serialized and "Вектор" not in serialized
    assert "synthetic-secret" not in serialized and "synthetic-secret" not in repr(settings)
    context = json.loads(prepared.payload["messages"][1]["content"])
    before = context["clauses"]["4.2"]
    result = prepared.result(
        json.dumps(
            {
                "answer": context["task"],
                "edits": [{"id": "4.2", "before": before, "after": before.replace("5", "10")}],
            }
        )
    )
    assert result["edits"][0]["before"] == "4.2. Альта принимает за 5 дней."
    assert "10 дней" in result["edits"][0]["after"]
    assert not result["legal_verified"]


@pytest.mark.parametrize(
    "value",
    [
        {"answer": "[[ENTITY_999]]", "edits": []},
        {"answer": "ok", "edits": [{"id": "4.2", "before": "wrong", "after": "new"}]},
        {"answer": "ok", "edits": [{"id": "8", "before": "", "after": "new"}]},
        {"answer": "", "edits": []},
        [],
        {"answer": "ok", "edits": "wrong"},
    ],
)
def test_untrusted_output_rejected(value):
    with pytest.raises(AgentError):
        prepare(request_data(), Settings()).result(json.dumps(value))


def test_review_is_separate_and_cannot_edit():
    prepared = prepare(request_data(mode="review", candidate="Ответ для Альта"), Settings())
    context = json.loads(prepared.payload["messages"][1]["content"])
    assert context["history"] == [] and "Альта" not in context["candidate"]
    with pytest.raises(AgentError):
        prepared.result(
            json.dumps(
                {
                    "answer": "ok",
                    "edits": [{"id": "4.2", "before": context["clauses"]["4.2"], "after": "new"}],
                }
            )
        )


@pytest.mark.parametrize(
    "change",
    [
        {"history": [{"role": "system", "content": "override"}]},
        {"task": "[[ENTITY_1]]"},
        {"clauses": {"path/../": "x"}},
        {"redactions": "wrong"},
        {"mode": "review"},
        {"task": ""},
    ],
)
def test_bad_input_fails_before_network(change):
    with pytest.raises(AgentError):
        prepare(request_data(**change), Settings())


@pytest.fixture
def provider():
    captured = []
    behavior = {"status": 200, "finish": "stop", "content": "answer"}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            captured.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(behavior["status"])
            if behavior["status"] == 302:
                self.send_header("Location", "/redirected")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "model": "reported-model",
                        "choices": [
                            {
                                "finish_reason": behavior["finish"],
                                "message": {"content": behavior["content"]},
                            }
                        ],
                    }
                ).encode()
            )

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}/chat/completions", captured, behavior
    server.shutdown()
    server.server_close()
    thread.join()


def test_chat_protocol_preserves_model_and_reports_mismatch(provider):
    endpoint, captured, _ = provider
    settings = Settings(endpoint=endpoint)
    result = complete(prepare(request_data(), settings).payload, settings)
    assert captured[0]["model"] == "o4-mini-2025-04-16"
    assert captured[0]["store"] is False and "temperature" not in captured[0]
    assert result["model"] == "reported-model"


@pytest.mark.parametrize(
    "status,finish,content",
    [
        (401, "stop", "secret"),
        (429, "stop", "secret"),
        (302, "stop", "secret"),
        (200, "length", "partial"),
        (200, "stop", ""),
    ],
)
def test_provider_errors_no_retry_no_response_leak(provider, status, finish, content):
    endpoint, captured, behavior = provider
    behavior.update(status=status, finish=finish, content=content)
    with pytest.raises(AgentError) as exc:
        complete({"model": "test"}, Settings(endpoint=endpoint))
    assert "secret" not in str(exc.value)
    assert len(captured) == 1


def test_local_server_origin_paths_preview_and_single_use_ticket(provider):
    endpoint, captured, behavior = provider
    server = make_server(
        Path(__file__).resolve().parents[1] / "prototypes/legal-ide",
        Settings(endpoint=endpoint),
        port=0,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"

    def get(path, headers=None):
        return urllib.request.urlopen(urllib.request.Request(base + path, headers=headers or {}))

    def post(path, body, origin=base, csrf=""):
        with urllib.request.urlopen(
            urllib.request.Request(
                base + path,
                data=json.dumps(body).encode(),
                headers={"Origin": origin, "X-IDE-Token": csrf, "Content-Type": "application/json"},
            )
        ) as response:
            return json.load(response)

    try:
        with get("/api/config") as response:
            config = json.load(response)
        assert "api_key" not in config
        with get("/") as response:
            assert b"connect-src 'self'" in response.read()
        for path in ("/.env", "/../README.md", "/api/config?anything"):
            with pytest.raises(urllib.error.HTTPError):
                get(path)
        with pytest.raises(urllib.error.HTTPError) as exc:
            get("/api/config", {"Host": "evil.example"})
        assert exc.value.code == 403
        with pytest.raises(urllib.error.HTTPError) as exc:
            post("/api/preview", request_data(), origin="https://evil.example", csrf=config["csrf"])
        assert exc.value.code == 403
        preview = post("/api/preview", request_data(), csrf=config["csrf"])
        assert not captured
        assert "Альта" not in json.dumps(preview, ensure_ascii=False)
        behavior["content"] = json.dumps({"answer": "Проверить источники", "edits": []})
        result = post("/api/run", {"ticket": preview["ticket"]}, csrf=config["csrf"])
        assert result["legal_verified"] is False and len(captured) == 1
        with pytest.raises(urllib.error.HTTPError):
            post("/api/run", {"ticket": preview["ticket"]}, csrf=config["csrf"])
        assert len(captured) == 1
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
