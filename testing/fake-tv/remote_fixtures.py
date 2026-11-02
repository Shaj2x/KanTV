"""Reference bytes for the Android TV Remote protocol tests, from androidtvremote2's own protobuf classes.

    testing/venv/bin/python testing/fake-tv/remote_fixtures.py   -> JSON on stdout
"""
import hashlib
import json

from cryptography import x509
from androidtvremote2.certificate_generator import generate_selfsigned_cert
from androidtvremote2.polo_pb2 import OuterMessage, Options
from androidtvremote2.remotemessage_pb2 import RemoteMessage, RemoteImeObject, RemoteEditInfo, RemoteImeBatchEdit


def outer():
    m = OuterMessage()
    m.protocol_version = 2
    m.status = OuterMessage.Status.STATUS_OK
    return m


def hexs(m):
    return m.SerializeToString().hex()


out = {"phone": {}, "tv": {}}

# What the phone sends: built exactly as androidtvremote2's pairing.py and remote.py build them.
m = outer(); m.pairing_request.client_name = "KanTV"; m.pairing_request.service_name = "atvremote"
out["phone"]["pairingRequest"] = hexs(m)
m = outer(); m.options.preferred_role = Options.RoleType.ROLE_TYPE_INPUT
e = m.options.input_encodings.add(); e.type = Options.Encoding.ENCODING_TYPE_HEXADECIMAL; e.symbol_length = 6
out["phone"]["options"] = hexs(m)
m = outer(); m.configuration.client_role = Options.RoleType.ROLE_TYPE_INPUT
m.configuration.encoding.type = Options.Encoding.ENCODING_TYPE_HEXADECIMAL; m.configuration.encoding.symbol_length = 6
out["phone"]["configuration"] = hexs(m)
m = outer(); m.secret.secret = bytes(range(32))
out["phone"]["secret"] = hexs(m)

r = RemoteMessage(); r.remote_configure.code1 = 615
r.remote_configure.device_info.unknown1 = 1; r.remote_configure.device_info.unknown2 = "1"
r.remote_configure.device_info.package_name = "atvremote"; r.remote_configure.device_info.app_version = "1.0.0"
out["phone"]["configure615"] = hexs(r)
r = RemoteMessage(); r.remote_set_active.active = 615
out["phone"]["setActive615"] = hexs(r)
r = RemoteMessage(); r.remote_ping_response.val1 = 7
out["phone"]["pong7"] = hexs(r)
r = RemoteMessage(); r.remote_ping_response.val1 = 0
out["phone"]["pong0"] = hexs(r)
r = RemoteMessage(); r.remote_key_inject.key_code = 19; r.remote_key_inject.direction = 3
out["phone"]["keyUp"] = hexs(r)
r = RemoteMessage(); r.remote_app_link_launch_request.app_link = "https://www.netflix.com/title"
out["phone"]["appLink"] = hexs(r)
r = RemoteMessage()
r.remote_ime_batch_edit.CopyFrom(RemoteImeBatchEdit(ime_counter=3, field_counter=7, edit_info=[
    RemoteEditInfo(insert=1, text_field_status=RemoteImeObject(start=4, end=4, value="hello"))]))
out["phone"]["textHello"] = hexs(r)
r = RemoteMessage()
r.remote_ime_batch_edit.CopyFrom(RemoteImeBatchEdit(ime_counter=0, field_counter=0, edit_info=[
    RemoteEditInfo(insert=1, text_field_status=RemoteImeObject(start=0, end=0, value="x"))]))
out["phone"]["textXZero"] = hexs(r)

# What a TV sends.
m = outer(); m.pairing_request_ack.server_name = "Living room TV"; out["tv"]["pairingRequestAck"] = hexs(m)
m = outer(); m.options.preferred_role = Options.RoleType.ROLE_TYPE_INPUT
e = m.options.input_encodings.add(); e.type = Options.Encoding.ENCODING_TYPE_HEXADECIMAL; e.symbol_length = 6
out["tv"]["options"] = hexs(m)
m = outer(); m.configuration_ack.SetInParent(); out["tv"]["configurationAck"] = hexs(m)
m = outer(); m.secret_ack.secret = b"\x01"; out["tv"]["secretAck"] = hexs(m)
m = OuterMessage(); m.protocol_version = 2; m.status = OuterMessage.Status.STATUS_BAD_SECRET; out["tv"]["badSecret"] = hexs(m)
r = RemoteMessage(); r.remote_configure.code1 = 1023
r.remote_configure.device_info.model = "Chromecast"; r.remote_configure.device_info.vendor = "Google"
out["tv"]["configure"] = hexs(r)
r = RemoteMessage(); r.remote_set_active.SetInParent(); out["tv"]["setActive"] = hexs(r)
r = RemoteMessage(); r.remote_ping_request.val1 = 7; r.remote_ping_request.val2 = 1; out["tv"]["ping7"] = hexs(r)
r = RemoteMessage(); r.remote_start.started = True; out["tv"]["start"] = hexs(r)
r = RemoteMessage(); r.remote_ime_batch_edit.ime_counter = 3; r.remote_ime_batch_edit.field_counter = 7; out["tv"]["imeCounters"] = hexs(r)
r = RemoteMessage(); r.remote_ime_key_inject.app_info.app_package = "com.netflix.ninja"; out["tv"]["currentApp"] = hexs(r)
r = RemoteMessage(); r.remote_set_volume_level.volume_max = 100; r.remote_set_volume_level.volume_level = 23
out["tv"]["volume"] = hexs(r)

# Pairing secret over two real certificates, with a code whose first byte checks out.
certs = []
for host in ("phone", "tv"):
    cert_pem, _key = generate_selfsigned_cert(host)
    cert = x509.load_pem_x509_certificate(cert_pem)
    certs.append(cert)
def mod_exp(cert):
    n = cert.public_key().public_numbers()
    return n.n, n.e
(cn, ce), (sn, se) = mod_exp(certs[0]), mod_exp(certs[1])
h = hashlib.sha256()
h.update(bytes.fromhex(f"{cn:X}")); h.update(bytes.fromhex(f"0{ce:X}"))
h.update(bytes.fromhex(f"{sn:X}")); h.update(bytes.fromhex(f"0{se:X}"))
h.update(bytes.fromhex("A1B2"))
digest = h.digest()
from cryptography.hazmat.primitives.serialization import Encoding
out["pairing"] = {
    "clientCertDer": certs[0].public_bytes(Encoding.DER).hex(),
    "serverCertDer": certs[1].public_bytes(Encoding.DER).hex(),
    "clientModulus": f"{cn:x}", "clientExponent": ce, "serverModulus": f"{sn:x}", "serverExponent": se,
    "code": f"{digest[0]:02X}A1B2", "secret": digest.hex(),
}
print(json.dumps(out))
