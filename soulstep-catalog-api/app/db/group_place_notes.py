import secrets

from sqlmodel import Session, and_, select

from app.db.models import GroupPlaceNote


def _generate_note_code() -> str:
    return "gpn_" + secrets.token_hex(8)


def create_note(
    group_code: str,
    place_code: str,
    user_code: str,
    text: str,
    session: Session,
) -> GroupPlaceNote:
    note = GroupPlaceNote(
        note_code=_generate_note_code(),
        group_code=group_code,
        place_code=place_code,
        user_code=user_code,
        text=text,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


def get_notes(group_code: str, place_code: str, session: Session) -> list[GroupPlaceNote]:
    statement = (
        select(GroupPlaceNote)
        .where(
            and_(
                GroupPlaceNote.group_code == group_code,
                GroupPlaceNote.place_code == place_code,
            )
        )
        .order_by(GroupPlaceNote.created_at.asc())
    )
    return session.exec(statement).all()


def get_note_by_code(note_code: str, session: Session) -> GroupPlaceNote | None:
    return session.exec(select(GroupPlaceNote).where(GroupPlaceNote.note_code == note_code)).first()


def delete_note(note_code: str, session: Session) -> bool:
    note = get_note_by_code(note_code, session)
    if not note:
        return False
    session.delete(note)
    session.commit()
    return True


def get_notes_bulk(
    group_code: str, place_codes: list[str], session: Session
) -> dict[str, list[GroupPlaceNote]]:
    """Batch-fetch notes for multiple places in a group."""
    if not place_codes:
        return {}
    statement = select(GroupPlaceNote).where(
        and_(
            GroupPlaceNote.group_code == group_code,
            GroupPlaceNote.place_code.in_(place_codes),
        )
    )
    notes = session.exec(statement).all()
    result: dict[str, list[GroupPlaceNote]] = {pc: [] for pc in place_codes}
    for note in notes:
        result[note.place_code].append(note)
    return result
