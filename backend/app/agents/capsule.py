from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions


async def stream_response(user_input: str):
    """Stream Claude's response word by word."""
    options = ClaudeAgentOptions(allowed_tools=[])
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt=user_input)
        async for msg in client.receive_response():
            if type(msg).__name__ == "AssistantMessage":
                for block in msg.content:
                    if hasattr(block, "text") and block.text:
                        for word in block.text.split(" "):
                            yield word + " "
