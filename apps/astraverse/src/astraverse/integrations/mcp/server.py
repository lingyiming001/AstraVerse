"""Official SDK Streamable HTTP transport, mounted in the existing API lifecycle."""
from typing import Any
from mcp.server.fastmcp import FastMCP
from astraverse.modules.agents.profiles import DEFAULTS, saved_profiles
from astraverse.modules.plugins.router import inventory, invoke


def create_server(execute, chat, command_type, chat_type, catalog):
    server=FastMCP('AstraVerse',instructions='Local single-user character workspace. Discover controls and enabled plugins before calling. Browser playback needs user activation. Agent chat may use the configured paid model. Plugin writes require explicit user intent.',stateless_http=True,json_response=True,streamable_http_path='/')

    @server.tool(name='controls.list')
    async def controls_list() -> dict[str,Any]:
        """List actual stage tools with validated JSON input schemas."""
        return await catalog()

    @server.tool(name='controls.call')
    async def controls_call(tool:str,arguments:dict[str,Any]|None=None)->dict[str,Any]:
        """Call a stage control from controls.list; shared with the open browser."""
        return await execute(command_type(tool=tool,arguments=arguments or {}))

    @server.tool(name='agents.list')
    async def agents_list()->dict[str,Any]:
        """List available configured characters, excluding private notes/history."""
        saved=saved_profiles()
        merged={p.id:p for p in DEFAULTS};merged.update(saved)
        return {'agents':[{'id':p.id,'name':p.name,'identity':p.identity} for p in merged.values()]}

    @server.tool(name='agents.chat')
    async def agents_chat(agent_id:str,message:str,perform:bool=False)->dict[str,Any]:
        """Chat with a character's persona and isolated memory. May incur configured model cost. perform optionally dispatches expression/gesture to the current stage; it does not select an avatar or speak audio."""
        result=await chat(chat_type(agent_id=agent_id,message=message))
        if perform:
            cue=result.get('performance') or {}
            if cue.get('emotion'):await execute(command_type(tool='character.emote',arguments={'emotion':cue['emotion'],'intensity':cue.get('intensity',.6)}))
            action=result.get('action')
            if action in ('idle','wave','dance','jump','sit','crouch','sleep'):await execute(command_type(tool='character.animate',arguments={'animation':action}))
        return result

    @server.tool(name='plugins.list')
    async def plugins_list()->dict[str,Any]:
        """List bundled plugins, enablement and permissions. Enabling is only available in AstraVerse settings."""
        from astraverse.modules.plugins.router import tool_catalog
        return {'plugins':inventory()['plugins'],'tools':tool_catalog()}

    @server.tool(name='plugins.call')
    async def plugins_call(tool:str,arguments:dict[str,Any]|None=None)->dict[str,Any]:
        """Execute an enabled plugin. Clipboard/notes writes only with explicit user intent; arguments are schema-validated. No shell or arbitrary paths."""
        return await invoke(tool,arguments or {})

    return server
