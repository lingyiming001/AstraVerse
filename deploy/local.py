#!/usr/bin/env python3
"""Manage the two loopback-only AstraVerse services without a terminal session."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / '.local' / 'run'
SERVICES = {
    'api': (8000, [str(ROOT / 'apps/astraverse/.venv/bin/python'), '-m', 'uvicorn', 'astraverse.api.application:app', '--app-dir', str(ROOT / 'apps/astraverse/src'), '--host', '127.0.0.1', '--port', '8000'], 'http://127.0.0.1:8000/api/health'),
    'web': (5174, ['node', str(ROOT / 'apps/astraverse-web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], 'http://127.0.0.1:5174/'),
}


def owned(name):
    path = RUN / (name + '.pid')
    if not path.exists():
        return None
    pid = int(path.read_text())
    result = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True)
    marker = str(ROOT / ('apps/astraverse' if name == 'api' else 'apps/astraverse-web/node_modules/vite/bin/vite.js'))
    return pid if marker in result.stdout else None


def ready(url):
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return response.status == 200
    except (OSError, ValueError):
        return False


def stop(name):
    pid = owned(name)
    if pid:
        os.kill(pid, signal.SIGTERM)
        for _ in range(100):
            if not owned(name):
                break
            time.sleep(.1)
        else:
            raise RuntimeError(f'{name} did not stop; inspect PID {pid}')
    (RUN / (name + '.pid')).unlink(missing_ok=True)


def start(name):
    port, command, url = SERVICES[name]
    if owned(name):
        if ready(url):
            return
        raise RuntimeError(f'{name} is running but unhealthy; inspect {RUN / (name + ".log")}')
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(f'Port {port} is occupied by an unmanaged process')
    cwd = ROOT if name == 'api' else ROOT / 'apps/astraverse-web'
    with (RUN / (name + '.log')).open('ab') as log:
        process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    (RUN / (name + '.pid')).write_text(str(process.pid))
    for _ in range(100):
        if process.poll() is not None:
            break
        if ready(url):
            return
        time.sleep(.1)
    stop(name)
    raise RuntimeError(f'{name} failed readiness; inspect {RUN / (name + ".log")}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'stop', 'restart', 'status'])
    action = parser.parse_args().action
    RUN.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (RUN / 'manager.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if action in ('stop', 'restart'):
            for name in ('web', 'api'):
                stop(name)
        if action in ('start', 'restart'):
            if not (ROOT / 'apps/astraverse-web/dist/index.html').is_file():
                raise RuntimeError('Run bash deploy/start-local.sh first')
            started = []
            try:
                for name in SERVICES:
                    already_running = owned(name)
                    start(name)
                    if not already_running:
                        started.append(name)
            except Exception:
                for name in reversed(started):
                    stop(name)
                raise
        print(json.dumps({name: {'pid': owned(name), 'ready': ready(value[2]), 'url': value[2]} for name, value in SERVICES.items()}, indent=2))


if __name__ == '__main__':
    main()
