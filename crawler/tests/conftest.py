import asyncio
import socket
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError(
            "Network access is disabled in offline tests"
        )

    # Initialize the event loop before blocking connections.
    # Windows needs an internal localhost socket during this step.
    with asyncio.Runner() as runner:
        runner.get_loop()

        # Block connections for the entire test.
        with monkeypatch.context() as patch:
            patch.setattr(socket.socket, "connect", blocked)
            patch.setattr(socket.socket, "connect_ex", blocked)

            yield runner

        # Patches are restored before the runner closes.


@pytest.fixture
def saved_html():
    fixture_path = (
        Path(__file__).parent
        / "fixtures"
        / "geo_article.html"
    )

    return fixture_path.read_text(encoding="utf-8")