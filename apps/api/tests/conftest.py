import pytest
import model_router

@pytest.fixture(autouse=True)
def isolated_model_settings(tmp_path, monkeypatch):
    monkeypatch.setattr(model_router, 'CONFIG_PATH', tmp_path / 'models.json')
    monkeypatch.delenv('LLM_MODEL', raising=False)
    monkeypatch.delenv('LLM_API_KEY', raising=False)
