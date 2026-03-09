# 🌐 Internet Stability Tracker

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Python](https://img.shields.io/badge/python-3.9+-blue.svg)
![React](https://img.shields.io/badge/react-18.2-blue.svg)

**A Community-Driven Network Monitoring Platform**

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 📖 About

Internet Stability Tracker is a real-time network monitoring system that automatically measures internet speed, detects outages, and visualizes network performance across different locations and ISPs. Built for communities to gain transparency into their local network infrastructure.

### 🎯 Problem It Solves

Many people experience unstable internet connections but lack concrete data to:
- Identify patterns in network outages
- Compare ISP performance objectively
- Report issues with evidence
- Make informed decisions about internet providers

### ✨ Why It's Unique

- **Local Intelligence**: Community-driven data collection for hyperlocal insights
- **Real-Time Monitoring**: Automated speed tests every 5 minutes
- **Visual Analytics**: Interactive maps and charts for easy understanding
- **ISP Transparency**: Objective performance comparisons
- **Open Source**: Free and customizable for any community

---

## 🚀 Features

### Core Functionality

| Feature | Description |
|---------|-------------|
| ⚡ **Automated Speed Tests** | Runs every 5 minutes using speedtest-cli |
| 🗺️ **Outage Map** | Real-time visualization of network issues on interactive maps |
| 📊 **ISP Comparison** | Side-by-side performance metrics for different providers |
| 🚨 **Outage Detection** | Automatic identification of connection failures |
| 📈 **Historical Tracking** | View speed trends over time with interactive charts |
| 👥 **Community Reports** | User-submitted network issues and observations |
| 📱 **Responsive Dashboard** | Works seamlessly on desktop and mobile devices |
| 🔔 **Alert System** | Notifications when internet goes down (coming soon) |

---

## 🛠️ Tech Stack

### Backend
- **FastAPI** - Modern, fast Python web framework
- **PostgreSQL** - Robust relational database
- **SQLAlchemy** - SQL toolkit and ORM
- **APScheduler** - Background task scheduling
- **speedtest-cli** - Network speed measurement
- **Uvicorn** - ASGI server

### Frontend
- **React 18** - UI library
- **React Router** - Navigation
- **Leaflet** - Interactive maps
- **Recharts** - Data visualization
- **Axios** - HTTP client

### DevOps
- **Docker & Docker Compose** - Containerization
- **Alembic** - Database migrations
- **Git** - Version control

---

## 🚀 Quick Start

### Prerequisites

- **Docker Desktop** (recommended) OR
- Python 3.9+, Node.js 16+, PostgreSQL 14+

### Option 1: Docker (Recommended) 🐳

```bash
# Clone the repository
git clone <your-repo-url>
cd "Internet Stability Tracker"

# Start all services
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Option 2: Manual Setup

#### 1️⃣ Database Setup

```bash
# Using Docker
docker-compose up -d postgres

# OR install PostgreSQL locally and create database
createdb internet_tracker
```

#### 2️⃣ Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env with your database credentials

# Run the application
python run.py
```

Backend will be available at `http://localhost:8000`

#### 3️⃣ Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

Frontend will open at `http://localhost:3000`

---

## 📁 Project Structure

```
Internet Stability Tracker/
├── 📂 backend/
│   ├── 📂 app/
│   │   ├── 📂 api/
│   │   │   ├── __init__.py
│   │   │   └── routes.py          # API endpoints
│   │   ├── 📂 core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py          # Configuration management
│   │   │   └── database.py        # Database connection
│   │   ├── 📂 models/
│   │   │   ├── __init__.py
│   │   │   └── measurement.py     # Database models
│   │   ├── 📂 services/
│   │   │   ├── __init__.py
│   │   │   └── speed_test.py      # Speed test logic
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI application
│   │   └── scheduler.py           # Background tasks
│   ├── 📂 tests/
│   ├── .env.example
│   ├── .gitignore
│   ├── Dockerfile
│   ├── requirements.txt
│   └── run.py                     # Application entry point
├── 📂 frontend/
│   ├── 📂 public/
│   │   └── index.html
│   ├── 📂 src/
│   │   ├── 📂 components/
│   │   │   ├── Dashboard.js       # Main dashboard
│   │   │   ├── Dashboard.css
│   │   │   ├── OutageMap.js       # Map visualization
│   │   │   └── OutageMap.css
│   │   ├── 📂 services/
│   │   │   └── api.js             # API client
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   ├── .gitignore
│   ├── Dockerfile
│   └── package.json
├── .gitignore
├── docker-compose.yml
├── README.md
└── SETUP.md
```

---

## 🔌 API Endpoints

### Measurements

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/measurements` | Get all measurements (paginated) |
| GET | `/api/measurements/recent?hours=24` | Get recent measurements |
| POST | `/api/test-now` | Run speed test immediately |

### Outages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/outages` | Get detected outages |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/isp-comparison` | Compare ISP performance |

### Community

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/reports` | Submit community report |

**Interactive API Documentation**: Visit `http://localhost:8000/docs` when running

---

## 🎨 Screenshots

### Dashboard
View real-time speed metrics, historical trends, and ISP comparisons

### Outage Map
Interactive map showing network issues across different locations

### ISP Comparison
Side-by-side performance analysis of internet service providers

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Database
DATABASE_URL=postgresql://tracker_user:tracker_pass@localhost:5432/internet_tracker

# Security
SECRET_KEY=your-secret-key-change-this-in-production

# Application
ENVIRONMENT=development
SPEED_TEST_INTERVAL=300  # seconds (5 minutes)

# Optional: Location
DEFAULT_LOCATION=Your City
DEFAULT_LATITUDE=0.0
DEFAULT_LONGITUDE=0.0
```

### Customization

- **Test Interval**: Adjust `SPEED_TEST_INTERVAL` in `.env` (default: 300 seconds)
- **Outage Threshold**: Modify threshold in `backend/app/services/speed_test.py`
- **Map Center**: Update default coordinates in `frontend/src/components/OutageMap.js`

---

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

---

## 📊 Database Schema

### SpeedMeasurement
- `id`: Primary key
- `timestamp`: Measurement time
- `download_speed`: Download speed (Mbps)
- `upload_speed`: Upload speed (Mbps)
- `ping`: Latency (ms)
- `isp`: Internet Service Provider
- `location`: Geographic location
- `latitude`, `longitude`: Coordinates
- `is_outage`: Outage flag

### CommunityReport
- `id`: Primary key
- `timestamp`: Report time
- `isp`: Internet Service Provider
- `location`: Geographic location
- `latitude`, `longitude`: Coordinates
- `issue_type`: Type of issue
- `description`: Detailed description

---

## 🚢 Deployment

### Docker Production

```bash
# Build and run
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f
```

### Manual Deployment

1. Set `ENVIRONMENT=production` in `.env`
2. Use production database credentials
3. Build frontend: `npm run build`
4. Serve with nginx or similar
5. Run backend with gunicorn: `gunicorn app.main:app`

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request to the `develop` branch

### Development Workflow

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `bugfix/*` - Bug fixes

---

## 🐛 Troubleshooting

### Database Connection Error
```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database
docker-compose restart postgres
```

### Speed Test Fails
- Ensure stable internet connection
- Some networks block speedtest servers
- Try running manually: `speedtest-cli`

### Frontend Can't Connect to Backend
- Verify backend is running on port 8000
- Check CORS settings in `backend/app/main.py`
- Ensure API_BASE_URL in `frontend/src/services/api.js` is correct

### Port Already in Use
```bash
# Windows - Find and kill process
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:8000 | xargs kill -9
```

---


## 🙏 Acknowledgments

- [speedtest-cli](https://github.com/sivel/speedtest-cli) - Speed testing library
- [Leaflet](https://leafletjs.com/) - Interactive maps
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python framework
- [React](https://react.dev/) - UI library

---

## 📧 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/internet-stability-tracker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/internet-stability-tracker/discussions)

---

<div align="center">

**Made with ❤️ for better internet transparency**

⭐ Star this repo if you find it useful!

</div>
