# # agent.py
# import asyncio
# from claude_agent_sdk import query, ClaudeAgentOptions
# async def main():
#     async for msg in query(
#         prompt="Your task here",
#         options=ClaudeAgentOptions(
#             cwd=".",
#             allowed_tools=["Read", "Glob", "Grep"],
#         )
#     ):
#         if "result" in msg:
#             print(msg["result"])
# asyncio.run(main())

import asyncio
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AgentDefinition
async def main():
    agents = {
        "researcher": AgentDefinition(
            description="Gathers information via web search.",
            tools=["WebSearch", "Write"],
            prompt="You are a research assistant. Search the web and write findings to files.",
            model="haiku"
        ),
        "writer": AgentDefinition(
            description="Reads research notes and writes a summary report.",
            tools=["Read", "Write", "Glob"],
            prompt="You are a report writer. Read research notes and produce a clear summary.",
            model="haiku"
        )
    }
    options = ClaudeAgentOptions(
        permission_mode="bypassPermissions",
        allowed_tools=["Task"],  # Lead agent only needs Task to spawn subagents
        agents=agents,
        model="haiku"
    )
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt="Research the latest trends in renewable energy and write a summary.")
        async for msg in client.receive_response():
            if type(msg).__name__ == "AssistantMessage":
                for block in msg.content:
                    if type(block).__name__ == "TextBlock":
                        print(block.text)
asyncio.run(main())