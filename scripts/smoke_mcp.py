"""Run with .venv/bin/python scripts/smoke_mcp.py after starting API."""
import asyncio
import os
from pathlib import Path
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main() -> None:
    params = StdioServerParameters(command=sys.executable, args=[str(Path(__file__).resolve().parents[1] / 'packages/mcp/server.py')], env={'ASTRAVERSE_API':os.getenv('ASTRAVERSE_API','http://127.0.0.1:8000')})
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            discovery = await session.list_tools()
            assert len(discovery.tools) == 17
            result = await session.call_tool('character.dance', {})
            assert not result.isError
            assert 'dispatched' in str(result.content) or 'stored' in str(result.content)
            result = await session.call_tool('system.get_state', {})
            assert 'dance' in str(result.content)
            result = await session.call_tool('scene.navigate', {'x':1,'z':1})
            assert '501' in str(result.content)
            expression = await session.call_tool('character.emote', {'emotion':'curious','intensity':0.6})
            assert not expression.isError
            pose_result = await session.call_tool('character.pose', {'rightArm':55,'rightElbow':90})
            assert not pose_result.isError
            state_result=await session.call_tool('system.get_state', {})
            assert 'curious' in str(state_result.content)
            assert '55' in str(state_result.content)
            await session.call_tool('character.animate', {'animation':'idle'})
            print('PASS: official MCP stdio handshake, 17-tool discovery, dance, expression, pose, state, unsupported navigation')

if __name__ == '__main__':
    asyncio.run(main())
