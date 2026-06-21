#!/usr/bin/env python3
import asyncio
import io
import json
import os
import unittest
from dataclasses import dataclass
from unittest.mock import patch

from pydantic import BaseModel

import graphiti_bridge as bridge


@dataclass
class Message:
    role: str
    content: str


class StructuredAnswer(BaseModel):
    answer: str


class FakeBedrockRuntime:
    def __init__(self):
        self.converse_calls = []
        self.invoke_calls = []

    def converse(self, **kwargs):
        self.converse_calls.append(kwargs)
        return {
            "output": {"message": {"content": [{"text": json.dumps({"answer": "source-backed"})}]}},
            "usage": {"inputTokens": 12, "outputTokens": 4},
        }

    def invoke_model(self, **kwargs):
        self.invoke_calls.append(kwargs)
        return {"body": io.BytesIO(json.dumps({"embedding": [0.25] * 1030}).encode("utf8"))}


class BedrockProviderTest(unittest.TestCase):
    def test_llm_client_uses_bedrock_converse_and_validates_json(self):
        fake = FakeBedrockRuntime()
        client = bridge.BedrockLLMClient(client=fake)
        result = asyncio.run(
            client._generate_response(
                [
                    Message("system", "Return strict JSON only."),
                    Message("user", "What is supported by the source pointer?"),
                ],
                response_model=StructuredAnswer,
                max_tokens=128,
            )
        )
        self.assertEqual(result["answer"], "source-backed")
        self.assertEqual(fake.converse_calls[0]["modelId"], bridge.DEFAULT_BEDROCK_LLM_MODEL)
        self.assertEqual(fake.converse_calls[0]["messages"][0]["role"], "user")
        self.assertIn("system", fake.converse_calls[0])

    def test_embedder_uses_titan_v2_and_returns_configured_dimension(self):
        fake = FakeBedrockRuntime()
        embedder = bridge.BedrockEmbedder(client=fake)
        vector = asyncio.run(embedder.create(["masked source-pointer text"]))
        self.assertEqual(len(vector), 1024)
        self.assertEqual(fake.invoke_calls[0]["modelId"], bridge.DEFAULT_BEDROCK_EMBED_MODEL)
        body = json.loads(fake.invoke_calls[0]["body"])
        self.assertEqual(body["dimensions"], 1024)
        self.assertEqual(body["normalize"], True)

    def test_provider_selector_keeps_bedrock_path_env_selected(self):
        previous = os.environ.get("GRAPHITI_LLM_PROVIDER")
        os.environ["GRAPHITI_LLM_PROVIDER"] = "bedrock"
        sentinel_llm = object()
        sentinel_embedder = object()
        try:
            with patch.object(bridge, "BedrockLLMClient", return_value=sentinel_llm), patch.object(
                bridge, "BedrockEmbedder", return_value=sentinel_embedder
            ):
                llm, embedder = bridge.build_llm_and_embedder()
            self.assertIs(llm, sentinel_llm)
            self.assertIs(embedder, sentinel_embedder)
        finally:
            if previous is None:
                os.environ.pop("GRAPHITI_LLM_PROVIDER", None)
            else:
                os.environ["GRAPHITI_LLM_PROVIDER"] = previous


if __name__ == "__main__":
    unittest.main()
