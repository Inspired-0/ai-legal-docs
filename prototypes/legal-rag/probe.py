"""Bounded public-source experiment; never use this with client documents or a shared DB."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from lxml import html

BASE = "http://actual.pravo.gov.ru:8000/api/ebpi"
PARSER_VERSION = "ebpi-articles-v2"
MODEL = "intfloat/multilingual-e5-small"
ACTS = {
    "GK-1": ("ba747b7c430fdfb9405741d818463a26af1577a680f7a9ab6318cc6f4faa1121", "453"),
    "GK-4": ("3edc1b4f0e70ca1c9191422c7c01743f4316210d72f59b4a45581dd70060fb13", "1551"),
}
SUPERSCRIPT = str.maketrans("0123456789-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻")
NORMAL_DIGITS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")
ARTICLE = re.compile(r"^Статья\s+(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]*)(?:\.(\d+(?:-\d+)*))?\.(?:\s+(.*))?$")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def save_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def get_json(path: str, params: dict, output: Path) -> tuple[dict, dict]:
    url = BASE + path + "?" + urlencode(params)
    request = Request(url, headers={"User-Agent": "AI-Legal-Docs-research/0.1"})
    with urlopen(request, timeout=30) as response:  # Public data, no credentials.
        raw = response.read(12_000_001)
        status = response.status
    if len(raw) > 12_000_000:
        raise ValueError("Source response exceeds experiment size limit")
    payload = json.loads(raw)
    if not isinstance(payload, dict) or payload.get("error"):
        raise ValueError("Source returned an error or an unexpected JSON shape")
    sha = digest(raw)
    snapshot = output / "snapshots" / f"{sha}.json"
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    if snapshot.exists():
        if snapshot.read_bytes() != raw:
            raise ValueError("Immutable snapshot mismatch")
    else:
        snapshot.write_bytes(raw)
    return payload, {
        "url": url,
        "status": status,
        "bytes": len(raw),
        "sha256": sha,
        "observed_at": datetime.now(UTC).isoformat(),
        "snapshot": str(snapshot),
    }


def paragraphs(source: str) -> list[str]:
    root = html.fromstring(source)
    classes = set()
    for css in root.xpath("//style/text()"):
        for selector, declaration in re.findall(r"([^{}]+)\{([^}]*)\}", css):
            if not re.search(r"vertical-align\s*:\s*super", declaration, re.I):
                continue
            for part in selector.split(","):
                part = part.strip()
                if part.lower() == "sup":
                    continue
                if not re.fullmatch(r"\.[\w-]+", part):
                    raise ValueError(f"Unsupported superscript selector: {part}")
                classes.add(part[1:])
    for element in root.iter():
        if not isinstance(element.tag, str):
            continue
        style = element.get("style", "")
        is_super = (
            element.tag == "sup"
            or bool(classes.intersection(element.get("class", "").split()))
            or bool(re.search(r"vertical-align\s*:\s*super", style, re.I))
        )
        if is_super:
            text = element.text_content().strip()
            if not re.fullmatch(r"[0-9]+(?:-[0-9]+)*", text):
                raise ValueError("Unsupported nonnumeric superscript")
            for child in list(element):
                element.remove(child)
            element.text = text.translate(SUPERSCRIPT)
    for br in root.xpath("//br"):
        br.tail = " " + (br.tail or "")
    return [" ".join(p.text_content().split()) for p in root.xpath("//body//p")]


def parse_articles(source: str, edition_id: str) -> list[dict]:
    units: list[dict] = []
    seen = set()
    current = None
    for text in paragraphs(source):
        match = ARTICLE.match(text)
        if match:
            base, superscript, dotted, _ = match.groups()
            suffix = superscript.translate(NORMAL_DIGITS) or dotted
            number = base + ("." + suffix if suffix else "")
            if number in seen:
                raise ValueError(f"Duplicate article: {number}")
            seen.add(number)
            current = {
                "id": digest(f"{edition_id}|{PARSER_VERSION}|{number}".encode()),
                "edition_id": edition_id,
                "number": number,
                "title": text,
                "text": text,
            }
            units.append(current)
        elif re.match(r"^Статья\s+\d", text):
            raise ValueError(f"Unrecognized article heading: {text[:100]}")
        elif re.match(r"^(Раздел|Подраздел|Глава|§)\s|^Президент Российской", text):
            current = None
        elif current is not None and text:
            current["text"] += "\n" + text
    if not units:
        raise ValueError("No article headings found")
    return units


def verify_quote(unit: dict, edition_id: str, start: int, end: int, quote: str) -> bool:
    return (
        unit["edition_id"] == edition_id
        and 0 <= start < end <= len(unit["text"])
        and unit["text"][start:end] == quote
    )


def check_terminal(source: str, units: list[dict], expected: str) -> dict:
    if units[-1]["number"] == expected:
        return {"kind": "article", "number": expected}
    # The source can replace a repealed final chapter with an explicit range notice.
    texts = [p for p in paragraphs(source) if p]
    for i, text in enumerate(texts[:-1]):
        match = re.fullmatch(r"Глава\s+\d+\.\s+\(Статьи\s+(\d+)\s*-\s*(\d+)\)", text)
        if (
            match
            and match[2] == expected
            and texts[i + 1].startswith("(Глава утратила силу")
            and units[-1]["number"] == str(int(match[1]) - 1)
        ):
            return {"kind": "source_repeal_notice", "heading": text, "notice": texts[i + 1]}
    raise ValueError(f"Missing expected final article or explicit repeal notice: {expected}")


def fetch(output: Path) -> None:
    editions, units, observations = [], [], []
    for act_key, (source_hash, last_article) in ACTS.items():
        metadata, observation = get_json(
            "/redactions/",
            {"bpa": "ebpi", "t": json.dumps({"hash": source_hash, "ttl": 4})},
            output,
        )
        observations.append(observation)
        available = metadata["redactions"]
        current = [r for r in available if r.get("actual") is True]
        if len(current) != 1:
            raise ValueError(f"{act_key}: expected exactly one source-current edition")
        selected = [(current[0], "source_current")]
        if act_key == "GK-1":
            historical = [
                r
                for r in available
                if r.get("reddate", "") < current[0]["reddate"] and r.get("contentcomplete") is True
            ]
            selected.append((max(historical, key=lambda r: r["reddate"]), "historical_sample"))
        for redaction, role in selected:
            if not all(redaction.get(k) is True for k in ("hascontent", "contentcomplete")):
                raise ValueError("Source marks the selected text incomplete or unavailable")
            payload, observation = get_json(
                "/redtext",
                {"bpa": "ebpi", "t": redaction["redid"], "ttl": 2},
                output,
            )
            observations.append(observation)
            edition_id = f"{act_key}:{redaction['redid']}:{observation['sha256']}"
            parsed = parse_articles(payload["redtext"], edition_id)
            terminal = check_terminal(payload["redtext"], parsed, last_article)
            for unit in parsed:
                unit["act_key"] = act_key
            units.extend(parsed)
            editions.append(
                {
                    "id": edition_id,
                    "act_key": act_key,
                    "role": role,
                    "source_metadata": redaction,
                    "source": observation,
                    "articles": len(parsed),
                    "terminal_check": terminal,
                    "legal_effective_date_verified": False,
                }
            )
            print(f"Fetched {act_key} {redaction['redid']}: {len(parsed)} articles", flush=True)
    future, observation = get_json(
        "/redactions/",
        {"bpa": "ebpi", "t": json.dumps({"pnum": "0001202607040012", "ttl": 2})},
        output,
    )
    observations.append(observation)
    save_json(output / "corpus.json", {"editions": editions, "units": units})
    save_json(
        output / "sources.json",
        {
            "parser": PARSER_VERSION,
            "observations": observations,
            "future_sample": future,
            "legal_applicability_verified": False,
            "limitations": ["HTTP source", "Two acts only", "Completeness is a structural check"],
        },
    )


def reparse(output: Path) -> None:
    corpus = json.loads((output / "corpus.json").read_text())
    units = []
    for edition in corpus["editions"]:
        raw = Path(edition["source"]["snapshot"]).read_bytes()
        if digest(raw) != edition["source"]["sha256"]:
            raise ValueError("Stored snapshot has changed")
        source = json.loads(raw)["redtext"]
        parsed = parse_articles(source, edition["id"])
        edition["terminal_check"] = check_terminal(source, parsed, ACTS[edition["act_key"]][1])
        edition["articles"] = len(parsed)
        for unit in parsed:
            unit["act_key"] = edition["act_key"]
        units.extend(parsed)
    corpus["units"] = units
    sources = json.loads((output / "sources.json").read_text())
    sources["parser"] = PARSER_VERSION
    save_json(output / "corpus.json", corpus)
    save_json(output / "sources.json", sources)
    print(f"Reparsed immutable snapshots: {len(units)} articles", flush=True)


def make_chunks(units: list[dict], tokenizer) -> list[dict]:
    chunks = []
    for unit in units:
        offsets = tokenizer(
            unit["text"],
            add_special_tokens=False,
            return_offsets_mapping=True,
            truncation=False,
            verbose=False,
        )["offset_mapping"]
        prefix_ids = tokenizer.encode(
            f"{unit['act_key']}. {unit['title']}",
            add_special_tokens=False,
        )[:64]
        prefix = "passage: " + tokenizer.decode(prefix_ids) + "\n"
        for token_start in range(0, len(offsets), 320):
            window = offsets[token_start : token_start + 384]
            start, end = window[0][0], window[-1][1]
            text = unit["text"][start:end]
            model_text = prefix + text
            if len(tokenizer.encode(model_text)) > 512:
                raise ValueError("Chunk would be silently truncated by the embedding model")
            chunks.append(
                {
                    "id": digest(f"{unit['id']}|{start}|{end}".encode()),
                    "unit_id": unit["id"],
                    "start": start,
                    "end": end,
                    "text": text,
                    "model_text": model_text,
                }
            )
            if token_start + 384 >= len(offsets):
                break
    return chunks


def fuse(rankings: list[list[str]], k: int = 60) -> list[str]:
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, unit_id in enumerate(dict.fromkeys(ranking), 1):
            scores[unit_id] = scores.get(unit_id, 0) + 1 / (k + rank)
    return sorted(scores, key=lambda unit_id: (-scores[unit_id], unit_id))


def vector_literal(vector) -> str:
    return "[" + ",".join(str(float(x)) for x in vector) + "]"


def evaluate(output: Path, queries_path: Path, revision: str | None, device: str | None) -> None:
    import numpy as np
    import psycopg
    from huggingface_hub import model_info
    from psycopg import sql
    from sentence_transformers import SentenceTransformer

    corpus = json.loads((output / "corpus.json").read_text())
    units = {u["id"]: u for u in corpus["units"]}
    current_ids = [e["id"] for e in corpus["editions"] if e["role"] == "source_current"]
    revision = revision or model_info(MODEL, token=False).sha
    print(f"Embedding model {MODEL}@{revision}", flush=True)
    model = SentenceTransformer(
        MODEL,
        revision=revision,
        cache_folder=str(output / "models"),
        device=device,
        token=False,
        trust_remote_code=False,
    )
    chunks = make_chunks(corpus["units"], model.tokenizer)
    inputs = [c["model_text"] for c in chunks]
    cache_key = digest(json.dumps([MODEL, revision, inputs], ensure_ascii=False).encode())
    cache_path = output / f"embeddings-{cache_key}.npy"
    start = time.perf_counter()
    if cache_path.exists():
        embeddings = np.load(cache_path, allow_pickle=False)
        cached = True
    else:
        batches = []
        for i in range(0, len(inputs), 128):
            batches.append(
                model.encode(
                    inputs[i : i + 128],
                    normalize_embeddings=True,
                    batch_size=16,
                    show_progress_bar=False,
                )
            )
            print(f"Embedded {min(i + 128, len(inputs))}/{len(inputs)}", flush=True)
        embeddings = np.concatenate(batches)
        np.save(cache_path, embeddings, allow_pickle=False)
        cached = False
    embedding_seconds = time.perf_counter() - start
    if embeddings.shape != (len(chunks), 384) or not np.isfinite(embeddings).all():
        raise ValueError("Invalid embedding cache shape or values")
    # This is deliberately fixed to the throwaway, loopback-only experiment DB.
    with psycopg.connect("postgresql://rag_spike@127.0.0.1:55439/rag_spike") as connection:
        connection.execute("CREATE EXTENSION IF NOT EXISTS vector")
        schema = "probe_" + uuid.uuid4().hex
        connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        connection.execute(sql.SQL("SET search_path TO {}, public").format(sql.Identifier(schema)))
        connection.execute("""
            CREATE TABLE units (
                id text PRIMARY KEY, edition_id text NOT NULL, act_key text NOT NULL,
                article_no text NOT NULL, title text NOT NULL, content text NOT NULL
            );
            CREATE TABLE chunks (
                id text PRIMARY KEY, unit_id text REFERENCES units(id),
                start_offset integer, end_offset integer, content text NOT NULL,
                embedding vector(384) NOT NULL, search tsvector NOT NULL
            );
            CREATE INDEX ON units(edition_id);
            CREATE INDEX ON chunks USING gin(search);
        """)
        with connection.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO units VALUES (%s,%s,%s,%s,%s,%s)",
                [
                    (u["id"], u["edition_id"], u["act_key"], u["number"], u["title"], u["text"])
                    for u in units.values()
                ],
            )
            cursor.executemany(
                "INSERT INTO chunks VALUES (%s,%s,%s,%s,%s,%s::vector,to_tsvector('russian',%s))",
                [
                    (
                        c["id"],
                        c["unit_id"],
                        c["start"],
                        c["end"],
                        c["text"],
                        vector_literal(v),
                        units[c["unit_id"]]["title"] + "\n" + c["text"],
                    )
                    for c, v in zip(chunks, embeddings, strict=True)
                ],
            )
        connection.commit()
        connection.execute("ANALYZE units; ANALYZE chunks")
        queries = json.loads(queries_path.read_text())
        query_vectors = model.encode(
            ["query: " + q["query"] for q in queries],
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        results = []
        for query, vector in zip(queries, query_vectors, strict=True):
            started = time.perf_counter()
            # OR of normalized Russian lexemes: natural questions are not an all-words AND.
            lexical = [
                r[0]
                for r in connection.execute(
                    """
                WITH q AS (
                    SELECT to_tsquery('russian', string_agg(quote_literal(lexeme), ' | ')) AS query
                    FROM unnest(tsvector_to_array(to_tsvector('russian', %s))) AS lexeme
                )
                SELECT c.unit_id, max(ts_rank_cd(c.search, q.query, 2)) AS score
                FROM chunks c JOIN units u ON u.id=c.unit_id CROSS JOIN q
                WHERE u.edition_id=ANY(%s) AND c.search @@ q.query
                GROUP BY c.unit_id ORDER BY score DESC, c.unit_id LIMIT 50
            """,
                    (query["query"], current_ids),
                ).fetchall()
            ]
            lexical_ms = (time.perf_counter() - started) * 1000
            started = time.perf_counter()
            dense = [
                r[0]
                for r in connection.execute(
                    """
                SELECT c.unit_id, min(c.embedding <=> %s::vector) AS distance
                FROM chunks c JOIN units u ON u.id=c.unit_id
                WHERE u.edition_id=ANY(%s)
                GROUP BY c.unit_id ORDER BY distance, c.unit_id LIMIT 50
            """,
                    (vector_literal(vector), current_ids),
                ).fetchall()
            ]
            dense_ms = (time.perf_counter() - started) * 1000
            result = {"query": query["query"], "expected": query["expected"], "rankings": {}}
            for name, ranking in {
                "text": lexical,
                "semantic": dense,
                "hybrid_rrf": fuse([lexical, dense]),
            }.items():
                labels = [f"{units[u]['act_key']}:{units[u]['number']}" for u in ranking]
                if any(units[u]["edition_id"] not in current_ids for u in ranking):
                    raise AssertionError("Edition filter leaked a historical version")
                ranks = [labels.index(x) + 1 for x in query["expected"] if x in labels]
                result["rankings"][name] = {
                    "top5": labels[:5],
                    "first_expected_rank": min(ranks) if ranks else None,
                }
            result["database_ms"] = {"text": lexical_ms, "semantic": dense_ms}
            results.append(result)
        summary = {}
        for name in ("text", "semantic", "hybrid_rrf"):
            ranks = [r["rankings"][name]["first_expected_rank"] for r in results]
            summary[name] = {
                "hit_at_5": sum(r is not None and r <= 5 for r in ranks) / len(ranks),
                "mrr_at_50": sum(1 / r if r else 0 for r in ranks) / len(ranks),
            }
        exact = connection.execute(
            """
            SELECT id, edition_id FROM units
            WHERE act_key='GK-1' AND article_no='330' AND edition_id=ANY(%s)
        """,
            (current_ids,),
        ).fetchall()
        historical_ids = [e["id"] for e in corpus["editions"] if e["role"] == "historical_sample"]
        historical = connection.execute(
            """
            SELECT id, edition_id FROM units
            WHERE act_key='GK-1' AND article_no='330' AND edition_id=ANY(%s)
        """,
            (historical_ids,),
        ).fetchall()
        quote_checks = []
        for chunk in chunks:
            unit = units[chunk["unit_id"]]
            quote_checks.append(
                verify_quote(
                    unit,
                    unit["edition_id"],
                    chunk["start"],
                    chunk["end"],
                    chunk["text"],
                )
            )
        sample = units[exact[0][0]]
        checks = {
            "all_chunk_offsets_match_extracted_text": all(quote_checks),
            "changed_quote_rejected": not verify_quote(sample, sample["edition_id"], 0, 1, "X"),
            "wrong_edition_rejected": not verify_quote(
                sample, "invented", 0, 1, sample["text"][:1]
            ),
            "exact_current_lookup": len(exact) == 1,
            "historical_lookup_is_distinct": len(historical) == 1
            and historical[0][0] != exact[0][0],
        }
        if not all(checks.values()):
            raise AssertionError(checks)
        report = {
            "observed_at": datetime.now(UTC).isoformat(),
            "schema": schema,
            "postgres": connection.execute("SHOW server_version").fetchone()[0],
            "pgvector": connection.execute(
                "SELECT extversion FROM pg_extension WHERE extname='vector'",
            ).fetchone()[0],
            "model": MODEL,
            "model_revision": revision,
            "device": str(model.device),
            "editions": len(corpus["editions"]),
            "articles": len(units),
            "chunks": len(chunks),
            "embedding_seconds": embedding_seconds,
            "embeddings_cached": cached,
            "vector_search": "exact cosine scan; no approximate index",
            "checks": checks,
            "query_count": len(results),
            "summary": summary,
            "results": results,
            "limitations": [
                "Exploratory hand-written queries, not an independent legal evaluation",
                "Source-current flag is not verified legal applicability",
                "Two acts; no coverage or production-load guarantee",
                "Quotes verified against extracted text, not independently against the original",
                "No reranker or answering LLM in this experiment",
            ],
        }
        save_json(output / "results.json", report)
        print(
            json.dumps(
                {
                    "articles": len(units),
                    "chunks": len(chunks),
                    "summary": summary,
                    "checks": checks,
                },
                ensure_ascii=False,
                indent=2,
            ),
            flush=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("fetch", "reparse", "evaluate"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--queries", type=Path, default=Path(__file__).with_name("queries.json"))
    parser.add_argument("--model-revision")
    parser.add_argument("--device", choices=("cpu", "mps", "cuda"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.stage == "fetch":
        fetch(args.output)
    elif args.stage == "reparse":
        reparse(args.output)
    else:
        evaluate(args.output, args.queries, args.model_revision, args.device)


if __name__ == "__main__":
    main()
