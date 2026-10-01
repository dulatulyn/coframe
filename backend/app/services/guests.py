import secrets
from datetime import timedelta

from sqlalchemy import delete, exists, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import utcnow
from app.models import (
    Diagram,
    Jam,
    JamParticipant,
    Project,
    Role,
    User,
    UserSession,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
)
from app.security import AVATAR_COLORS

GUEST_WORKSPACE = "Guest workspace"
GUEST_GRACE = timedelta(days=1)

ANIMALS = [
    "Axolotl",
    "Badger",
    "Beaver",
    "Bison",
    "Capybara",
    "Crane",
    "Dolphin",
    "Falcon",
    "Fox",
    "Gecko",
    "Hedgehog",
    "Heron",
    "Ibex",
    "Koala",
    "Lynx",
    "Marten",
    "Moose",
    "Narwhal",
    "Otter",
    "Panda",
    "Puffin",
    "Raccoon",
    "Squirrel",
    "Walrus",
]


def guest_name() -> str:
    return f"Anonymous {secrets.choice(ANIMALS)}"


async def create_guest(db: AsyncSession) -> User:
    user = User(
        email=None,
        name=guest_name(),
        password_hash=None,
        color=secrets.choice(AVATAR_COLORS),
        is_guest=True,
    )
    db.add(user)
    await db.flush()
    workspace = Workspace(name=GUEST_WORKSPACE, created_by=user.id)
    db.add(workspace)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=Role.owner))
    return user


async def rename_guest_workspaces(db: AsyncSession, user: User, name: str) -> None:
    await db.execute(
        update(Workspace)
        .where(Workspace.created_by == user.id, Workspace.name == GUEST_WORKSPACE)
        .values(name=name)
    )


async def absorb_guest(db: AsyncSession, guest: User, account: User) -> None:
    if guest.id == account.id or not guest.is_guest:
        return
    memberships = (await db.scalars(select(WorkspaceMember).where(WorkspaceMember.user_id == guest.id))).all()
    for member in memberships:
        own = await db.get(Workspace, member.workspace_id)
        if own is not None and own.created_by == guest.id:
            has_projects = await db.scalar(
                select(exists().where(Project.workspace_id == own.id, Project.deleted_at.is_(None)))
            )
            if not has_projects:
                await db.delete(own)
                continue
        await db.execute(
            insert(WorkspaceMember)
            .values(
                workspace_id=member.workspace_id, user_id=account.id, role=member.role, created_at=utcnow()
            )
            .on_conflict_do_nothing(index_elements=[WorkspaceMember.workspace_id, WorkspaceMember.user_id])
        )
    joined = select(JamParticipant).where(JamParticipant.user_id == guest.id)
    for participation in (await db.scalars(joined)).all():
        await db.execute(
            insert(JamParticipant)
            .values(jam_id=participation.jam_id, user_id=account.id, joined_at=participation.joined_at)
            .on_conflict_do_nothing(index_elements=[JamParticipant.jam_id, JamParticipant.user_id])
        )
    for column in (
        Workspace.created_by,
        Project.created_by,
        Diagram.created_by,
        Diagram.updated_by,
        WorkspaceInvite.created_by,
        Jam.host_id,
    ):
        await db.execute(update(column.class_).where(column == guest.id).values({column.key: account.id}))
    await db.delete(guest)


async def purge_guests(db: AsyncSession) -> int:
    now = utcnow()
    active = select(UserSession.id).where(UserSession.user_id == User.id, UserSession.expires_at > now)
    stale = (
        await db.scalars(
            select(User.id).where(User.is_guest, User.created_at < now - GUEST_GRACE, ~exists(active))
        )
    ).all()
    if not stale:
        return 0
    owned = (
        await db.scalars(select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id.in_(stale)))
    ).all()
    await db.execute(delete(User).where(User.id.in_(stale)))
    members = select(func.count()).where(WorkspaceMember.workspace_id == Workspace.id).scalar_subquery()
    await db.execute(delete(Workspace).where(Workspace.id.in_(owned), members == 0))
    await db.commit()
    return len(stale)
