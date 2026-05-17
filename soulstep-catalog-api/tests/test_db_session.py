"""Tests for DB session dependency behavior."""

from app.db.session import SessionDep


def test_session_dependency_closes_after_path_operation():
    """DB sessions should be released before response middleware sends the body."""
    depends = SessionDep.__metadata__[0]

    assert depends.scope == "function"
