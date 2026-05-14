import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone

DATABASE_URL = os.environ.get("DATABASE_URL", "./partselect.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_URL)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def create_tables(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS parts (
            ps_number       TEXT PRIMARY KEY,
            mfr_number      TEXT,
            name            TEXT NOT NULL,
            appliance_type  TEXT NOT NULL,
            category        TEXT NOT NULL,
            price           REAL NOT NULL,
            in_stock        INTEGER NOT NULL DEFAULT 1,
            description     TEXT NOT NULL DEFAULT '',
            install_steps   TEXT NOT NULL DEFAULT '[]',
            image_url       TEXT NOT NULL DEFAULT '',
            partselect_url  TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS models (
            model_number    TEXT PRIMARY KEY,
            brand           TEXT NOT NULL,
            appliance_type  TEXT NOT NULL,
            description     TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS compatibility (
            ps_number       TEXT NOT NULL,
            model_number    TEXT NOT NULL,
            PRIMARY KEY (ps_number, model_number),
            FOREIGN KEY (ps_number) REFERENCES parts(ps_number),
            FOREIGN KEY (model_number) REFERENCES models(model_number)
        );

        CREATE TABLE IF NOT EXISTS symptoms (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            appliance_type       TEXT NOT NULL,
            symptom_keywords     TEXT NOT NULL,
            symptom_description  TEXT NOT NULL,
            likely_parts         TEXT NOT NULL DEFAULT '[]',
            repair_guidance      TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_parts_appliance ON parts(appliance_type);
        CREATE INDEX IF NOT EXISTS idx_parts_category  ON parts(appliance_type, category);
        CREATE INDEX IF NOT EXISTS idx_compat_model    ON compatibility(model_number);
        CREATE INDEX IF NOT EXISTS idx_symptoms_type   ON symptoms(appliance_type);

        CREATE TABLE IF NOT EXISTS conversations (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            title       TEXT NOT NULL DEFAULT 'New conversation',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id              TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role            TEXT NOT NULL,
            content         TEXT NOT NULL,
            rich_cards      TEXT NOT NULL DEFAULT '[]',
            created_at      TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_messages_conv      ON messages(conversation_id, created_at);
    """)
    conn.commit()
    # Add rich_cards column to existing databases that predate this field
    try:
        conn.execute("ALTER TABLE messages ADD COLUMN rich_cards TEXT NOT NULL DEFAULT '[]'")
        conn.commit()
    except Exception:
        pass  # column already exists


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    if "install_steps" in d and isinstance(d["install_steps"], str):
        try:
            d["install_steps"] = json.loads(d["install_steps"])
        except (json.JSONDecodeError, TypeError):
            d["install_steps"] = []
    if "likely_parts" in d and isinstance(d["likely_parts"], str):
        try:
            d["likely_parts"] = json.loads(d["likely_parts"])
        except (json.JSONDecodeError, TypeError):
            d["likely_parts"] = []
    if "in_stock" in d:
        d["in_stock"] = bool(d["in_stock"])
    return d


def get_part_by_number(part_number: str) -> dict | None:
    """Look up by PS number first, then manufacturer number."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM parts WHERE ps_number = ?", (part_number,)
        ).fetchone()
        if row is None:
            row = conn.execute(
                "SELECT * FROM parts WHERE mfr_number = ?", (part_number,)
            ).fetchone()
        return _row_to_dict(row) if row else None


def get_model_info(model_number: str) -> dict | None:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM models WHERE model_number = ?", (model_number,)
        ).fetchone()
        return dict(row) if row else None


def get_compatibility(part_number: str, model_number: str) -> tuple[bool, str]:
    """Returns (is_compatible, explanation)."""
    part = get_part_by_number(part_number)
    if part is None:
        return False, f"Part {part_number} was not found in the database."

    model = get_model_info(model_number)
    if model is None:
        return False, f"Model {model_number} was not found in the database."

    ps_num = part["ps_number"]
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM compatibility WHERE ps_number = ? AND model_number = ?",
            (ps_num, model_number),
        ).fetchone()

    if row:
        return True, (
            f"{part['name']} ({ps_num}) is confirmed compatible with your "
            f"{model['brand']} {model['appliance_type']} model {model_number}."
        )

    # Cross-appliance mismatch — give a specific reason
    if part["appliance_type"] != model["appliance_type"]:
        return False, (
            f"{part['name']} ({ps_num}) is designed for a {part['appliance_type']}, "
            f"but model {model_number} is a {model['appliance_type']}. "
            f"This part will not fit."
        )

    return False, (
        f"{part['name']} ({ps_num}) is not listed as compatible with model {model_number}. "
        f"It may fit other {model['brand']} models, but not this one specifically."
    )


def get_parts_for_model(model_number: str, category: str | None = None) -> list[dict]:
    with get_db_connection() as conn:
        if category:
            rows = conn.execute(
                """SELECT p.* FROM parts p
                   JOIN compatibility c ON p.ps_number = c.ps_number
                   WHERE c.model_number = ? AND p.category = ?
                   ORDER BY p.price ASC""",
                (model_number, category),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT p.* FROM parts p
                   JOIN compatibility c ON p.ps_number = c.ps_number
                   WHERE c.model_number = ?
                   ORDER BY p.category, p.price ASC""",
                (model_number,),
            ).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_parts_by_category(appliance_type: str, category: str) -> list[dict]:
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM parts WHERE appliance_type = ? AND category = ? ORDER BY price ASC",
            (appliance_type, category),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def search_parts_by_keywords(query: str, appliance_type: str | None = None) -> list[dict]:
    like = f"%{query}%"
    with get_db_connection() as conn:
        if appliance_type:
            rows = conn.execute(
                """SELECT * FROM parts
                   WHERE appliance_type = ?
                     AND (name LIKE ? OR description LIKE ? OR category LIKE ? OR mfr_number LIKE ?)
                   ORDER BY
                     CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
                     price ASC
                   LIMIT 20""",
                (appliance_type, like, like, like, like, like),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM parts
                   WHERE name LIKE ? OR description LIKE ? OR category LIKE ? OR mfr_number LIKE ?
                   ORDER BY
                     CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
                     price ASC
                   LIMIT 20""",
                (like, like, like, like, like),
            ).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_symptoms_by_keywords(symptom: str, appliance_type: str) -> list[dict]:
    """Keyword search across symptom_keywords and symptom_description."""
    words = [w.strip() for w in symptom.lower().split() if len(w.strip()) > 2]
    if not words:
        return []

    with get_db_connection() as conn:
        all_rows = conn.execute(
            "SELECT * FROM symptoms WHERE appliance_type = ?", (appliance_type,)
        ).fetchall()

    scored: list[tuple[int, dict]] = []
    for row in all_rows:
        combined = (
            row["symptom_keywords"].lower() + " " + row["symptom_description"].lower()
        )
        score = sum(1 for w in words if w in combined)
        if score > 0:
            scored.append((score, _row_to_dict(row)))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:3]]


def get_parts_by_ps_numbers(ps_numbers: list[str]) -> list[dict]:
    if not ps_numbers:
        return []
    placeholders = ",".join("?" * len(ps_numbers))
    with get_db_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM parts WHERE ps_number IN ({placeholders})", ps_numbers
        ).fetchall()
    order = {ps: i for i, ps in enumerate(ps_numbers)}
    return sorted(
        [_row_to_dict(r) for r in rows],
        key=lambda p: order.get(p["ps_number"], 999),
    )


def get_order_by_id(order_id: str) -> dict | None:
    """Returns mock order data for demo purposes."""
    mock_orders = {
        "12345": {
            "order_id": "12345",
            "status": "shipped",
            "estimated_delivery": "2026-05-14",
            "tracking_number": "1Z999AA10123456784",
            "items": [
                {"ps_number": "PS11752778", "name": "Door Shelf Bin", "quantity": 1, "price": 47.40}
            ],
        },
        "67890": {
            "order_id": "67890",
            "status": "processing",
            "estimated_delivery": "2026-05-16",
            "tracking_number": "",
            "items": [
                {"ps_number": "PS11744150", "name": "Drain Pump", "quantity": 1, "price": 89.99}
            ],
        },
        "11111": {
            "order_id": "11111",
            "status": "delivered",
            "estimated_delivery": "2026-05-10",
            "tracking_number": "1Z999AA10123456785",
            "items": [
                {"ps_number": "PS11752899", "name": "Ice Maker Assembly", "quantity": 1, "price": 89.99},
                {"ps_number": "PS11724432", "name": "Water Inlet Valve", "quantity": 1, "price": 34.50},
            ],
        },
    }
    return mock_orders.get(order_id)


def get_all_parts_for_indexing() -> list[dict]:
    """Return all parts as plain dicts for vector store initialization."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT ps_number, name, description, appliance_type, category FROM parts"
        ).fetchall()
    return [dict(row) for row in rows]


def save_conversation(
    conversation_id: str,
    user_id: str,
    title: str,
    messages: list[dict],
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute(
            """INSERT INTO conversations (id, user_id, title, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 updated_at = excluded.updated_at""",
            (conversation_id, user_id, title, now, now),
        )
        conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
        for msg in messages:
            conn.execute(
                """INSERT INTO messages (id, conversation_id, role, content, rich_cards, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()),
                    conversation_id,
                    msg["role"],
                    msg["content"],
                    json.dumps(msg.get("rich_cards", [])),
                    now,
                ),
            )
        conn.commit()


def get_conversations(user_id: str) -> list[dict]:
    with get_db_connection() as conn:
        rows = conn.execute(
            """SELECT c.id, c.title, c.created_at, c.updated_at,
                      COUNT(m.id) AS message_count
               FROM conversations c
               LEFT JOIN messages m ON m.conversation_id = c.id
               WHERE c.user_id = ?
               GROUP BY c.id
               ORDER BY c.updated_at DESC
               LIMIT 50""",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_conversation_messages(conversation_id: str) -> list[dict]:
    with get_db_connection() as conn:
        rows = conn.execute(
            """SELECT id, role, content, rich_cards, created_at
               FROM messages
               WHERE conversation_id = ?
               ORDER BY created_at ASC""",
            (conversation_id,),
        ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        try:
            d["rich_cards"] = json.loads(d["rich_cards"]) if d.get("rich_cards") else []
        except (json.JSONDecodeError, TypeError):
            d["rich_cards"] = []
        result.append(d)
    return result


def get_all_symptoms_for_indexing() -> list[dict]:
    """Return all symptoms as plain dicts for vector store initialization."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT appliance_type, symptom_keywords, symptom_description, "
            "likely_parts, repair_guidance FROM symptoms"
        ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        try:
            d["likely_parts"] = json.loads(d["likely_parts"])
        except (json.JSONDecodeError, TypeError):
            d["likely_parts"] = []
        result.append(d)
    return result


def cache_scraped_part(part_data: dict) -> None:
    """Cache a scraped part into SQLite so subsequent lookups are instant."""
    if not part_data.get("ps_number"):
        return
    with get_db_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO parts
               (ps_number, mfr_number, name, appliance_type, category,
                price, in_stock, description, install_steps, image_url, partselect_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                part_data.get("ps_number", ""),
                part_data.get("mfr_number", ""),
                part_data.get("name", "Unknown Part"),
                part_data.get("appliance_type", "unknown"),
                part_data.get("category", "general"),
                part_data.get("price", 0.0),
                int(part_data.get("in_stock", False)),
                part_data.get("description", ""),
                json.dumps(part_data.get("install_steps", [])),
                part_data.get("image_url", ""),
                part_data.get("partselect_url", ""),
            ),
        )
        conn.commit()
