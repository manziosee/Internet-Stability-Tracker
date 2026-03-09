# Initial migration

# Revision ID: 001
# Revises: 
# Create Date: 2024-01-01 00:00:00.000000

from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('speed_measurements',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('timestamp', sa.DateTime(), nullable=True),
    sa.Column('download_speed', sa.Float(), nullable=True),
    sa.Column('upload_speed', sa.Float(), nullable=True),
    sa.Column('ping', sa.Float(), nullable=True),
    sa.Column('isp', sa.String(), nullable=True),
    sa.Column('location', sa.String(), nullable=True),
    sa.Column('latitude', sa.Float(), nullable=True),
    sa.Column('longitude', sa.Float(), nullable=True),
    sa.Column('is_outage', sa.Boolean(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_speed_measurements_id'), 'speed_measurements', ['id'], unique=False)
    
    op.create_table('community_reports',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('timestamp', sa.DateTime(), nullable=True),
    sa.Column('isp', sa.String(), nullable=True),
    sa.Column('location', sa.String(), nullable=True),
    sa.Column('latitude', sa.Float(), nullable=True),
    sa.Column('longitude', sa.Float(), nullable=True),
    sa.Column('issue_type', sa.String(), nullable=True),
    sa.Column('description', sa.String(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_community_reports_id'), 'community_reports', ['id'], unique=False)

def downgrade():
    op.drop_index(op.f('ix_community_reports_id'), table_name='community_reports')
    op.drop_table('community_reports')
    op.drop_index(op.f('ix_speed_measurements_id'), table_name='speed_measurements')
    op.drop_table('speed_measurements')