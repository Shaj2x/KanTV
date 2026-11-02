#!/usr/bin/env python3
"""A fake adbd on TCP for tests: the ADB protocol in front of the fake Android userland in this folder.

    FAKE_TV_STATE=tv.json python3 adbd.py [--port 0] [--keys adb_keys] [--prompt accept|reject|ignore]
          [--version 0x01000001] [--maxdata 262144]

Prints "READY <port>" once listening. Implements what a TV's adbd does for a network client: CNXN, AUTH with
a random token checked against the authorised keys (RSA PKCS#1 v1.5 over the token as a SHA-1 digest), the
"Allow USB debugging?" prompt for an unknown key (accept: remembered as "always allow"; reject and ignore:
no answer, as on a TV where nobody taps), and the legacy "shell:" service, run through `sh` with the fake
tools first on PATH. A command matching the state's "transport_fail" drops the connection, as a TV that
lost Wi-Fi does. Checked against adb-shell, the client upstream cleanyourtv uses (test_adbd.py).
"""
import argparse
import asyncio
import base64
import json
import os
import struct
import sys

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa, utils

HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "bin")

def cmd(name):
    return struct.unpack("<I", name.encode())[0]

CNXN, AUTH, OPEN, OKAY, CLSE, WRTE = (cmd(n) for n in ("CNXN", "AUTH", "OPEN", "OKAY", "CLSE", "WRTE"))
TOKEN, SIGNATURE, RSAPUBLICKEY = 1, 2, 3


def pack(command, arg0, arg1, data=b""):
    return struct.pack("<6I", command, arg0, arg1, len(data), sum(data) & 0xFFFFFFFF, command ^ 0xFFFFFFFF) + data


def decode_android_pubkey(line):
    """The RSAPublicKey struct (AOSP android_pubkey.c) to a cryptography public key."""
    blob = base64.b64decode(line.split()[0])
    words, _n0inv = struct.unpack_from("<II", blob)
    size = words * 4
    modulus = int.from_bytes(blob[8:8 + size], "little")
    exponent = struct.unpack_from("<I", blob, 8 + 2 * size)[0]
    return rsa.RSAPublicNumbers(exponent, modulus).public_key()


class Adbd:
    def __init__(self, args):
        self.args = args
        self.keys_path = args.keys
        self.version = int(args.version, 0)
        self.maxdata = args.maxdata

    def authorised(self):
        if not self.keys_path or not os.path.exists(self.keys_path):
            return []
        with open(self.keys_path) as f:
            return [l.strip() for l in f if l.strip()]

    def state(self):
        with open(os.environ["FAKE_TV_STATE"]) as f:
            return json.load(f)

    def banner(self):
        props = self.state().get("props", {})
        fields = [f"ro.product.{k}={props.get('ro.product.' + k, '')}" for k in ("name", "model", "device")]
        return ("device::" + ";".join(fields) + ";features=shell_v2,cmd\0").encode()

    async def handle(self, reader, writer):
        async def read_msg():
            head = await reader.readexactly(24)
            command, arg0, arg1, length, check, magic = struct.unpack("<6I", head)
            if magic != command ^ 0xFFFFFFFF:
                raise ValueError("bad magic")
            data = await reader.readexactly(length) if length else b""
            return command, arg0, arg1, data

        def send(*m):
            writer.write(pack(*m))

        try:
            command, version, peer_max, _ = await read_msg()
            if command != CNXN:
                return
            max_out = min(peer_max, self.maxdata)
            token = os.urandom(20)
            send(AUTH, TOKEN, 0, token)
            await writer.drain()
            while True:
                command, arg0, _, data = await read_msg()
                if command != AUTH:
                    return
                if arg0 == SIGNATURE:
                    if any(self.verify(k, token, data) for k in self.authorised()):
                        break
                    token = os.urandom(20)
                    send(AUTH, TOKEN, 0, token)
                    await writer.drain()
                elif arg0 == RSAPUBLICKEY:
                    line = data.rstrip(b"\0").decode()
                    if self.args.prompt == "accept":
                        if self.keys_path:
                            with open(self.keys_path, "a") as f:
                                f.write(line + "\n")
                        break
                    if self.args.prompt == "reject":
                        token = os.urandom(20)
                        send(AUTH, TOKEN, 0, token)
                        await writer.drain()
                    # "ignore": nobody at the TV, so no answer at all
            send(CNXN, self.version, self.maxdata, self.banner())
            await writer.drain()
            next_id = 100
            while True:
                command, arg0, arg1, data = await read_msg()
                if command == OPEN:
                    local, service = next_id, data.rstrip(b"\0").decode()
                    next_id += 1
                    if not service.startswith("shell:"):
                        send(CLSE, 0, arg0)
                        continue
                    shell_cmd = service[len("shell:"):]
                    if any(s in shell_cmd for s in self.state().get("transport_fail", [])):
                        writer.close()
                        return
                    send(OKAY, local, arg0)
                    out = await self.run(shell_cmd)
                    for i in range(0, len(out), max_out):
                        send(WRTE, local, arg0, out[i:i + max_out])
                        await writer.drain()
                        while True:  # adbd waits for the client's OKAY before the next write
                            c, a0, a1, _ = await read_msg()
                            if c == OKAY and a1 == local:
                                break
                    send(CLSE, local, arg0)
                    await writer.drain()
                    if str(self.state().get("settings", {}).get("adb_enabled", "1")) == "0":
                        # Debugging switched off: adbd stops, and the port refuses from now on.
                        self.server.close()
                        writer.close()
                        return
                elif command in (OKAY, CLSE):
                    continue
                else:
                    return
        except (asyncio.IncompleteReadError, ConnectionError, ValueError):
            pass
        finally:
            writer.close()

    @staticmethod
    def verify(key_line, token, signature):
        try:
            decode_android_pubkey(key_line).verify(signature, token, padding.PKCS1v15(), utils.Prehashed(hashes.SHA1()))
            return True
        except (InvalidSignature, ValueError):
            return False

    async def run(self, command):
        env = dict(os.environ, PATH=BIN + os.pathsep + os.environ.get("PATH", ""))
        proc = await asyncio.create_subprocess_exec("sh", "-c", command, env=env, stdin=asyncio.subprocess.DEVNULL,
                                                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        out, _ = await proc.communicate()
        return out


async def main():
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=0)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--keys")
    p.add_argument("--prompt", choices=["accept", "reject", "ignore"], default="accept")
    p.add_argument("--version", default="0x01000001")
    p.add_argument("--maxdata", type=int, default=256 * 1024)
    args = p.parse_args()
    adbd = Adbd(args)
    server = await asyncio.start_server(adbd.handle, args.host, args.port)
    adbd.server = server
    print(f"READY {server.sockets[0].getsockname()[1]}", flush=True)
    try:
        async with server:
            await server.serve_forever()
    except asyncio.CancelledError:
        pass
    await asyncio.Event().wait()  # stay up, refusing, so the port check sees adbd gone


if __name__ == "__main__":
    asyncio.run(main())
