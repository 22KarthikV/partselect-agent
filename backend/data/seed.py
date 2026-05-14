"""Populate the SQLite database from seed_data.json.

Run from the backend/ directory:
    python data/seed.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from data.database import create_tables, get_db_connection

SEED_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data.json")


def seed() -> None:
    with open(SEED_FILE, encoding="utf-8") as f:
        data = json.load(f)

    parts = data.get("parts", [])
    models = data.get("models", [])
    compat = data.get("compatibility", [])
    symptoms = data.get("symptoms", [])

    with get_db_connection() as conn:
        create_tables(conn)

        for p in parts:
            conn.execute(
                """INSERT OR REPLACE INTO parts
                   (ps_number, mfr_number, name, appliance_type, category,
                    price, in_stock, description, install_steps, image_url, partselect_url)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    p["ps_number"],
                    p.get("mfr_number", ""),
                    p["name"],
                    p["appliance_type"],
                    p["category"],
                    float(p.get("price", 0.0)),
                    int(p.get("in_stock", True)),
                    p.get("description", ""),
                    json.dumps(p.get("install_steps", [])),
                    p.get("image_url", ""),
                    p.get("partselect_url", ""),
                ),
            )

        for m in models:
            conn.execute(
                """INSERT OR REPLACE INTO models
                   (model_number, brand, appliance_type, description)
                   VALUES (?, ?, ?, ?)""",
                (
                    m["model_number"],
                    m.get("brand", ""),
                    m["appliance_type"],
                    m.get("description", ""),
                ),
            )

        compat_count = 0
        for c in compat:
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO compatibility (ps_number, model_number) VALUES (?, ?)",
                    (c["ps_number"], c["model_number"]),
                )
                compat_count += 1
            except Exception:
                pass

        for s in symptoms:
            conn.execute(
                """INSERT INTO symptoms
                   (appliance_type, symptom_keywords, symptom_description, likely_parts, repair_guidance)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    s["appliance_type"],
                    s.get("symptom_keywords", ""),
                    s.get("symptom_description", ""),
                    json.dumps(s.get("likely_parts", [])),
                    s.get("repair_guidance", ""),
                ),
            )

        conn.commit()

    print(
        f"Seeded {len(parts)} parts, {len(models)} models, "
        f"{compat_count} compatibility pairs, {len(symptoms)} symptoms."
    )


if __name__ == "__main__":
    seed()
