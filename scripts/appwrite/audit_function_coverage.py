#!/usr/bin/env python3
"""Fail when the website calls an RPC/Function missing from the Appwrite API."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src"
FUNCTION = ROOT / "appwrite" / "functions" / "overweel3d-api" / "src" / "main.js"


def main() -> int:
    rpc: set[str] = set()
    functions: set[str] = set()
    for path in list(SOURCE.rglob("*.ts")) + list(SOURCE.rglob("*.tsx")):
        text = path.read_text(encoding="utf-8")
        rpc.update(re.findall(r"\.rpc\(\s*[\"']([^\"']+)", text))
        functions.update(re.findall(r"functions\.invoke\(\s*[\"']([^\"']+)", text))
    backend = FUNCTION.read_text(encoding="utf-8")
    handled = set(re.findall(r"name\s*===\s*[\"']([^\"']+)", backend))
    missing_rpc = sorted(rpc - handled)
    missing_functions = sorted(functions - handled)
    print(json.dumps({
        "rpc": sorted(rpc),
        "functions": sorted(functions),
        "missing_rpc": missing_rpc,
        "missing_functions": missing_functions,
    }, ensure_ascii=False, indent=2))
    return 1 if missing_rpc or missing_functions else 0


if __name__ == "__main__":
    raise SystemExit(main())
