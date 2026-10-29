import pytest
import astraverse.modules.models.router as model_router
import astraverse.modules.agents.profiles as character_agents
@pytest.fixture(autouse=True)
def isolated_model_settings(tmp_path, monkeypatch):
    import astraverse.modules.live.archive as live_archive
    monkeypatch.setattr(live_archive, 'FILE', tmp_path / 'live-archive.sqlite3')
    config = tmp_path / 'models.json'
    monkeypatch.setattr(model_router, 'CONFIG_PATH', config)
    # Character agents import the platform path separately and persist chat history.
    monkeypatch.setattr(character_agents, 'CONFIG_PATH', config)
    monkeypatch.setattr(character_agents, 'DIRECTORY', tmp_path)
    monkeypatch.setattr(character_agents, 'PROFILES', tmp_path / 'agents.json')
    monkeypatch.setattr(character_agents, 'MEMORY', tmp_path / 'agent-memory.sqlite3')
    monkeypatch.delenv('LLM_MODEL', raising=False)
    monkeypatch.delenv('LLM_API_KEY', raising=False)
