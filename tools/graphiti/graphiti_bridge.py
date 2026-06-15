#!/usr/bin/env python3
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_client import OpenAIClient
from graphiti_core.nodes import EpisodeType


CONTRACT_VERSION = "2026-05-27.graphiti-product-memory.v1"


def write_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, default=str))


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_backend() -> str:
    return os.environ.get("GRAPHITI_BACKEND") or os.environ.get("GRAPHITI_DRIVER") or "falkordb"


def get_group_id(request: dict[str, Any]) -> str | None:
    group_id = request.get("groupId") or os.environ.get("GRAPHITI_GROUP_ID") or "brainstyworkers_local"
    return str(group_id).replace(":", "_").replace("/", "_")


def build_driver(backend: str, request: dict[str, Any]):
    if backend == "kuzu":
        from graphiti_core.driver.kuzu_driver import KuzuDriver

        db_path = request.get("dbPath") or os.environ.get("GRAPHITI_KUZU_DB_PATH") or "data/graphiti-kuzu"
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        return KuzuDriver(db=db_path)
    if backend != "falkordb":
        raise ValueError(f"Unsupported Graphiti backend: {backend}")
    return FalkorDriver(
        host=os.environ.get("FALKORDB_HOST", "localhost"),
        port=os.environ.get("FALKORDB_PORT", "6380"),
        username=os.environ.get("FALKORDB_USERNAME") or None,
        password=os.environ.get("FALKORDB_PASSWORD") or None,
        database=get_group_id(request),
    )


def build_graphiti(request: dict[str, Any]) -> tuple[Graphiti, str, str | None]:
    backend = get_backend()
    group_id = get_group_id(request) if backend == "falkordb" else None
    driver = build_driver(backend, request)
    base_url = os.environ.get("GRAPHITI_OPENAI_BASE_URL") or os.environ.get("BRAINSTY_OPENAI_BASE_URL")
    llm = OpenAIClient(
        config=LLMConfig(
            api_key=os.environ.get("OPENAI_API_KEY"),
            model=os.environ.get("GRAPHITI_LLM_MODEL", "gpt-4.1-mini"),
            small_model=os.environ.get("GRAPHITI_SMALL_MODEL", "gpt-4.1-nano"),
            base_url=base_url,
        )
    )
    embedder = OpenAIEmbedder(
        config=OpenAIEmbedderConfig(
            api_key=os.environ.get("OPENAI_API_KEY"),
            base_url=base_url,
            embedding_model=os.environ.get("GRAPHITI_EMBEDDING_MODEL", "text-embedding-3-small"),
        )
    )
    graphiti = Graphiti(
        graph_driver=driver,
        llm_client=llm,
        embedder=embedder,
        store_raw_episode_content=env_bool("GRAPHITI_STORE_RAW_EPISODES", False),
        max_coroutines=int(os.environ.get("GRAPHITI_MAX_COROUTINES", "1")),
    )
    return graphiti, backend, group_id


def result_to_fact(result: Any) -> dict[str, Any]:
    return {
        "uuid": getattr(result, "uuid", None),
        "fact": getattr(result, "fact", None),
        "name": getattr(result, "name", None),
        "sourceNodeUuid": getattr(result, "source_node_uuid", None),
        "targetNodeUuid": getattr(result, "target_node_uuid", None),
        "validAt": getattr(result, "valid_at", None),
        "invalidAt": getattr(result, "invalid_at", None),
    }


async def run(request: dict[str, Any]) -> dict[str, Any]:
    load_dotenv(Path.cwd() / ".env.local")
    action = request.get("action", "status")
    graphiti, backend, group_id = build_graphiti(request)
    try:
        await graphiti.build_indices_and_constraints()
        base = {
            "ok": True,
            "contractVersion": CONTRACT_VERSION,
            "action": action,
            "backend": backend,
            "groupId": group_id,
            "schemaReady": True,
            "llmModel": os.environ.get("GRAPHITI_LLM_MODEL", "gpt-4.1-mini"),
            "embeddingModel": os.environ.get("GRAPHITI_EMBEDDING_MODEL", "text-embedding-3-small"),
            "rawEpisodeStorage": env_bool("GRAPHITI_STORE_RAW_EPISODES", False),
        }
        if action == "status":
            return base
        if action == "retain":
            episode_body = request.get("episodeBody")
            if episode_body is None:
                raise ValueError("episodeBody is required for retain")
            if not isinstance(episode_body, str):
                episode_body = json.dumps(episode_body, sort_keys=True)
            source = request.get("source", "json")
            add_result = await graphiti.add_episode(
                name=request.get("name", f"brainsty-memory-{datetime.now(timezone.utc).isoformat()}"),
                episode_body=episode_body,
                source=EpisodeType.json if source == "json" else EpisodeType.text,
                source_description=request.get("sourceDescription", "brainsty product memory safe summary"),
                reference_time=datetime.fromisoformat(request["referenceTime"])
                if request.get("referenceTime")
                else datetime.now(timezone.utc),
                group_id=group_id,
                uuid=request.get("episodeUuid") or None,
            )
            return {
                **base,
                "episodeUuid": add_result.episode.uuid,
                "nodeCount": len(add_result.nodes),
                "edgeCount": len(add_result.edges),
                "episodicEdgeCount": len(add_result.episodic_edges),
            }
        if action == "recall":
            query = str(request.get("query") or "").strip()
            if not query:
                return {**base, "facts": []}
            results = await graphiti.search(
                query,
                group_ids=[group_id] if group_id else None,
                num_results=int(request.get("limit", 5)),
            )
            return {**base, "facts": [result_to_fact(item) for item in results]}
        if action == "suppress":
            episode_uuid = request.get("episodeUuid")
            if not episode_uuid:
                raise ValueError("episodeUuid is required for suppress")
            await graphiti.remove_episode(episode_uuid)
            return {**base, "episodeUuid": episode_uuid, "suppressed": True}
        raise ValueError(f"Unsupported action: {action}")
    finally:
        await graphiti.close()


async def main() -> None:
    try:
        write_json(await run(read_request()))
    except Exception as error:
        write_json(
            {
                "ok": False,
                "contractVersion": CONTRACT_VERSION,
                "error": str(error),
                "errorType": error.__class__.__name__,
            }
        )
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
