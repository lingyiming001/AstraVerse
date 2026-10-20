"""Guard package direction and keep contracts independent of the application."""
import ast
import os
from pathlib import Path
import subprocess
import sys

import astraverse


def test_core_does_not_depend_on_api_or_business_modules():
    package = Path(astraverse.__file__).parent
    for path in (package / 'core').rglob('*.py'):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or '').startswith(('astraverse.api', 'astraverse.modules', 'astraverse.integrations'))
            elif isinstance(node, ast.Import):
                assert all(not item.name.startswith(('astraverse.api', 'astraverse.modules', 'astraverse.integrations')) for item in node.names)


def test_contracts_import_without_starting_application(tmp_path):
    env = {**os.environ, 'ASTRAVERSE_DATA_DIR': str(tmp_path), 'PYTHONPATH': str(Path(astraverse.__file__).parents[1])}
    subprocess.run([sys.executable, '-c', "from astraverse.modules.models.schemas import Settings; import sys; assert 'astraverse.api.application' not in sys.modules; assert 'astraverse.modules.models.router' not in sys.modules; assert Settings().providers == []"], cwd=tmp_path, env=env, check=True)
    assert not list(tmp_path.iterdir())
