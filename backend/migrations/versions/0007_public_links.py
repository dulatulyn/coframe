from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("diagrams", sa.Column("public_token", sa.String(length=32), nullable=True))
    op.create_unique_constraint(op.f("uq_diagrams_public_token"), "diagrams", ["public_token"])


def downgrade() -> None:
    op.drop_constraint(op.f("uq_diagrams_public_token"), "diagrams", type_="unique")
    op.drop_column("diagrams", "public_token")
