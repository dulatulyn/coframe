from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import or_, select

from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Jam, JamParticipant, Project, WorkspaceMember
from app.schemas.projects import ProjectOut
from app.schemas.tree import RecentDiagram
from app.services.diagrams import recent_diagrams
from app.services.projects import projects_out

router = APIRouter(tags=["me"])


@router.get("/me/recent", response_model=list[RecentDiagram])
async def recent(
    user: CurrentUser, db: Db, limit: Annotated[int, Query(ge=1, le=50)] = 12
) -> list[RecentDiagram]:
    my_workspaces = select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == user.id)
    my_jams = select(JamParticipant.jam_id).where(JamParticipant.user_id == user.id)
    jam_projects = select(Jam.project_id).where(
        Jam.ended_at.is_(None),
        Jam.expires_at > utcnow(),
        or_(Jam.host_id == user.id, Jam.id.in_(my_jams)),
    )
    return await recent_diagrams(
        db,
        or_(Project.workspace_id.in_(my_workspaces), Project.id.in_(jam_projects)),
        limit=limit,
    )


@router.get("/me/jams", response_model=list[ProjectOut])
async def my_jams(user: CurrentUser, db: Db) -> list[ProjectOut]:
    my_workspaces = select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == user.id)
    rows = await db.scalars(
        select(Project)
        .join(Jam, Jam.project_id == Project.id)
        .join(JamParticipant, JamParticipant.jam_id == Jam.id)
        .where(
            JamParticipant.user_id == user.id,
            Jam.ended_at.is_(None),
            Jam.expires_at > utcnow(),
            Project.deleted_at.is_(None),
            Project.workspace_id.not_in(my_workspaces),
        )
        .order_by(JamParticipant.joined_at.desc())
    )
    projects = list({project.id: project for project in rows}.values())
    return await projects_out(db, user, projects)
