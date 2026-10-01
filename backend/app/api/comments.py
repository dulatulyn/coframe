import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.db import utcnow
from app.deps import CurrentUser, Db
from app.models import Access, Comment, User
from app.permissions import load_diagram, not_found
from app.schemas.comments import CommentIn, CommentOut, CommentPatchIn
from app.services.common import public_user
from app.services.realtime import publish

router = APIRouter(tags=["comments"])

MAX_COMMENTS = 2000


def comment_out(comment: Comment) -> CommentOut:
    return CommentOut(
        id=comment.id,
        parent_id=comment.parent_id,
        element_id=comment.element_id,
        author=public_user(comment.author),
        body=comment.body,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        resolved_at=comment.resolved_at,
        resolved_by=public_user(comment.resolver),
    )


def forbidden() -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail="not_allowed")


@router.get("/diagrams/{diagram_id}/comments", response_model=list[CommentOut])
async def list_comments(diagram_id: uuid.UUID, user: CurrentUser, db: Db) -> list[CommentOut]:
    diagram, _, _ = await load_diagram(db, user, diagram_id)
    comments = (
        await db.scalars(
            select(Comment)
            .where(Comment.diagram_id == diagram.id)
            .order_by(Comment.created_at)
            .limit(MAX_COMMENTS)
        )
    ).all()
    return [comment_out(c) for c in comments]


@router.post(
    "/diagrams/{diagram_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED
)
async def add_comment(diagram_id: uuid.UUID, body: CommentIn, user: CurrentUser, db: Db) -> CommentOut:
    diagram, project, _ = await load_diagram(db, user, diagram_id)
    element_id = body.element_id
    if body.parent_id is not None:
        parent = await db.get(Comment, body.parent_id)
        if parent is None or parent.diagram_id != diagram.id or parent.parent_id is not None:
            raise not_found("comment_not_found")
        element_id = parent.element_id
        parent.resolved_at = None
        parent.resolved_by = None
    now = utcnow()
    comment = Comment(
        diagram_id=diagram.id,
        parent_id=body.parent_id,
        element_id=element_id,
        author_id=user.id,
        body=body.body.strip(),
        created_at=now,
        updated_at=now,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment, ["author", "resolver"])
    await publish(project.id, "comments")
    return comment_out(comment)


async def _load(db: Db, user: User, comment_id: uuid.UUID) -> tuple[Comment, bool, uuid.UUID]:
    comment = await db.get(Comment, comment_id)
    if comment is None:
        raise not_found("comment_not_found")
    _, project, access = await load_diagram(db, user, comment.diagram_id)
    return comment, access.access == Access.edit, project.id


@router.patch("/comments/{comment_id}", response_model=CommentOut)
async def update_comment(
    comment_id: uuid.UUID, body: CommentPatchIn, user: CurrentUser, db: Db
) -> CommentOut:
    comment, editor, project_id = await _load(db, user, comment_id)
    mine = comment.author_id == user.id
    if body.body is not None:
        if not mine:
            raise forbidden()
        comment.body = body.body.strip()
        comment.updated_at = utcnow()
    if body.resolved is not None:
        if comment.parent_id is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="only_threads_resolve")
        if not (mine or editor):
            raise forbidden()
        comment.resolved_at = utcnow() if body.resolved else None
        comment.resolved_by = user.id if body.resolved else None
    await db.commit()
    await db.refresh(comment, ["author", "resolver"])
    await publish(project_id, "comments")
    return comment_out(comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: uuid.UUID, user: CurrentUser, db: Db) -> Response:
    comment, editor, project_id = await _load(db, user, comment_id)
    if not (comment.author_id == user.id or editor):
        raise forbidden()
    await db.delete(comment)
    await db.commit()
    await publish(project_id, "comments")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
