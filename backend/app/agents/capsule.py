from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions


async def stream_response(user_input: str):
    """Stream Claude's response word by word."""
    options = ClaudeAgentOptions(allowed_tools=[])
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt=user_input)

        # receive_response() streams everything Claude produces:
        # system events, hook messages, thinking blocks, and AssistantMessages.
        # Most are internal noise — we only care about AssistantMessage.
        async for msg in client.receive_response():
            if type(msg).__name__ != "AssistantMessage":
                continue

            # AssistantMessage.content is a list of blocks.
            # Possible types: TextBlock (has .text), ThinkingBlock (has .thinking, no .text).
            # We only want to stream blocks that carry visible text.
            for block in msg.content:
                if hasattr(block, "text") and block.text:
                    for word in block.text.split(" "):
                        yield word + " "
