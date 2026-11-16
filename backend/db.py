"""SQLite storage. Each table holds JSON documents; the data set is small (hundreds to a few
thousand records), so filtering and aggregation happen in Python (see analytics.py).

On first start the database is seeded from data/seed_records.json (the cleaned, anonymized
SharePoint export) plus the demo values in data/jnj_demo_data.json.
Reset:  python db.py --reset
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

from reference import enrich, now_iso, ref
from settings import settings

_lock = threading.Lock()

TABLES = {
    "records": "id INTEGER PRIMARY KEY, doc TEXT NOT NULL",
    "users": "id TEXT PRIMARY KEY, doc TEXT NOT NULL",
    "views": "id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, doc TEXT NOT NULL",
    "reports": "id TEXT PRIMARY KEY, doc TEXT NOT NULL",
    "requests": "id TEXT PRIMARY KEY, doc TEXT NOT NULL",
    "dismissed": "user_id TEXT NOT NULL, notif_id TEXT NOT NULL, PRIMARY KEY (user_id, notif_id)",
}


@contextmanager
def conn() -> Iterator[sqlite3.Connection]:
    with _lock:
        c = sqlite3.connect(settings.db_path)
        try:
            yield c
            c.commit()
        finally:
            c.close()


def init_db(reset: bool = False) -> None:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    with conn() as c:
        if reset:
            for t in TABLES:
                c.execute(f"DROP TABLE IF EXISTS {t}")
        for t, cols in TABLES.items():
            c.execute(f"CREATE TABLE IF NOT EXISTS {t} ({cols})")
        if c.execute("SELECT COUNT(*) FROM records").fetchone()[0] == 0:
            _seed(c)


def _seed(c: sqlite3.Connection) -> None:
    r = ref()
    seed = json.loads(settings.seed_file.read_text(encoding="utf-8"))["records"]
    demo_vals = r.demo["record_demo_values"]
    for rec in seed:
        rec.update(demo_vals.get(str(rec["id"]), {}))
        rec["owner"] = None          # seed records were created by (anonymized) colleagues, not a demo user
        rec["demo_values"] = True    # KPI fields / material links on seed records are demo values
        enrich(rec)
        c.execute("INSERT INTO records (id, doc) VALUES (?, ?)", (rec["id"], json.dumps(rec)))
    for u in r.demo["users"]:
        c.execute("INSERT INTO users (id, doc) VALUES (?, ?)", (u["id"], json.dumps(u)))
    for rep in r.demo["reports"]:
        c.execute("INSERT INTO reports (id, doc) VALUES (?, ?)", (rep["id"], json.dumps(rep)))
    for req in r.demo["workflow_requests"]:
        c.execute("INSERT INTO requests (id, doc) VALUES (?, ?)", (req["id"], json.dumps(req)))


# ---- generic helpers -------------------------------------------------------------------

def all_docs(table: str) -> List[dict]:
    with conn() as c:
        return [json.loads(d) for (d,) in c.execute(f"SELECT doc FROM {table}")]


def get_doc(table: str, key: Any) -> Optional[dict]:
    with conn() as c:
        row = c.execute(f"SELECT doc FROM {table} WHERE id = ?", (key,)).fetchone()
    return json.loads(row[0]) if row else None


def put_doc(table: str, key: Any, doc: dict) -> None:
    with conn() as c:
        c.execute(f"INSERT OR REPLACE INTO {table} (id, doc) VALUES (?, ?)", (key, json.dumps(doc)))


def delete_doc(table: str, key: Any) -> None:
    with conn() as c:
        c.execute(f"DELETE FROM {table} WHERE id = ?", (key,))


# ---- records -----------------------------------------------------------------------------

def records() -> List[dict]:
    return all_docs("records")


def next_record_id() -> int:
    with conn() as c:
        return (c.execute("SELECT COALESCE(MAX(id), 0) FROM records").fetchone()[0] or 0) + 1


def save_record(rec: dict) -> dict:
    enrich(rec)
    put_doc("records", rec["id"], rec)
    return rec


# ---- saved views ----------------------------------------------------------------------------

def views_for(user_id: str) -> List[dict]:
    with conn() as c:
        rows = c.execute("SELECT id, doc FROM views WHERE user_id = ? ORDER BY id", (user_id,)).fetchall()
    return [{**json.loads(d), "id": i} for i, d in rows]


def add_view(user_id: str, doc: Dict[str, Any]) -> dict:
    doc = {**doc, "created": now_iso()}
    with conn() as c:
        cur = c.execute("INSERT INTO views (user_id, doc) VALUES (?, ?)", (user_id, json.dumps(doc)))
        vid = cur.lastrowid
    return {**doc, "id": vid}


def delete_view(user_id: str, view_id: int) -> None:
    with conn() as c:
        c.execute("DELETE FROM views WHERE id = ? AND user_id = ?", (view_id, user_id))


# ---- dismissed notifications -------------------------------------------------------------------

def dismissed(user_id: str) -> set:
    with conn() as c:
        return {n for (n,) in c.execute("SELECT notif_id FROM dismissed WHERE user_id = ?", (user_id,))}


def dismiss(user_id: str, notif_id: str) -> None:
    with conn() as c:
        c.execute("INSERT OR IGNORE INTO dismissed (user_id, notif_id) VALUES (?, ?)", (user_id, notif_id))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Create / reset the database")
    p.add_argument("--reset", action="store_true", help="drop all tables and re-seed")
    args = p.parse_args()
    init_db(reset=args.reset)
    print(f"database ready: {settings.db_path}")
