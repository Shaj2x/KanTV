"""The fake adbd has to satisfy adb-shell 0.4.4, the client upstream cleanyourtv drives real TVs with, before
anything else is tested against it.

    testing/venv/bin/python -m unittest testing/fake-tv/test_adbd.py -v
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

from adb_shell.adb_device import AdbDeviceTcp
from adb_shell.auth.keygen import keygen
from adb_shell.auth.sign_pythonrsa import PythonRSASigner

HERE = os.path.dirname(os.path.abspath(__file__))


class FakeAdbdTest(unittest.TestCase):
    def start(self, prompt="accept", authorised=None, **extra):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        state = os.path.join(tmp.name, "tv.json")
        with open(state, "w") as f:
            json.dump({"installed": ["com.google.android.tvlauncher", "com.vendor.ads"], **extra}, f)
        keys = os.path.join(tmp.name, "adb_keys")
        if authorised:
            with open(keys, "w") as f:
                f.write(authorised + "\n")
        proc = subprocess.Popen([sys.executable, os.path.join(HERE, "adbd.py"), "--keys", keys, "--prompt", prompt],
                                env=dict(os.environ, FAKE_TV_STATE=state), stdout=subprocess.PIPE, text=True)
        self.addCleanup(proc.kill)
        self.port = int(proc.stdout.readline().split()[1])
        self.keys = keys
        key = os.path.join(tmp.name, "adbkey")
        keygen(key)
        with open(key) as f:
            priv = f.read()
        with open(key + ".pub") as f:
            pub = f.read()
        self.signer = PythonRSASigner(pub, priv)
        self.pub = pub

    def connect(self, auth_timeout_s=5):
        dev = AdbDeviceTcp("127.0.0.1", self.port, default_transport_timeout_s=5)
        dev.connect(rsa_keys=[self.signer], auth_timeout_s=auth_timeout_s)
        self.addCleanup(dev.close)
        return dev

    def test_an_unknown_key_is_offered_and_allowed(self):
        self.start(prompt="accept")
        dev = self.connect()
        self.assertEqual(dev.shell("pm list packages -e --user 0"),
                         "package:com.google.android.tvlauncher\npackage:com.vendor.ads\n")
        with open(self.keys) as f:
            self.assertIn(self.pub.split()[0], f.read())

    def test_a_known_key_signs_in_without_a_prompt(self):
        self.start(prompt="ignore")
        with open(self.keys, "w") as f:
            f.write(self.pub.strip() + "\n")
        self.assertIn("package:com.vendor.ads", self.connect().shell("pm list packages"))

    def test_nobody_at_the_tv(self):
        self.start(prompt="ignore")
        with self.assertRaises(Exception):
            self.connect(auth_timeout_s=1)

    def test_long_output_arrives_whole(self):
        self.start(prompt="accept", installed=[f"com.vendor.app{i:05d}" for i in range(20000)])
        out = self.connect().shell("pm list packages")
        self.assertEqual(out.count("\n"), 20000)


if __name__ == "__main__":
    unittest.main()
