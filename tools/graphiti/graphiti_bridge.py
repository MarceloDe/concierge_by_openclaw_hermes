#!/usr/bin/env python3
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, ValidationError

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*_args, **_kwargs):
        return False

GRAPHITI_IMPORT_ERROR: Exception | None = None

try:
    from graphiti_core import Graphiti
    from graphiti_core.driver.falkordb_driver import FalkorDriver
    from graphiti_core.embedder.client import EmbedderClient, EmbedderConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    from graphiti_core.llm_client.client import LLMClient
    from graphiti_core.llm_client.config import DEFAULT_MAX_TOKENS, LLMConfig, ModelSize
    from graphiti_core.llm_client.openai_client import OpenAIClient
    from graphiti_core.nodes import EpisodeType
except Exception as error:
    GRAPHITI_IMPORT_ERROR = error
    Graphiti = None
    FalkorDriver = None
    OpenAIEmbedder = None
    OpenAIEmbedderConfig = None
    OpenAIClient = None
    EpisodeType = None
    DEFAULT_MAX_TOKENS = 4096

    class ModelSize:
        small = "small"
        medium = "medium"

    class LLMConfig:
        def __init__(
            self,
            api_key: str | None = None,
            model: str | None = None,
            base_url: str | None = None,
            temperature: float = 0,
            max_tokens: int = DEFAULT_MAX_TOKENS,
            small_model: str | None = None,
        ):
            self.api_key = api_key
            self.model = model
            self.base_url = base_url
            self.temperature = temperature
            self.max_tokens = max_tokens
            self.small_model = small_model

    class LLMClient:
        def __init__(self, config: LLMConfig | None = None, cache: bool = False):
            self.config = config or LLMConfig()
            self.model = self.config.model
            self.small_model = self.config.small_model
            self.temperature = self.config.temperature
            self.max_tokens = self.config.max_tokens

    class EmbedderConfig(BaseModel):
        embedding_dim: int = Field(default=int(os.getenv("EMBEDDING_DIM", "1024")), frozen=True)

    class EmbedderClient:
        pass


CONTRACT_VERSION = "2026-05-27.graphiti-product-memory.v1"
DEFAULT_BEDROCK_LLM_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0"
DEFAULT_BEDROCK_SMALL_MODEL = "anthropic.claude-3-5-haiku-20241022-v1:0"
DEFAULT_BEDROCK_EMBED_MODEL = "amazon.titan-embed-text-v2:0"


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


def get_llm_provider() -> str:
    return (os.environ.get("GRAPHITI_LLM_PROVIDER") or "openai").strip().lower()


def get_aws_region() -> str:
    return (
        os.environ.get("GRAPHITI_BEDROCK_REGION")
        or os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or "us-east-1"
    )


def extract_json_from_text(text: str) -> dict[str, Any]:
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(stripped[start:end])
        raise ValueError(f"Could not extract JSON object from Bedrock response: {stripped[:500]}")


def message_to_bedrock_content(message: Any) -> str:
    content = getattr(message, "content", None)
    return "" if content is None else str(content)


class BedrockLLMClient(LLMClient):
    """Graphiti LLM client backed by Amazon Bedrock Runtime Converse."""

    def __init__(self, config: LLMConfig | None = None, client: Any | None = None, cache: bool = False):
        if config is None:
            config = LLMConfig(
                model=os.environ.get("GRAPHITI_BEDROCK_LLM_MODEL_ID", DEFAULT_BEDROCK_LLM_MODEL),
                small_model=os.environ.get("GRAPHITI_BEDROCK_SMALL_MODEL_ID", DEFAULT_BEDROCK_SMALL_MODEL),
                temperature=float(os.environ.get("GRAPHITI_BEDROCK_TEMPERATURE", "0")),
                max_tokens=int(os.environ.get("GRAPHITI_BEDROCK_MAX_TOKENS", "4096")),
            )
        if config.model is None:
            config.model = os.environ.get("GRAPHITI_BEDROCK_LLM_MODEL_ID", DEFAULT_BEDROCK_LLM_MODEL)
        if config.small_model is None:
            config.small_model = os.environ.get("GRAPHITI_BEDROCK_SMALL_MODEL_ID", DEFAULT_BEDROCK_SMALL_MODEL)
        super().__init__(config, cache)
        self.region = get_aws_region()
        if client is not None:
            self.client = client
        else:
            try:
                import boto3
            except ImportError as error:
                raise ImportError(
                    "boto3 is required for GRAPHITI_LLM_PROVIDER=bedrock. "
                    "Install tools/graphiti/requirements-graphiti.txt into the Graphiti venv."
                ) from error
            self.client = boto3.client("bedrock-runtime", region_name=self.region)

    def _get_provider_type(self) -> str:
        return "bedrock"

    def _get_model_for_size(self, model_size: Any) -> str:
        size = getattr(model_size, "value", model_size)
        return self.small_model if size == "small" and self.small_model else self.model

    def _build_bedrock_messages(self, messages: list[Any]) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
        system_chunks: list[str] = []
        bedrock_messages: list[dict[str, Any]] = []
        for message in messages:
            role = getattr(message, "role", "user")
            text = message_to_bedrock_content(message)
            if role == "system":
                system_chunks.append(text)
                continue
            bedrock_role = "assistant" if role == "assistant" else "user"
            bedrock_messages.append({"role": bedrock_role, "content": [{"text": text}]})
        if not bedrock_messages:
            bedrock_messages.append({"role": "user", "content": [{"text": "\n\n".join(system_chunks)}]})
            system_chunks = []
        return [{"text": "\n\n".join(system_chunks)}] if system_chunks else [], bedrock_messages

    async def _generate_response(
        self,
        messages: list[Any],
        response_model: type[BaseModel] | None = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        model_size: Any = ModelSize.medium,
    ) -> dict[str, Any]:
        model_id = self._get_model_for_size(model_size)
        system, bedrock_messages = self._build_bedrock_messages(messages)
        response = await asyncio.to_thread(
            self.client.converse,
            modelId=model_id,
            system=system,
            messages=bedrock_messages,
            inferenceConfig={
                "maxTokens": int(max_tokens or self.max_tokens or DEFAULT_MAX_TOKENS),
                "temperature": float(self.temperature or 0),
            },
        )
        content = response.get("output", {}).get("message", {}).get("content", [])
        text = "\n".join(item.get("text", "") for item in content if isinstance(item, dict))
        parsed = extract_json_from_text(text)
        if response_model is not None:
            try:
                return response_model(**parsed).model_dump()
            except ValidationError:
                raise
        return parsed


class BedrockEmbedderConfig(EmbedderConfig):
    embedding_model: str = DEFAULT_BEDROCK_EMBED_MODEL
    region_name: str = "us-east-1"


class BedrockEmbedder(EmbedderClient):
    """Graphiti embedder backed by Amazon Titan Text Embeddings V2 on Bedrock."""

    def __init__(self, config: BedrockEmbedderConfig | None = None, client: Any | None = None):
        if config is None:
            config = BedrockEmbedderConfig(
                embedding_model=os.environ.get("GRAPHITI_BEDROCK_EMBED_MODEL_ID", DEFAULT_BEDROCK_EMBED_MODEL),
                region_name=get_aws_region(),
                embedding_dim=int(os.environ.get("GRAPHITI_BEDROCK_EMBED_DIM", "1024")),
            )
        self.config = config
        if client is not None:
            self.client = client
        else:
            try:
                import boto3
            except ImportError as error:
                raise ImportError(
                    "boto3 is required for GRAPHITI_LLM_PROVIDER=bedrock. "
                    "Install tools/graphiti/requirements-graphiti.txt into the Graphiti venv."
                ) from error
            self.client = boto3.client("bedrock-runtime", region_name=config.region_name)

    def _coerce_text(self, input_data: Any) -> str:
        if isinstance(input_data, str):
            return input_data
        if isinstance(input_data, list) and input_data and isinstance(input_data[0], str):
            return input_data[0]
        return str(input_data)

    async def create(self, input_data: Any) -> list[float]:
        text = self._coerce_text(input_data).replace("\n", " ")
        body = {
            "inputText": text,
            "dimensions": int(self.config.embedding_dim),
            "normalize": True,
        }
        response = await asyncio.to_thread(
            self.client.invoke_model,
            modelId=self.config.embedding_model,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )
        raw_body = response.get("body")
        payload = raw_body.read() if hasattr(raw_body, "read") else raw_body
        if isinstance(payload, bytes):
            payload = payload.decode("utf8")
        result = json.loads(payload)
        embedding = result.get("embedding") or result.get("embeddingsByType", {}).get("float")
        if not embedding:
            raise ValueError("Bedrock embedding response did not include an embedding vector.")
        return [float(value) for value in embedding[: int(self.config.embedding_dim)]]

    async def create_batch(self, input_data_list: list[str]) -> list[list[float]]:
        return [await self.create(input_data) for input_data in input_data_list]


def build_driver(backend: str, request: dict[str, Any]):
    if Graphiti is None:
        raise ImportError(f"Graphiti dependencies are not installed: {GRAPHITI_IMPORT_ERROR}")
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


def build_llm_and_embedder() -> tuple[Any, Any]:
    provider = get_llm_provider()
    if provider == "bedrock":
        llm = BedrockLLMClient()
        embedder = BedrockEmbedder()
        return llm, embedder
    if provider != "openai":
        raise ValueError(f"Unsupported GRAPHITI_LLM_PROVIDER: {provider}")
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
    return llm, embedder


def build_graphiti(request: dict[str, Any]) -> tuple[Graphiti, str, str | None]:
    backend = get_backend()
    group_id = get_group_id(request) if backend == "falkordb" else None
    driver = build_driver(backend, request)
    llm, embedder = build_llm_and_embedder()
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
            "llmProvider": get_llm_provider(),
            "llmModel": os.environ.get("GRAPHITI_LLM_MODEL", "gpt-4.1-mini"),
            "embeddingModel": os.environ.get("GRAPHITI_EMBEDDING_MODEL", "text-embedding-3-small"),
            "bedrockLlmModel": os.environ.get("GRAPHITI_BEDROCK_LLM_MODEL_ID", DEFAULT_BEDROCK_LLM_MODEL),
            "bedrockSmallModel": os.environ.get("GRAPHITI_BEDROCK_SMALL_MODEL_ID", DEFAULT_BEDROCK_SMALL_MODEL),
            "bedrockEmbeddingModel": os.environ.get("GRAPHITI_BEDROCK_EMBED_MODEL_ID", DEFAULT_BEDROCK_EMBED_MODEL),
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
