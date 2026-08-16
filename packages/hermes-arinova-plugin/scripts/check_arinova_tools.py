#!/usr/bin/env python3
"""Run the Arinova Hermes tool-wrapper contract suite."""

from __future__ import annotations

import asyncio

from check_arinova_tools_helpers import main


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
