"""ChromaDB vector store for semantic search over parts and symptoms.

Singleton module — call initialize_vector_store() once at startup from the
FastAPI lifespan handler. All other functions degrade gracefully if not ready.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

CHROMA_PATH = os.environ.get("CHROMA_PERSIST_PATH", "./chroma_db")
COLLECTION_NAME = "partselect_knowledge"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

_client = None
_collection = None
_ready: bool = False


def _get_embedding_function() -> object:
    """Return a ChromaDB SentenceTransformer embedding function.

    Imported lazily so the heavy sentence-transformers package is only loaded
    when ChromaDB is actually used (avoids import-time cost on cold start).
    Uses the 'all-MiniLM-L6-v2' model: 384-dimension embeddings, ~80 MB on disk,
    good balance of quality and speed for semantic part/symptom search.
    """
    from chromadb.utils import embedding_functions
    return embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )


def initialize_vector_store(parts: list[dict], symptoms: list[dict]) -> bool:
    """Populate ChromaDB with part and symptom documents.

    Skips re-embedding only when ChromaDB count exactly matches SQLite count.
    Otherwise upserts all documents so the index stays in sync with the DB.
    Returns True on success, False on any failure (non-fatal — tools fall back
    to keyword search when the vector store is not ready).
    """
    global _client, _collection, _ready

    try:
        import chromadb

        _client = chromadb.PersistentClient(path=CHROMA_PATH)
        _collection = _client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=_get_embedding_function(),
        )

        # Build the full desired set from SQLite
        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict] = []

        for part in parts:
            ids.append(f"part_{part['ps_number']}")
            documents.append(f"{part['name']}. {part.get('description', '')}")
            metadatas.append({
                "type": "part",
                "ps_number": part["ps_number"],
                "appliance_type": part.get("appliance_type", ""),
                "name": part.get("name", ""),
                "category": part.get("category", ""),
                "likely_parts": "",
                "repair_guidance": "",
                "keywords": "",
            })

        for idx, symptom in enumerate(symptoms):
            ids.append(f"symptom_{idx}")
            documents.append(
                f"{symptom.get('symptom_description', '')}. "
                f"{symptom.get('symptom_keywords', '')}"
            )
            metadatas.append({
                "type": "symptom",
                "ps_number": "",
                "appliance_type": symptom.get("appliance_type", ""),
                "name": "",
                "category": "",
                "likely_parts": json.dumps(symptom.get("likely_parts", [])),
                "repair_guidance": symptom.get("repair_guidance", ""),
                "keywords": symptom.get("symptom_keywords", ""),
            })

        # Skip only when ChromaDB already has exactly the right number of docs
        existing_count = _collection.count()
        expected_count = len(ids)
        if existing_count == expected_count:
            logger.info(
                "Vector store already in sync (%d docs) — skipping re-index.",
                existing_count,
            )
            _ready = True
            return True

        # Out of sync — upsert everything so new parts are picked up
        logger.info(
            "Vector store out of sync (chroma=%d, sqlite=%d) — re-indexing.",
            existing_count,
            expected_count,
        )
        if ids:
            _collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
            logger.info("Vector store upserted %d documents.", len(ids))

        _ready = True
        return True

    except Exception as exc:
        logger.error("Vector store initialization failed: %s", exc)
        _ready = False
        return False


def query_vector_store(
    query_text: str,
    appliance_type: Optional[str] = None,
    n_results: int = 5,
    doc_type: Optional[str] = None,
) -> list[dict]:
    """Semantic search against the ChromaDB collection.

    Returns a list of dicts with keys: id, document, metadata, distance.
    Returns [] if the vector store is not ready or on any error.
    """
    if not _ready or _collection is None:
        return []

    try:
        where: Optional[dict] = None
        if appliance_type and doc_type:
            where = {
                "$and": [
                    {"appliance_type": {"$eq": appliance_type}},
                    {"type": {"$eq": doc_type}},
                ]
            }
        elif appliance_type:
            where = {"appliance_type": {"$eq": appliance_type}}
        elif doc_type:
            where = {"type": {"$eq": doc_type}}

        query_kwargs: dict = {"query_texts": [query_text], "n_results": n_results}
        if where is not None:
            query_kwargs["where"] = where

        results = _collection.query(**query_kwargs)

        output: list[dict] = []
        ids_list = results.get("ids", [[]])[0]
        docs_list = results.get("documents", [[]])[0]
        metas_list = results.get("metadatas", [[]])[0]
        dists_list = results.get("distances", [[]])[0]

        for doc_id, doc, meta, dist in zip(ids_list, docs_list, metas_list, dists_list):
            output.append({
                "id": doc_id,
                "document": doc,
                "metadata": meta or {},
                "distance": dist,
            })

        return output

    except Exception as exc:
        logger.warning("Vector store query failed: %s", exc)
        return []


def upsert_part(part: dict) -> None:
    """Add or update a single part document in ChromaDB after a live scrape.

    Called by tool handlers after caching a newly-scraped part so semantic search
    picks it up immediately without waiting for a full re-index at next startup.

    Args:
        part: Part dict with at least ps_number, name, description,
              appliance_type, and category keys.
              Silently no-ops if the vector store is not ready.
    """
    if not _ready or _collection is None:
        return
    try:
        _collection.upsert(
            ids=[f"part_{part['ps_number']}"],
            documents=[f"{part['name']}. {part.get('description', '')}"],
            metadatas=[{
                "type": "part",
                "ps_number": part["ps_number"],
                "appliance_type": part.get("appliance_type", ""),
                "name": part.get("name", ""),
                "category": part.get("category", ""),
                "likely_parts": "",
                "repair_guidance": "",
                "keywords": "",
            }],
        )
    except Exception as exc:
        logger.warning("Vector store upsert failed for %s: %s", part.get("ps_number"), exc)


def is_ready() -> bool:
    """Return True if the vector store was successfully initialised and is queryable."""
    return _ready


def get_status() -> str:
    """Return a human-readable status string for the /api/health endpoint.

    Returns "not_ready" if initialisation failed, or "ready (N documents)"
    on success, where N is the live document count from ChromaDB.
    """
    if not _ready or _collection is None:
        return "not_ready"
    try:
        count = _collection.count()
        return f"ready ({count} documents)"
    except Exception:
        return "ready"
