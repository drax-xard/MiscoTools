from __future__ import annotations

from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


def test_frontend_is_served_with_security_headers(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "B-BOT" in response.text
    assert "Content-Security-Policy" in response.headers

    script = client.get("/app.js")
    assert script.status_code == 200
    assert "textContent" in script.text


def test_frontend_does_not_render_raw_html():
    script = (FRONTEND / "app.js").read_text(encoding="utf-8")
    assert "innerHTML" not in script
    assert "insertAdjacentHTML" not in script
    assert "document.write" not in script
