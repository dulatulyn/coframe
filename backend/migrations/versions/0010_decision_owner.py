from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("diagrams", sa.Column("owner_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_diagrams_owner_id"), "diagrams", ["owner_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_diagrams_owner_id_diagrams"),
        "diagrams",
        "diagrams",
        ["owner_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_diagrams_owner_id_diagrams"), "diagrams", type_="foreignkey")
    op.drop_index(op.f("ix_diagrams_owner_id"), table_name="diagrams")
    op.drop_column("diagrams", "owner_id")
