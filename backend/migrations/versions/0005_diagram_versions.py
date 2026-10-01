from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("diagrams", sa.Column("generation", sa.Integer(), server_default="0", nullable=False))
    op.create_table(
        "diagram_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("diagram_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("xml", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["diagram_id"],
            ["diagrams.id"],
            name=op.f("fk_diagram_versions_diagram_id_diagrams"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_diagram_versions_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_diagram_versions")),
    )
    op.create_index(
        "ix_diagram_versions_diagram_created", "diagram_versions", ["diagram_id", "created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_diagram_versions_diagram_created", table_name="diagram_versions")
    op.drop_table("diagram_versions")
    op.drop_column("diagrams", "generation")
