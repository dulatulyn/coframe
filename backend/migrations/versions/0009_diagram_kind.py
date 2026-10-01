from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("diagrams", sa.Column("kind", sa.String(length=8), server_default="bpmn", nullable=False))


def downgrade() -> None:
    op.drop_column("diagrams", "kind")
