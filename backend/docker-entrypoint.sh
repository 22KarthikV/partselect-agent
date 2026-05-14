#!/bin/bash
set -e

echo "=== PartSelect Agent Backend ==="

# Ensure the persistent volume directories exist
mkdir -p /data/chroma_db

DB_PATH="${DATABASE_URL:-/data/partselect.db}"

if [ ! -f "$DB_PATH" ]; then
    echo "No database found at $DB_PATH — seeding from seed_data.json..."
    python data/seed.py
    echo "Seed complete."
else
    # Guard against a partial-init where the file exists but the table is empty
    PART_COUNT=$(python -c "
import sqlite3, os
db = os.environ.get('DATABASE_URL', '/data/partselect.db')
try:
    conn = sqlite3.connect(db)
    count = conn.execute('SELECT COUNT(*) FROM parts').fetchone()[0]
    conn.close()
    print(count)
except Exception:
    print(0)
")
    if [ "$PART_COUNT" = "0" ]; then
        echo "Database exists but parts table is empty — seeding..."
        python data/seed.py
        echo "Seed complete."
    else
        echo "Database ready ($PART_COUNT parts). Skipping seed."
    fi
fi

echo "Starting uvicorn on port ${PORT:-8080}..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1
