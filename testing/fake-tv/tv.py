#!/usr/bin/env python3
"""Stands in for upstream cleanyourtv's tools/tv.py: the ADB transport, replaced by a local `sh` whose PATH
puts the fake Android tools in bin/ first. Everything above the transport (disable.sh, recovery.py) is
upstream's own code, unmodified.

FAKE_TV_STATE names the TV's JSON state. Its "transport_fail" list holds substrings: a command containing one
fails the way tv.py does when the TV does not answer (exit 1, nothing printed; Device.shell raises).
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_PATH = os.environ["FAKE_TV_STATE"]
BIN = os.environ.get("FAKE_TV_BIN") or os.path.join(HERE, "bin")


class TransportError(Exception):
    pass


def transport_fails(command):
    with open(STATE_PATH) as f:
        state = json.load(f)
    return any(s in command for s in state.get("transport_fail", []))


def run(command):
    if transport_fails(command):
        raise TransportError(command)
    env = dict(os.environ, PATH=BIN + os.pathsep + os.environ.get("PATH", ""))
    done = subprocess.run(["sh", "-c", command], env=env, capture_output=True, text=True,
                          stdin=subprocess.DEVNULL)
    # adb shell merges the command's stderr into what the client prints.
    return done.stdout + done.stderr


class Device:
    def shell(self, command, read_timeout_s=None):
        return run(command)

    def close(self):
        pass


def connect():
    return Device()


def main():
    args = sys.argv[1:]
    if args[:1] == ["--batch"]:
        for line in sys.stdin:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            try:
                sys.stdout.write(run(line))
            except TransportError:
                return 1
        return 0
    try:
        sys.stdout.write(run(" ".join(args)))
    except TransportError:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
