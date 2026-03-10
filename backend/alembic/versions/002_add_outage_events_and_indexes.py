# Add outage_events table, status column, and performance indexes
#
# Revision ID: 002
# Revises: 001
# Create Date: 2026-03-10 00:00:00.000000

from alembic import op
import sqlalchemy as sa

revision       = "002"
down_revision  = "001"
branch_labels  = None
depends_on     = None


def upgrade() -> None:
    # ── speed_measurements: add performance indexes ──────────────────────
    op.create_index("ix_speed_meas_timestamp", "speed_measurements", ["timestamp"])
    op.create_index("ix_speed_meas_isp",       "speed_measurements", ["isp"])
    op.create_index("ix_speed_meas_outage",    "speed_measurements", ["is_outage"])

    # ── community_reports: add status + indexes ───────────────────────────
    with op.batch_alter_table("community_reports") as batch_op:
        batch_op.add_column(
            sa.Column("status", sa.String(), nullable=False, server_default="pending")
        )
    op.create_index("ix_community_reports_timestamp", "community_reports", ["timestamp"])
    op.create_index("ix_community_reports_status",    "community_reports", ["status"])

    # ── outage_events: new table ──────────────────────────────────────────
    op.create_table(
        "outage_events",
        sa.Column("id",                sa.Integer(),  nullable=False),
        sa.Column("started_at",        sa.DateTime(), nullable=False),
        sa.Column("ended_at",          sa.DateTime(), nullable=True),
        sa.Column("isp",               sa.String(),   nullable=True),
        sa.Column("location",          sa.String(),   nullable=True),
        sa.Column("latitude",          sa.Float(),    nullable=True),
        sa.Column("longitude",         sa.Float(),    nullable=True),
        sa.Column("is_resolved",       sa.Boolean(),  nullable=False, server_default="0"),
        sa.Column("measurement_count", sa.Integer(),  nullable=True,  server_default="1"),
        sa.Column("avg_download",      sa.Float(),    nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_outage_events_id",          "outage_events", ["id"])
    op.create_index("ix_outage_events_started_at",  "outage_events", ["started_at"])
    op.create_index("ix_outage_events_isp",         "outage_events", ["isp"])
    op.create_index("ix_outage_events_is_resolved", "outage_events", ["is_resolved"])


def downgrade() -> None:
    # outage_events
    op.drop_index("ix_outage_events_is_resolved", table_name="outage_events")
    op.drop_index("ix_outage_events_isp",         table_name="outage_events")
    op.drop_index("ix_outage_events_started_at",  table_name="outage_events")
    op.drop_index("ix_outage_events_id",          table_name="outage_events")
    op.drop_table("outage_events")

    # community_reports
    op.drop_index("ix_community_reports_status",    table_name="community_reports")
    op.drop_index("ix_community_reports_timestamp", table_name="community_reports")
    with op.batch_alter_table("community_reports") as batch_op:
        batch_op.drop_column("status")

    # speed_measurements
    op.drop_index("ix_speed_meas_outage",    table_name="speed_measurements")
    op.drop_index("ix_speed_meas_isp",       table_name="speed_measurements")
    op.drop_index("ix_speed_meas_timestamp", table_name="speed_measurements")
