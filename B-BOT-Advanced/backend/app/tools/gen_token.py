"""Generate a strong random token for B-BOT authentication."""

from __future__ import annotations

import secrets


def generate_token() -> str:
    return secrets.token_hex(32)


def main() -> None:
    print(generate_token())


if __name__ == "__main__":
    main()
