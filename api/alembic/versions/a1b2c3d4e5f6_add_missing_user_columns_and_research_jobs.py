"""add missing user columns and research_jobs table

Revision ID: a1b2c3d4e5f6
Revises: 76dca9bd8c88
Create Date: 2026-07-13 21:40:00.000000

Covers columns not in the initial migration (76dca9bd8c88):
- users: role, plan, tokens_reset_at, trial_started_at, trial_ends_at, is_active
- creates research_jobs table if missing
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '76dca9bd8c88'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_column_if_missing(table: str, column_name: str, column_type, **kwargs):
    """Add column only if it doesn't already exist (idempotent)."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = [c["name"] for c in inspector.get_columns(table)]
    if column_name not in existing:
        op.add_column(table, sa.Column(column_name, column_type, **kwargs))


def upgrade() -> None:
    # ── users: add missing columns ────────────────────────────────────────────
    _add_column_if_missing("users", "role",             sa.String(),  server_default="user",   nullable=True)
    _add_column_if_missing("users", "plan",             sa.String(),  server_default="active", nullable=True)
    _add_column_if_missing("users", "tokens_reset_at",  sa.DateTime(), nullable=True)
    _add_column_if_missing("users", "trial_started_at", sa.DateTime(), nullable=True)
    _add_column_if_missing("users", "trial_ends_at",    sa.DateTime(), nullable=True)
    _add_column_if_missing("users", "is_active",        sa.Boolean(), server_default="true",   nullable=True)

    # Backfill defaults for existing rows
    op.execute("UPDATE users SET role = 'user'   WHERE role IS NULL")
    op.execute("UPDATE users SET plan = 'active' WHERE plan IS NULL")
    op.execute("UPDATE users SET is_active = TRUE WHERE is_active IS NULL")

    # ── research_jobs: create if not exists ───────────────────────────────────
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "research_jobs" not in inspector.get_table_names():
        op.create_table(
            "research_jobs",
            sa.Column("id",            sa.String(),  primary_key=True),
            sa.Column("user_id",       sa.String(),  sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("status",        sa.String(),  server_default="generating_titles", index=True),
            sa.Column("step",          sa.Integer(), server_default="1"),
            sa.Column("pipeline_id",   sa.String(),  nullable=True, index=True),
            sa.Column("session_data",  sa.JSON(),    nullable=True),
            sa.Column("pipeline_data", sa.JSON(),    nullable=True),
            sa.Column("error",         sa.String(),  nullable=True),
            sa.Column("created_at",    sa.DateTime(), index=True),
            sa.Column("updated_at",    sa.DateTime()),
        )


def downgrade() -> None:
    op.drop_table("research_jobs")
    op.drop_column("users", "is_active")
    op.drop_column("users", "trial_ends_at")
    op.drop_column("users", "trial_started_at")
    op.drop_column("users", "tokens_reset_at")
    op.drop_column("users", "plan")
    op.drop_column("users", "role")
