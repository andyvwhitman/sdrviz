"""`sdrviz-node`: run, enroll <key|file>, status."""

import argparse
import asyncio
import contextlib
import logging
import signal
import sys
import time
from pathlib import Path

from . import AGENT_VERSION
from .agent import Agent
from .config import ConfigDir
from .enroll import EnrollError, enroll, read_key
from .sources import ReplaySource


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sdrviz-node", description="sdrviz receiver node agent")
    parser.add_argument("--config-dir", type=Path, help="default /etc/sdrviz-node, or $SDRVIZ_NODE_DIR")
    parser.add_argument("--version", action="version", version=AGENT_VERSION)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run", help="receive and uplink (what the systemd unit runs)")
    run.add_argument("--replay", type=Path, metavar="FILE.iq", help="loop a recording of uint8 I/Q instead of rtl_tcp")
    enroll_parser = commands.add_parser("enroll", help="trade a node key for this node's permanent secret")
    enroll_parser.add_argument("key", help="the node key, or a file that holds it")
    commands.add_parser("status", help="show the running agent's state")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = ConfigDir(args.config_dir)

    if args.command == "enroll":
        return _enroll(config, args.key)
    if args.command == "status":
        return _status(config)
    source_factory = (lambda settings: ReplaySource(args.replay)) if args.replay else None
    with contextlib.suppress(KeyboardInterrupt, asyncio.CancelledError):
        asyncio.run(_serve(Agent(config, source_factory)))
    return 0  # also after a restart command: systemd's Restart=always starts the agent again


async def _serve(agent: Agent) -> None:
    """Run until `restart`, Ctrl-C or SIGTERM (systemd stop): all of them end the process cleanly."""
    asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, asyncio.current_task().cancel)
    await agent.run()


def _enroll(config: ConfigDir, key: str) -> int:
    try:
        credentials = asyncio.run(enroll(read_key(key), config))
    except (EnrollError, OSError) as error:
        print(f"enrollment failed: {error}", file=sys.stderr)
        return 1
    print(f"enrolled as {credentials.node} at {credentials.url}; credentials saved in {config.path}/node.json")
    print("start (or restart) the agent: sudo systemctl restart sdrviz-node")
    return 0


def _status(config: ConfigDir) -> int:
    credentials = config.credentials()
    if credentials is None:
        print(f"not enrolled (no node.json in {config.path}); run: sdrviz-node enroll <key>")
        return 1
    print(f"node {credentials.node} at {credentials.url}")
    status = config.read_status()
    if status is None:
        print("agent: no status file; is it running? (systemctl status sdrviz-node)")
        return 1
    age = time.time() - status["updated"]
    print(f"agent {status['version']}, status {age:.0f} s old{' (stale: not running?)' if age > 30 else ''}")
    detail = f" - {status['detail']}" if status["detail"] else ""
    print(f"uplink: {status['uplink']}{detail}; reconnects {status['reconnects']}")
    print(f"rtl_tcp: {status['rtl_tcp']}; {status['channels']} channels; dropped blocks {status['dropped_blocks']}")
    return 0 if status["uplink"] == "online" else 1
