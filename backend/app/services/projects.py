import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.bpmn.templates import new_decision_xml, new_diagram_xml
from app.db import utcnow
from app.models import Access, Diagram, Jam, JamParticipant, Project, Role, User, WorkspaceMember
from app.permissions import ProjectAccess, not_found, role_access
from app.schemas.jams import JamSummary
from app.schemas.projects import ProjectOut
from app.services.common import fetch_dict, public_user
from app.services.tree import next_diagram_position

DEFAULT_DIAGRAM_NAME = "Untitled diagram"
DEFAULT_DECISION_NAME = "Untitled decision"


def effective_access(
    role: Role | None, jam: Jam | None, user_id: uuid.UUID, participant: bool
) -> Access | None:
    best = role_access(role)
    joined = jam is not None and (jam.host_id == user_id or participant)
    if joined and (best is None or (best == Access.view and jam.access == Access.edit)):
        best = jam.access
    return best


async def active_jams(db: AsyncSession, project_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Jam]:
    if not project_ids:
        return {}
    jams = await db.scalars(
        select(Jam)
        .where(Jam.project_id.in_(project_ids), Jam.ended_at.is_(None), Jam.expires_at > utcnow())
        .order_by(Jam.created_at.desc())
    )
    current: dict[uuid.UUID, Jam] = {}
    for jam in jams:
        current.setdefault(jam.project_id, jam)
    return current


async def participant_counts(db: AsyncSession, jam_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not jam_ids:
        return {}
    return await fetch_dict(
        db,
        select(JamParticipant.jam_id, func.count())
        .where(JamParticipant.jam_id.in_(jam_ids))
        .group_by(JamParticipant.jam_id),
    )


def jam_summary(jam: Jam, participant_count: int) -> JamSummary:
    return JamSummary(
        code=jam.code,
        access=jam.access,
        host=public_user(jam.host),
        participant_count=participant_count,
        expires_at=jam.expires_at,
    )


async def projects_out(
    db: AsyncSession,
    user: User,
    projects: Sequence[Project],
    known: dict[uuid.UUID, ProjectAccess] | None = None,
) -> list[ProjectOut]:
    if not projects:
        return []
    ids = [p.id for p in projects]
    roles = await fetch_dict(
        db,
        select(WorkspaceMember.workspace_id, WorkspaceMember.role).where(
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.workspace_id.in_({p.workspace_id for p in projects}),
        ),
    )
    jams = await active_jams(db, ids)
    jam_ids = [jam.id for jam in jams.values()]
    counts = await participant_counts(db, jam_ids)
    joined: set[uuid.UUID] = set()
    if jam_ids:
        joined = set(
            await db.scalars(
                select(JamParticipant.jam_id).where(
                    JamParticipant.user_id == user.id, JamParticipant.jam_id.in_(jam_ids)
                )
            )
        )
    diagram_counts = await fetch_dict(
        db,
        select(Diagram.project_id, func.count())
        .where(Diagram.project_id.in_(ids), Diagram.deleted_at.is_(None))
        .group_by(Diagram.project_id),
    )
    previews = await fetch_dict(
        db,
        select(Diagram.project_id, Diagram.id)
        .where(Diagram.project_id.in_(ids), Diagram.deleted_at.is_(None))
        .ext(distinct_on(Diagram.project_id))
        .order_by(Diagram.project_id, Diagram.content_updated_at.desc(), Diagram.id),
    )

    result: list[ProjectOut] = []
    for project in projects:
        jam = jams.get(project.id)
        if known is not None and project.id in known:
            access: Access | None = known[project.id].access
            role = known[project.id].role
        else:
            role = roles.get(project.workspace_id)
            access = effective_access(role, jam, user.id, jam is not None and jam.id in joined)
        if access is None:
            continue
        result.append(
            ProjectOut(
                id=project.id,
                workspace_id=project.workspace_id,
                name=project.name,
                created_at=project.created_at,
                updated_at=project.updated_at,
                diagram_count=diagram_counts.get(project.id, 0),
                preview_diagram_id=previews.get(project.id),
                access=access,
                role=role,
                active_jam=jam_summary(jam, counts.get(jam.id, 0)) if jam is not None else None,
            )
        )
    return result


async def project_out(
    db: AsyncSession, user: User, project: Project, access: ProjectAccess | None = None
) -> ProjectOut:
    built = await projects_out(db, user, [project], {project.id: access} if access is not None else None)
    if not built:
        raise not_found("project_not_found")
    return built[0]


async def create_diagram(
    db: AsyncSession,
    project: Project,
    user: User,
    *,
    name: str = DEFAULT_DIAGRAM_NAME,
    folder_id: uuid.UUID | None = None,
    xml: str | None = None,
    kind: str = "bpmn",
    owner_id: uuid.UUID | None = None,
) -> Diagram:
    now = utcnow()
    diagram = Diagram(
        project_id=project.id,
        folder_id=folder_id,
        name=name,
        position=await next_diagram_position(db, project.id, folder_id),
        xml=xml if xml is not None else new_decision_xml(name) if kind == "dmn" else new_diagram_xml(),
        kind=kind,
        owner_id=owner_id,
        created_by=user.id,
        updated_by=user.id,
        updater=user,
        created_at=now,
        updated_at=now,
        content_updated_at=now,
    )
    db.add(diagram)
    project.updated_at = now
    return diagram
