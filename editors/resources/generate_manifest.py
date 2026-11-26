#!/usr/bin/env python3
"""Generate the static resource-library manifest for GitHub Pages.

The email editors request GET /mailchimp/api/resources and expect:
    {"ok": true, "total": N, "resources": [{"url", "name", "kind"}, ...]}

On a pure-static host there is no backend, so this script emits that JSON as a
plain static file (mailchimp/api/resources). Images are served from
/editors/resources/. Re-run this script after editing `library.txt` or adding
images.

Source of truth: editors/resources/library.txt
  - blank lines and lines starting with '#' are ignored
  - an entry is either a local filename (relative to this folder) or an
    absolute http(s) URL (used as-is)

Usage:
    python3 editors/resources/generate_manifest.py
"""
import json
import os
import re
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
LIBRARY = os.path.join(HERE, "library.txt")
OUT_DIR = os.path.join(REPO, "mailchimp", "api")
OUT_FILE = os.path.join(OUT_DIR, "resources")

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")
LOCAL_PREFIX = "/editors/resources/"


def kind_of(url):
    path = url.split("?")[0].split("#")[0].lower()
    return "image" if path.endswith(IMAGE_EXTS) else "file"


def name_of(url):
    path = url.split("?")[0].split("#")[0].rstrip("/")
    base = path.rsplit("/", 1)[-1]
    return urllib.parse.unquote(base) or url


def resolve(entry):
    if re.match(r"^https?://", entry, re.I):
        return entry, None
    # local file relative to this folder
    return LOCAL_PREFIX + entry.lstrip("./"), entry


def entries_from_library():
    items = []
    seen = set()
    with open(LIBRARY, encoding="utf-8") as fh:
        for raw in fh:
            entry = raw.strip()
            if not entry or entry.startswith("#"):
                continue
            url, local = resolve(entry)
            if url in seen:
                continue
            if local is not None and not os.path.exists(os.path.join(HERE, local)):
                print(f"warn: missing local file, skipped: {local}", file=sys.stderr)
                continue
            seen.add(url)
            items.append(url)
    return items


def entries_from_scan():
    items = []
    for fn in sorted(os.listdir(HERE)):
        if fn.lower().endswith(IMAGE_EXTS):
            items.append(LOCAL_PREFIX + fn)
    return items


def main():
    items = entries_from_library() if os.path.exists(LIBRARY) else entries_from_scan()
    resources = [{"url": u, "name": name_of(u), "kind": kind_of(u)} for u in items]
    payload = {
        "ok": True,
        "total": len(resources),
        "library_file": "editors/resources/library.txt",
        "resources": resources,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"wrote {OUT_FILE} ({len(resources)} resources)")


if __name__ == "__main__":
    main()
