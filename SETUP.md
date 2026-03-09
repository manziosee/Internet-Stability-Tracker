# Setup Guide

## Quick Start with Docker

1. Clone the repository
2. Run `docker-compose up -d`
3. Access at http://localhost:3000

## Manual Setup

### Prerequisites
- Python 3.9+
- Node.js 16+
- PostgreSQL 14+

### Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your database credentials
alembic upgrade head
python run.py
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### Database Setup
```bash
createdb internet_tracker
# Or use Docker: docker-compose up -d postgres
```

## Environment Variables

Create `.env` in backend directory:
```
DATABASE_URL=postgresql://user:password@localhost:5432/internet_tracker
SECRET_KEY=your-secret-key
ENVIRONMENT=development
SPEED_TEST_INTERVAL=300
```