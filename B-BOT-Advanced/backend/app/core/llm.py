"""OpenAI-compatible chat completion client with streaming support."""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx

from app.core.config import LLMConfig


class LLMError(RuntimeError):
    """Raised when the inference endpoint cannot satisfy a request."""


class LLMProvider:
    def __init__(self, config: LLMConfig) -> None:
        self.config = config

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    def _payload(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str],
        temperature: Optional[float],
        max_tokens: Optional[int],
        stream: bool,
    ) -> Dict[str, Any]:
        selected_model = model or self.config.model
        if not selected_model:
            raise LLMError("No model configured. Set llm.model or B_BOT_LLM_MODEL.")
        return {
            "model": selected_model,
            "messages": messages,
            "temperature": self.config.temperature if temperature is None else temperature,
            "max_tokens": self.config.max_tokens if max_tokens is None else max_tokens,
            "stream": stream,
        }

    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        payload = self._payload(messages, model, temperature, max_tokens, stream=True)
        timeout = httpx.Timeout(self.config.timeout, connect=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    self.config.chat_completions_url,
                    json=payload,
                    headers=self._headers(),
                ) as response:
                    if response.status_code >= 400:
                        body = await response.aread()
                        raise LLMError(
                            f"Inference endpoint returned {response.status_code}: "
                            f"{body.decode('utf-8', 'replace')[:500]}"
                        )
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[len("data:") :].strip()
                        if data == "[DONE]":
                            break
                        try:
                            event = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        choices = event.get("choices") or []
                        if not choices:
                            continue
                        delta = choices[0].get("delta") or {}
                        content = delta.get("content")
                        if content:
                            yield content
        except httpx.HTTPError as exc:
            raise LLMError(f"Could not reach inference endpoint: {exc}") from exc

    async def complete_chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        payload = self._payload(messages, model, temperature, max_tokens, stream=False)
        timeout = httpx.Timeout(self.config.timeout, connect=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    self.config.chat_completions_url,
                    json=payload,
                    headers=self._headers(),
                )
        except httpx.HTTPError as exc:
            raise LLMError(f"Could not reach inference endpoint: {exc}") from exc
        if response.status_code >= 400:
            raise LLMError(
                f"Inference endpoint returned {response.status_code}: "
                f"{response.text[:500]}"
            )
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise LLMError("Inference endpoint returned no choices.")
        return choices[0].get("message", {}).get("content", "")
