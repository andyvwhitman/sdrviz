"""A-4: the Pi watchdog's decisions (the script is in receiver/pi and only restarts a service)."""

import importlib.machinery
import importlib.util
from pathlib import Path

PATH = Path(__file__).resolve().parents[2] / "receiver/pi/sdrviz-rtltcp-watchdog"
loader = importlib.machinery.SourceFileLoader("watchdog", str(PATH))
watchdog = importlib.util.module_from_spec(importlib.util.spec_from_loader("watchdog", loader))
loader.exec_module(watchdog)

AGENT_LINE = "rtl_tcp: [Errno 104] Connection reset by peer; retrying in 1s"


def test_normal_logs_are_fine():
    rtltcp = ["sdrviz: rtl_tcp -a 0.0.0.0 -p 1234", "Found 1 device(s):", "client accepted!"]
    assert watchdog.trouble(rtltcp, [AGENT_LINE] * 2) is None  # a restart of rtl_tcp costs a retry or two
    assert watchdog.trouble([], []) is None


def test_usb_errors_in_the_rtltcp_log_trigger_a_restart():
    lines = ["client accepted!", "usb_claim_interface error -6", "Failed to open rtlsdr device #0."]
    assert "USB error" in watchdog.trouble(lines, [])


def test_the_agent_retrying_again_and_again_triggers_a_restart():
    reason = watchdog.trouble([], [AGENT_LINE] * 10)  # one every 6 s for a minute
    assert reason and "10 times" in reason


def test_restarts_are_spaced_out():
    assert watchdog.may_restart(None, 1000.0)
    assert not watchdog.may_restart(1000.0, 1100.0)
    assert watchdog.may_restart(1000.0, 1000.0 + watchdog.COOLDOWN_S)
