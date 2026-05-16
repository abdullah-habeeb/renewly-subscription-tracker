# 🎯 Subscription Tracker

A modern containerized subscription management system with **Docker + Jenkins CI/CD**.

---

## 📋 Quick Navigation

- [🚀 Quick Start](#-quick-start)
- [🏗️ Architecture](#-architecture)
- [💻 Development](#-development-setup)
- [🌍 Production](#-production-deployment)
- [🔄 CI/CD Pipeline](#-cicd-pipeline)
- [📡 API Reference](#-api-documentation)
- [🐳 Docker Guide](#-docker-commands)

---

## 🎯 Overview

The **Subscription Tracker** is a containerized web application for managing subscriptions, tracking costs, and viewing analytics with **Docker containerization** and **Jenkins CI/CD automation** as primary deployment mechanisms.

### ✨ Features

✅ **Containerized** - Docker-first architecture  
✅ **Subscription Management** - Add, edit, delete, track  
✅ **Spending Analytics** - Real-time reports & breakdowns  
✅ **Automated CI/CD** - Jenkins pipeline integration  
✅ **Environment Separation** - Dev, staging, production  
✅ **Multi-Service** - Backend API, Frontend, Database  
✅ **Health Monitoring** - Built-in health checks & smoke tests  
✅ **Production Ready** - Security, logging, monitoring  

---

## 🏗️ Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Node.js 22 + Express | REST API for subscriptions |
| **Frontend** | HTML/CSS/JS + Nginx | Static web interface |
| **Database** | PostgreSQL 15 | Data persistence |
| **Containers** | Docker | Application packaging |
| **Orchestration** | Docker Compose | Multi-container management |
| **CI/CD** | Jenkins | Automated testing & deployment |
| **SCM** | Git | Version control |

### Project Structure

```
subscription-tracker/
├── .ci/                              # CI/CD Configuration (PRIMARY)
│   ├── docker/
│   │   ├── Dockerfile.dev           # Development backend
│   │   ├── Dockerfile.prod          # Production backend
│   │   ├── Dockerfile.frontend      # Frontend nginx
│   │   ├── nginx.conf               # Nginx config
│   │   └── .dockerignore
│   ├── jenkins/
│   │   ├── Jenkinsfile              # Pipeline definition
│   │   └── scripts/
│   │       ├── deploy.sh            # Deploy automation
│   │       ├── health-check.sh      # Health validation
│   │       ├── smoke-tests.sh       # Integration tests
│   │       └── rollback.sh          # Rollback procedures
│   └── environments/
│       ├── dev.env
│       ├── staging.env
│       └── prod.env
├── backend/                          # Express.js API
│   ├── src/
│   │   └── server.js                # Main API
│   ├── package.json
│   └── .dockerignore
├── frontend/                         # Static files
│   ├── index.html
│   ├── login.html
│   ├── style.css
│   └── js/
├── docker-compose.yml               # Dev orchestration
├── docker-compose.prod.yml          # Prod orchestration
├── Makefile                         # Command shortcuts (PRIMARY)
└── README.md                        # This file
```

---

## 🚀 Quick Start

### Prerequisites

```bash
✓ Docker & Docker Compose
✓ Make command-line tool
✓ Git
✓ Ports 80, 5000, 5432 available
```

### 1. Clone & Enter Directory

```bash
git clone <your-repo-url>
cd subscription-tracker
```

### 2. Start Development

```bash
make dev
```

This automatically:
- Builds all Docker images
- Starts backend, frontend, database
- Creates network & volumes
- Initializes database

### 3. Access Services

```
🌐 Frontend:  http://localhost
📡 Backend:   http://localhost:5000
🔍 Health:    http://localhost:5000/health
📊 Database:  localhost:5432 (devuser/devpass)
```

### 4. Verify Everything

```bash
make health-check
make smoke-tests
```

### 5. View Logs (in new terminal)

```bash
make logs
```

---

## 💻 Development Setup

### Available Commands

```bash
make help              # Show all available commands
make dev               # Start development environment
make prod              # Start production environment
make build             # Build all Docker images
make test              # Run backend tests
make lint              # Run linting
make health-check      # Validate services
make smoke-tests       # Run integration tests
make logs              # View live logs
make stop              # Stop all containers
make clean             # Remove all containers & volumes
make restart           # Restart services
make db-shell          # Access PostgreSQL shell
```

### Backend Development

```bash
# SSH into backend container
make backend-shell

# View backend logs
make backend-logs

# Run tests
make test

# Run linting
make lint
```

### Code Organization

**Backend** (`backend/src/server.js`):
- Express.js API server
- REST endpoints for subscriptions
- Health checks & error handling
- CORS & middleware setup

**Frontend** (`index.html`, `js/`):
- HTML/CSS/JS static files
- API integration
- User interface

---

## 🌍 Production Deployment

### Prerequisites

- [ ] Jenkins server running
- [ ] Docker registry access (Docker Hub, ECR, etc.)
- [ ] PostgreSQL server
- [ ] SSL certificates
- [ ] Domain name

### Setup Jenkins

**1. Create Pipeline Job**
- New Job → Pipeline
- Configure Git repository
- Set script path: `.ci/jenkins/Jenkinsfile`

**2. Add Credentials**

Go to Jenkins → Manage Jenkins → Credentials → Add:

| ID | Type | Example |
|---|---|---|
| `docker-registry-url` | Secret Text | `docker.io` |
| `docker-credentials` | Username/Password | Docker Hub login |
| `postgres-password` | Secret Text | DB password |

**3. Configure Environment** (`.ci/environments/prod.env`)

```bash
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:pass@prod-db.example.com:5432/subscription_tracker_prod
JWT_SECRET=your-secure-key
CORS_ORIGIN=https://subscriptiontracker.example.com
```

**4. Deploy**

```bash
git add .
git commit -m "Deploy to production"
git push origin main   # Triggers Jenkins automatically
```

Jenkins pipeline will:
1. Checkout code
2. Run tests & linting
3. Build Docker images
4. Scan for vulnerabilities
5. Push to registry
6. Deploy to production
7. Run health checks & smoke tests

---

## 🔄 CI/CD Pipeline

### Pipeline Flow

```
┌─────────────────────────┐
│  Git Push to Repository │
└────────────┬────────────┘
             │
      ┌──────▼──────────────────┐
      │ Jenkins Detects Change  │ (GitHub webhook)
      └──────┬──────────────────┘
             │
      ┌──────▼──────────────┐
      │ Checkout Code       │ Stage 1
      └──────┬──────────────┘
             │
      ┌──────▼──────────────────────┐
      │ Lint & Test Backend         │ Stage 2
      └──────┬──────────────────────┘
             │
      ┌──────▼──────────────────────┐
      │ Build Docker Images         │ Stage 3
      └──────┬──────────────────────┘
             │
      ┌──────▼──────────────────────┐
      │ Security Scan (Trivy)       │ Stage 4 (main branch only)
      └──────┬──────────────────────┘
             │
      ┌──────▼──────────────────────┐
      │ Push to Registry            │ Stage 5 (main branch only)
      └──────┬──────────────────────┘
             │
      ┌──────▼──────────────────────┐
      │ Deploy to Production        │ Stage 6 (main branch only)
      │ docker-compose up -d        │
      └──────┬──────────────────────┘
             │
      ┌──────▼──────────────────────┐
      │ Health Checks               │ Stage 7
      └──────┬──────────────────────┘
             │
      ┌──────▼──────────────────────┐
      │ Smoke Tests                 │ Stage 8
      └──────┬──────────────────────┘
             │
        ┌────▼─────────────────┐
        │  ✅ SUCCESS/❌ FAILURE │
        └──────────────────────┘
```

### Trigger Conditions

| Event | Action |
|-------|--------|
| Push to `develop/*` | Build & Test (no deploy) |
| Push to `staging/*` | Build & Test & Deploy to Staging |
| Push to `main` | Full pipeline including production |
| Every 5 minutes | Poll SCM as fallback |

---

## 📡 API Documentation

### Base URLs

```
Development:  http://localhost:5000
Production:   https://subscriptiontracker.example.com/api
```

### Authentication

All endpoints require `x-user-id` header:

```bash
curl -H "x-user-id: user-123" http://localhost:5000/api/subscriptions
```

### Endpoints

#### Health Check
```bash
GET /health
# Response: { "status": "healthy", "timestamp": "..." }
```

#### Get Subscriptions
```bash
GET /api/subscriptions
Headers: x-user-id: user-123
# Returns array of user's subscriptions
```

#### Create Subscription
```bash
POST /api/subscriptions
Headers: x-user-id: user-123, Content-Type: application/json
Body: {
  "name": "Netflix",
  "amount": 15.99,
  "category": "Entertainment",
  "billingCycle": "monthly",
  "nextDueDate": "2024-06-15"
}
```

#### Update Subscription
```bash
PUT /api/subscriptions/:id
Headers: x-user-id: user-123, Content-Type: application/json
Body: { "amount": 19.99 }
```

#### Delete Subscription
```bash
DELETE /api/subscriptions/:id
Headers: x-user-id: user-123
```

#### Get Spending Report
```bash
GET /api/spending-report
Headers: x-user-id: user-123
# Returns analytics: monthlyTotal, yearlyEquivalent, categoryBreakdown, etc.
```

---

## 🐳 Docker Commands

### Build Images

```bash
# Build all images
docker-compose build

# Build specific service
docker-compose build backend
docker-compose build frontend

# Rebuild without cache
docker-compose build --no-cache
```

### Run Services

```bash
# Start in foreground
docker-compose up

# Start in background
docker-compose up -d

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend

# Follow logs live
docker-compose logs -f
docker-compose logs -f backend
```

### Execute Commands

```bash
# Shell into container
docker-compose exec backend bash
docker-compose exec frontend sh

# Run specific command
docker-compose exec backend npm test
docker-compose exec backend npm run lint
```

### Useful Docker Utilities

```bash
# List containers
docker ps
docker ps -a

# View container details
docker inspect <container-id>

# Copy files
docker cp <container-id>:/app/file.txt ./

# Remove containers
docker rm <container-id>

# Remove images
docker rmi <image-id>

# Clean system
docker system prune -a -v
```

---

## 🔧 Troubleshooting

### Services Won't Start

**Port already in use:**
```bash
lsof -i :5000
kill -9 <PID>
```

**Docker daemon not running:**
```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker
```

### Database Issues

```bash
# Check PostgreSQL
docker ps | grep postgres

# Access database shell
make db-shell

# Reset database
make db-reset
```

### API Not Responding

```bash
# Check backend container
make backend-logs

# Manual health check
curl http://localhost:5000/health

# Check network
docker network ls
docker network inspect <network-name>
```

### Build Failures

```bash
# Rebuild without cache
docker-compose build --no-cache

# View detailed build output
docker-compose build --progress=plain backend
```

---

## 📚 Documentation Files

- `.ci/jenkins/Jenkinsfile` - Jenkins pipeline definition
- `.ci/docker/Dockerfile.*` - Docker image definitions
- `.ci/environments/*.env` - Environment configurations
- `.ci/jenkins/scripts/*.sh` - Deployment scripts

---

## 🤝 Git Workflow

```bash
# Clone repository
git clone <repo-url>
cd subscription-tracker

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes
# ...

# Commit
git add .
git commit -m "Add amazing feature"

# Push
git push origin feature/amazing-feature

# Create Pull Request on GitHub

# Merge to develop → Jenkins tests
# Merge to main → Full deployment pipeline
```

---

## 📄 License

MIT License

---

## 📞 Support

1. Check [Troubleshooting](#-troubleshooting) section
2. Review logs: `make logs`
3. Run health checks: `make health-check`
4. Check documentation in `.ci/` directory

---

**Status**: ✅ Docker First | ✅ Jenkins Automated | ✅ Production Ready  
**Last Updated**: May 15, 2026  
**Version**: 2.0.0 (Docker/Jenkins Restructured)
