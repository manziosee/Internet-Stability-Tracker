# Internet Stability Tracker

A community-driven platform for monitoring internet stability and speed across different locations.

## Features

- ⚡ Automatic speed tests every 5 minutes
- 🗺️ Real-time outage map visualization
- 📊 ISP performance comparison
- 📈 Historical speed tracking
- 🚨 Outage detection and alerts
- 👥 Community reporting system

## Tech Stack

**Backend:**
- FastAPI (Python)
- PostgreSQL
- SQLAlchemy
- APScheduler
- speedtest-cli

**Frontend:**
- React
- Leaflet (maps)
- Recharts (charts)
- Axios

## Setup Instructions

### Prerequisites
- Python 3.9+
- Node.js 16+
- PostgreSQL 14+

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
venv\Scripts\activate  # Windows
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env` file:
```bash
copy .env.example .env
```

5. Update `.env` with your database credentials:
```
DATABASE_URL=postgresql://user:password@localhost:5432/internet_tracker
SECRET_KEY=your-secret-key
SPEED_TEST_INTERVAL=300
```

6. Create database:
```sql
CREATE DATABASE internet_tracker;
```

7. Run the application:
```bash
uvicorn app.main:app --reload
```

API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm start
```

Application will open at `http://localhost:3000`

## API Endpoints

- `GET /api/measurements` - Get all measurements
- `GET /api/measurements/recent?hours=24` - Get recent measurements
- `GET /api/outages` - Get detected outages
- `GET /api/isp-comparison` - Compare ISP performance
- `POST /api/reports` - Submit community report
- `POST /api/test-now` - Run speed test immediately

## Project Structure

```
Internet Stability Tracker/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   ├── models/
│   │   │   └── measurement.py
│   │   ├── services/
│   │   │   └── speed_test.py
│   │   ├── main.py
│   │   └── scheduler.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/
    │   │   ├── Dashboard.js
    │   │   └── OutageMap.js
    │   ├── services/
    │   │   └── api.js
    │   ├── App.js
    │   └── index.js
    └── package.json
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
