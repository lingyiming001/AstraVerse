"""Official MCP SDK v1 adapter. API must already be running on loopback."""
import os
from typing import Any, Literal
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP('AstraVerse')
API = os.getenv('ASTRAVERSE_API', 'http://127.0.0.1:8000').rstrip('/')

async def command(tool: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(f'{API}/api/tools/execute', json={'tool':tool,'arguments':arguments or {}})
        if not response.is_success:
            return {'status':'error','http_status':response.status_code,'detail':response.json()}
        return response.json()

@mcp.tool(name='character.move')
async def move(x: float = 0, z: float = 0) -> dict[str, Any]:
    """Move avatar to absolute coordinates within -3..3 stage bounds."""
    return await command('character.move', {'x':x,'z':z})

@mcp.tool(name='character.rotate')
async def rotate(degrees: float = 0) -> dict[str, Any]:
    """Rotate avatar body in degrees within -180..180."""
    return await command('character.rotate', {'degrees':degrees})

@mcp.tool(name='character.jump')
async def jump() -> dict[str, Any]:
    """Start procedural jump animation."""
    return await command('character.jump')

@mcp.tool(name='character.emote')
async def emote(emotion: Literal['happy','neutral','curious','sad','surprised','relaxed'] = 'happy', intensity: float = 0.7) -> dict[str, Any]:
    """Set procedural avatar facial expression and intensity 0..1."""
    return await command('character.emote', {'emotion':emotion,'intensity':intensity})

@mcp.tool(name='character.pose')
async def pose(headYaw: float | None = None, headPitch: float | None = None, leftArm: float | None = None, rightArm: float | None = None, leftElbow: float | None = None, rightElbow: float | None = None, leftLeg: float | None = None, rightLeg: float | None = None, bodyLean: float | None = None) -> dict[str, Any]:
    """Set selected joint angles in degrees. Unspecified joints remain unchanged."""
    args=locals()
    return await command('character.pose',{key:value for key,value in args.items() if value is not None})

@mcp.tool(name='character.presence')
async def presence(naturalMotion: bool = True, gazeTracking: bool = True, breath: float = 0.6) -> dict[str, Any]:
    """Control natural breathing/blinking and pointer gaze tracking."""
    return await command('character.presence',{'naturalMotion':naturalMotion,'gazeTracking':gazeTracking,'breath':breath})

@mcp.tool(name='character.animate')
async def animate(animation: Literal['idle','wave','dance','jump','sit','crouch','sleep'] = 'idle') -> dict[str, Any]:
    """Set avatar procedural animation state."""
    return await command('character.animate', {'animation':animation})

@mcp.tool(name='character.speak')
async def speak(text: str) -> dict[str, Any]:
    """Dispatch speech to connected browser system speech synthesis."""
    return await command('character.speak', {'text':text})

@mcp.tool(name='character.sing')
async def sing() -> dict[str, Any]:
    """Planned singing voice synthesis; currently unsupported."""
    return await command('character.sing')

@mcp.tool(name='character.dance')
async def dance() -> dict[str, Any]:
    """Start original procedural dance."""
    return await command('character.dance')

@mcp.tool(name='scene.load')
async def load_scene(scene: Literal['lunar','aurora','sunset'] = 'lunar') -> dict[str, Any]:
    """Load a built-in stage preset."""
    return await command('scene.load', {'scene':scene})

@mcp.tool(name='scene.inspect')
async def inspect_scene() -> dict[str, Any]:
    """Inspect authoritative API stage state."""
    return await command('scene.inspect')

@mcp.tool(name='scene.navigate')
async def navigate(x: float = 0, z: float = 0) -> dict[str, Any]:
    """Planned navmesh navigation; currently unsupported."""
    return await command('scene.navigate', {'x':x,'z':z})

@mcp.tool(name='camera.control')
async def camera(mode: str = 'follow') -> dict[str, Any]:
    """Planned remote camera control; browser orbit controls are available."""
    return await command('camera.control', {'mode':mode})

@mcp.tool(name='music.play')
async def play() -> dict[str, Any]:
    """Request playback; browser user activation is required for audio."""
    return await command('music.play')

@mcp.tool(name='music.pause')
async def pause() -> dict[str, Any]:
    """Pause current browser track."""
    return await command('music.pause')

@mcp.tool(name='system.get_state')
async def get_state() -> dict[str, Any]:
    """Read state; dispatched does not imply renderer completion."""
    return await command('system.get_state')

async def api_request(method: str, path: str, body: dict | None = None) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.request(method, f'{API}{path}', json=body)
        response.raise_for_status()
        return response.json()

@mcp.tool(name='agents.list')
async def agents_list() -> dict[str, Any]:
    """List characters without private persona notes or conversation history."""
    data = await api_request('GET', '/api/agents')
    return {'agents': [{key: profile[key] for key in ('id', 'name', 'identity')} for profile in data['profiles']]}

@mcp.tool(name='agents.chat')
async def agents_chat(agent_id: str, message: str) -> dict[str, Any]:
    """Chat with isolated character memory; may incur configured model costs. Does not perform on stage."""
    return await api_request('POST', '/api/chat', {'agent_id': agent_id, 'message': message})

@mcp.tool(name='plugins.list')
async def plugins_list() -> dict[str, Any]:
    """Inspect bundled plugins, permissions and enabled state."""
    return await api_request('GET', '/api/plugins')

@mcp.tool(name='plugins.call')
async def plugins_call(tool: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    """Call an enabled local plugin. Writes require explicit user intent."""
    return await api_request('POST', '/api/plugins/execute', {'tool': tool, 'arguments': arguments or {}})


if __name__ == '__main__':
    mcp.run(transport='stdio')
