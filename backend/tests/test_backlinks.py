"""Tests for backlinks, tags, suggest-title, and project capture type."""
import pytest
from fastapi.testclient import TestClient

TEST_USER = "test-user-001"
AUTH_HEADERS = {"x-user-id": TEST_USER}


@pytest.fixture
def client(tmp_db):
    from app.main import app
    return TestClient(app, headers=AUTH_HEADERS)


# ─── Backlinks ────────────────────────────────────────────────────────────────

class TestBacklinks:
    def test_no_backlinks_when_no_tags(self, client, tmp_db):
        """Capture with no tags has no backlinks."""
        cap_id = tmp_db.save_capture("to_cook", "persist", "idea", "Lonely Idea", {}, user_id=TEST_USER)
        resp = client.get(f"/captures/{cap_id}/backlinks")
        assert resp.status_code == 200
        assert resp.json()["backlinks"] == []

    def test_backlinks_by_shared_tag(self, client, tmp_db):
        """Two captures sharing a tag are backlinks of each other."""
        a = tmp_db.save_capture("to_learn", "absorb", "book", "Book A", {"tags": ["reading"]}, user_id=TEST_USER)
        b = tmp_db.save_capture("to_learn", "absorb", "book2", "Book B", {"tags": ["reading"]}, user_id=TEST_USER)
        # A's backlinks should include B
        resp = client.get(f"/captures/{a}/backlinks")
        assert resp.status_code == 200
        ids = [bl["id"] for bl in resp.json()["backlinks"]]
        assert b in ids
        assert a not in ids  # no self-reference

    def test_backlinks_excludes_different_tags(self, client, tmp_db):
        """Captures with no overlapping tags are not backlinks."""
        a = tmp_db.save_capture("to_cook", "persist", "a", "Idea A", {"tags": ["cooking"]}, user_id=TEST_USER)
        b = tmp_db.save_capture("to_cook", "persist", "b", "Idea B", {"tags": ["finance"]}, user_id=TEST_USER)
        resp = client.get(f"/captures/{a}/backlinks")
        ids = [bl["id"] for bl in resp.json()["backlinks"]]
        assert b not in ids

    def test_backlinks_ordered_by_shared_tag_count(self, client, tmp_db):
        """Capture with more shared tags ranks higher."""
        a = tmp_db.save_capture("project", "archive", "a", "Project A", {"tags": ["tokyo", "travel", "2026"]}, user_id=TEST_USER)
        # b shares 2 tags, c shares 1
        b = tmp_db.save_capture("to_cook", "persist", "b", "Idea B", {"tags": ["tokyo", "travel"]}, user_id=TEST_USER)
        c = tmp_db.save_capture("to_learn", "absorb", "c", "Article C", {"tags": ["tokyo"]}, user_id=TEST_USER)
        resp = client.get(f"/captures/{a}/backlinks")
        backlinks = resp.json()["backlinks"]
        ids = [bl["id"] for bl in backlinks]
        assert ids[0] == b  # 2 shared tags first
        assert ids[1] == c  # 1 shared tag second

    def test_backlinks_legacy_topic_fallback(self, client, tmp_db):
        """Captures using legacy metadata.topic (no tags array) are still linked."""
        a = tmp_db.save_capture("to_learn", "absorb", "a", "A", {"topic": "machine-learning"}, user_id=TEST_USER)
        b = tmp_db.save_capture("to_learn", "absorb", "b", "B", {"topic": "machine-learning"}, user_id=TEST_USER)
        resp = client.get(f"/captures/{a}/backlinks")
        ids = [bl["id"] for bl in resp.json()["backlinks"]]
        assert b in ids

    def test_backlinks_not_found(self, client, tmp_db):
        resp = client.get("/captures/99999/backlinks")
        assert resp.status_code == 404


# ─── Tags endpoints ───────────────────────────────────────────────────────────

class TestTags:
    def test_get_all_tags_empty(self, client, tmp_db):
        resp = client.get("/captures/tags")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_all_tags_from_metadata(self, client, tmp_db):
        tmp_db.save_capture("to_learn", "absorb", "x", "X", {"tags": ["python", "ai"]}, user_id=TEST_USER)
        tmp_db.save_capture("to_cook", "persist", "y", "Y", {"tags": ["ai", "startups"]}, user_id=TEST_USER)
        resp = client.get("/captures/tags")
        tags = resp.json()
        assert "python" in tags
        assert "ai" in tags
        assert "startups" in tags

    def test_get_all_tags_deduped(self, client, tmp_db):
        """Same tag from multiple captures appears once."""
        tmp_db.save_capture("to_hit", "archive", "a", "A", {"tags": ["work"]}, user_id=TEST_USER)
        tmp_db.save_capture("to_hit", "archive", "b", "B", {"tags": ["work"]}, user_id=TEST_USER)
        tags = client.get("/captures/tags").json()
        assert tags.count("work") == 1

    def test_patch_capture_tags(self, client, tmp_db):
        cap_id = tmp_db.save_capture("to_cook", "persist", "idea", "An Idea", {}, user_id=TEST_USER)
        resp = client.patch(f"/captures/{cap_id}/tags", json={"tags": ["startup", "saas"]})
        assert resp.status_code == 200
        from app.storage import db as _db
        cap = _db.get_capture(cap_id, user_id=TEST_USER)
        assert cap["metadata"]["tags"] == ["startup", "saas"]
        assert cap["metadata"]["topic"] == "startup"  # backward compat

    def test_patch_tags_empty_array(self, client, tmp_db):
        cap_id = tmp_db.save_capture("to_cook", "persist", "idea", "Idea", {"tags": ["old"]}, user_id=TEST_USER)
        resp = client.patch(f"/captures/{cap_id}/tags", json={"tags": []})
        assert resp.status_code == 200
        from app.storage import db as _db
        cap = _db.get_capture(cap_id, user_id=TEST_USER)
        assert cap["metadata"]["tags"] == []

    def test_get_captures_by_tag(self, client, tmp_db):
        tmp_db.save_capture("to_learn", "absorb", "x", "X", {"tags": ["philosophy"]}, user_id=TEST_USER)
        tmp_db.save_capture("to_cook", "persist", "y", "Y", {"tags": ["cooking"]}, user_id=TEST_USER)
        resp = client.get("/captures?topic=philosophy")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["summary"] == "X"

    def test_get_captures_by_legacy_topic(self, client, tmp_db):
        """?topic= also matches legacy metadata.topic field."""
        tmp_db.save_capture("to_learn", "absorb", "leg", "Legacy", {"topic": "history"}, user_id=TEST_USER)
        resp = client.get("/captures?topic=history")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ─── Suggest title ────────────────────────────────────────────────────────────

class TestSuggestTitle:
    def test_suggest_title_not_found(self, client, tmp_db):
        resp = client.post("/captures/99999/suggest-title")
        assert resp.status_code == 404

    def test_suggest_title_returns_structure(self, client, tmp_db, monkeypatch):
        """suggest-title route returns {suggested, current} without calling Claude."""
        cap_id = tmp_db.save_capture(
            "to_learn", "absorb",
            "This is a long piece of content about machine learning fundamentals.",
            "ML Article",
            {"tags": ["ai"]},
            user_id=TEST_USER,
        )

        from unittest.mock import AsyncMock, MagicMock
        from app.routes import captures as captures_mod

        fake_msg = MagicMock()
        fake_msg.content = [MagicMock(text="Machine Learning Fundamentals")]
        mock_create = AsyncMock(return_value=fake_msg)
        monkeypatch.setattr(captures_mod._anthropic.messages, "create", mock_create)

        resp = client.post(f"/captures/{cap_id}/suggest-title")
        assert resp.status_code == 200
        body = resp.json()
        assert "suggested" in body
        assert "current" in body
        assert body["current"] == "ML Article"
        assert body["suggested"] == "Machine Learning Fundamentals"


# ─── Project capture type ─────────────────────────────────────────────────────

class TestProjectType:
    def test_save_project_capture(self, tmp_db):
        cap_id = tmp_db.save_capture(
            "project", "archive",
            "Tokyo Travel Plan 2026",
            "Tokyo 2026",
            {"tags": ["tokyo", "travel"], "status": "planning"},
            user_id=TEST_USER,
        )
        from app.storage import db as _db
        cap = _db.get_capture(cap_id, user_id=TEST_USER)
        assert cap["capture_type"] == "project"
        assert cap["completion_type"] == "archive"
        assert cap["metadata"]["tags"] == ["tokyo", "travel"]

    def test_project_type_valid_in_api(self, client, tmp_db):
        cap_id = tmp_db.save_capture("project", "archive", "plan", "My Project", {}, user_id=TEST_USER)
        resp = client.patch(f"/captures/{cap_id}/type", json={"capture_type": "project"})
        assert resp.status_code == 200

    def test_project_appears_in_todos_view(self, client, tmp_db):
        """Projects appear in the todos view (not calendar-only)."""
        tmp_db.save_capture("project", "archive", "plan", "Big Project", {}, user_id=TEST_USER)
        resp = client.get("/captures?view=todos")
        types = {c["capture_type"] for c in resp.json()}
        assert "project" in types

    def test_project_does_not_appear_in_calendar_view(self, client, tmp_db):
        tmp_db.save_capture("project", "archive", "plan", "Big Project", {}, user_id=TEST_USER)
        resp = client.get("/captures?view=calendar")
        types = {c["capture_type"] for c in resp.json()}
        assert "project" not in types


# ─── Title propagation (summary sync) ────────────────────────────────────────

class TestTitlePropagation:
    def test_patch_summary_updates_summary_field(self, client, tmp_db):
        cap_id = tmp_db.save_capture("to_learn", "absorb", "notes", "Old Title", {}, user_id=TEST_USER)
        resp = client.patch(f"/captures/{cap_id}/summary", json={"summary": "New Title"})
        assert resp.status_code == 200
        from app.storage import db as _db
        cap = _db.get_capture(cap_id, user_id=TEST_USER)
        assert cap["summary"] == "New Title"

    def test_patch_notes_stores_html(self, client, tmp_db):
        """Patching notes persists the HTML content."""
        cap_id = tmp_db.save_capture("to_cook", "persist", "notes", "Old Title", {}, user_id=TEST_USER)
        html = "<h1>Old Title</h1><p>some content</p>"
        resp = client.patch(f"/captures/{cap_id}/notes", json={"notes": html})
        assert resp.status_code == 200
        from app.storage import db as _db
        cap = _db.get_capture(cap_id, user_id=TEST_USER)
        assert cap["notes"] == html

    def test_patch_summary_and_notes_independently(self, client, tmp_db):
        """Summary and notes can be updated independently (frontend syncs them together)."""
        cap_id = tmp_db.save_capture("to_learn", "absorb", "content", "Original Title", {}, user_id=TEST_USER)
        client.patch(f"/captures/{cap_id}/notes", json={"notes": "<h1>New Title</h1><p>body</p>"})
        client.patch(f"/captures/{cap_id}/summary", json={"summary": "New Title"})
        from app.storage import db as _db
        cap = _db.get_capture(cap_id, user_id=TEST_USER)
        assert cap["summary"] == "New Title"
        assert "<h1>New Title</h1>" in cap["notes"]
