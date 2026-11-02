"""Checks launcher configs with upstream cleanyourtv's own rules: every key must be one the Keys table in
themes/README.md lists, and every value one the launcher's Config.java would keep (tools/manage.py value_as:
the right JSON type, numbers inside the table's range). kantv_* keys are KanTV launcher extensions and are
skipped here. Reads a JSON array of configs on stdin, prints a JSON array of error lists.

    python3 testing/upstream_theme_check.py <upstream checkout> < configs.json
"""
import json
import sys

upstream = sys.argv[1]
sys.path.insert(0, f"{upstream}/tools")
import manage  # noqa: E402  (upstream's module, unmodified)

table = {item["id"]: item for item in manage.switches()}
results = []
for config in json.load(sys.stdin):
    errors = []
    for key, value in config.items():
        if key.startswith("kantv_"):
            continue
        item = table.get(key)
        if item is None:
            errors.append(f"{key}: not a key the upstream launcher reads")
            continue
        try:
            kept = manage.value_as(key, item, json.dumps(value))
        except SystemExit as e:
            errors.append(f"{key}: {e}")
            continue
        if isinstance(value, bool) != isinstance(kept, bool):
            errors.append(f"{key}: {value!r} would be read as {kept!r}")
    results.append(errors)
print(json.dumps(results))
