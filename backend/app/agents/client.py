"""
Shared Anthropic client factory.

- If ANTHROPIC_API_KEY is set → use AsyncAnthropic (production, Railway)
- Otherwise → use AsyncAnthropicBedrock (local dev with AWS credentials)

Model IDs differ between the two:
- Bedrock:  anthropic.claude-3-haiku-20240307-v1:0
- Direct:   claude-haiku-4-5-20251001
"""
import os
from anthropic import AsyncAnthropic, AsyncAnthropicBedrock

_api_key = os.environ.get("ANTHROPIC_API_KEY", "")

if _api_key:
    anthropic_client = AsyncAnthropic(api_key=_api_key)
    HAIKU = "claude-haiku-4-5-20251001"
    SONNET = "claude-sonnet-4-6"
else:
    anthropic_client = AsyncAnthropicBedrock()
    HAIKU = "anthropic.claude-3-haiku-20240307-v1:0"
    SONNET = "anthropic.claude-3-5-sonnet-20241022-v2:0"
