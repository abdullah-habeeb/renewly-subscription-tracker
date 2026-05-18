# 🎯 Subscription Tracker

> A modern, production-ready subscription management system demonstrating enterprise-grade DevOps practices with **Docker containerization** and **Jenkins CI/CD automation**.

## 📖 What This Project Is About

**Subscription Tracker** is a full-stack web application that helps users manage and track their subscriptions (Netflix, Spotify, etc.). But more importantly, it demonstrates how professional software engineers build, package, and deploy applications in real-world scenarios.

### The Problem It Solves
Managing multiple subscriptions is chaotic:
- Forgotten recurring charges
- No visibility into monthly spending
- Missing renewal dates
- Duplicate subscriptions

### The Solution
A centralized dashboard where users can:
- ✅ Add and manage all subscriptions in one place
- 📊 View spending analytics and cost breakdowns
- 📅 Get reminded about upcoming billing dates
- 💰 Analyze monthly vs yearly costs

### Why This Tech Stack Matters
This project showcases **how real companies deploy applications**:
- **Docker** ensures consistency (works on any machine)
- **Jenkins** automates quality checks and deployment
- **Microservices** architecture scales independently
- **Git + CI/CD** enables safe, rapid deployments

---

## 🚀 Getting Started (5 Minutes)

### Step 1: Install Prerequisites

You need three things:

```bash
# Check if Docker is installed
docker --version

# Check if Docker Compose is installed  
docker-compose --version

# Check if Make is installed
make --version
```

**Don't have them?**
- **Docker**: https://docs.docker.com/get-docker/
- **Make**: 
  - Windows: `choco install make` (via Chocolatey)
  - Mac: `brew install make`
  - Linux: `sudo apt-get install make`

### Step 2: Clone and Setup

```bash
# Clone the repository
git clone https://github.com/abdullah-habeeb/subscription-tracker.git
cd subscription-tracker

# Start everything in one command
make dev
```

**What `make dev` does:**
1. Builds Docker images for backend, frontend, database
2. Creates isolated network for container communication
3. Starts all 3 services
4. Initializes the database
5. Waits for health checks

### Step 3: Access the Application

Open your browser and navigate to:

```
Frontend:      http://localhost
Backend API:   http://localhost:5000
Health Check:  http://localhost:5000/health
```

### Step 4: Verify Everything Works

```bash
# Run health checks
make health-check

# Run integration tests
make smoke-tests
```

**You're done!** The application is now running. 🎉

---

## 📊 Project Structure Explained

```
subscription-tracker/
│
├── 🐳 .ci/                          ← Docker & Jenkins Configs (CRITICAL)
│   ├── docker/
│   │   ├── Dockerfile.dev          # Development image (with nodemon hot-reload)
│   │   ├── Dockerfile.prod         # Production image (optimized)
│   │   ├── Dockerfile.frontend     # Nginx (serves frontend + proxies API)
│   │   └── nginx.conf              # Nginx routing & security config
│   │
│   ├── jenkins/
│   │   ├── Jenkinsfile             # Pipeline definition (6 automated stages)
│   │   └── scripts/
│   │       ├── deploy.sh           # Deployment automation
│   │       ├── health-check.sh     # Health verification
│   │       └── smoke-tests.sh      # Integration tests
│   │
│   └── environments/               # Environment configs
│       ├── dev.env                 # Development secrets
│       ├── staging.env             # Staging secrets
│       └── prod.env                # Production secrets
│
├── 🔧 backend/                      ← Express.js REST API
│   ├── src/
│   │   └── server.js               # Main API (subscription CRUD + analytics)
│   ├── package.json                # Node dependencies
│   └── package-lock.json
│
├── 🎨 (Root level static files)     ← Frontend (HTML/CSS/JS)
│   ├── index.html                  # Main dashboard
│   ├── login.html                  # Authentication
│   ├── style.css                   # Styling
│   ├── firebase-config.js          # Firebase setup
│   └── js/
│       ├── auth.js                 # Authentication logic
│       └── main.js                 # Dashboard logic
│
├── 🐳 docker-compose.yml           ← Development orchestration
├── 🐳 docker-compose.prod.yml      ← Production orchestration
├── 🔧 Makefile                     ← Command shortcuts (30+ commands)
├── 📋 README.md                    ← This file
└── 📄 Other configs                ← Firebase, rules, etc.
```

### Key Directories Explained

| Directory | Purpose | Key Takeaway |
|-----------|---------|--------------|
| `.ci/` | All CI/CD configs | This is where automation lives |
| `backend/` | Express.js API | Business logic & data operations |
| `(root)` | Frontend files | User interface & interactions |
| `.ci/docker/` | Docker configs | Defines how to package everything |
| `.ci/jenkins/` | Jenkins pipeline | Defines how to automate deployment |

---

## 🏗️ How It Actually Works

### The Three Containers (Docker)

Your application runs as **three separate, isolated containers**:

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR MACHINE                             │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐ │
│  │   Frontend       │  │   Backend        │  │  Database │ │
│  │   (Nginx)        │  │   (Express)      │  │ (Postgres)│ │
│  │   Port: 80       │  │   Port: 5000     │  │ Port: 5432│ │
│  │                  │  │                  │  │           │ │
│  │  Serves HTML,    │  │  REST API for    │  │  Stores  │ │
│  │  CSS, JS         │  │  subscriptions   │  │  data    │ │
│  │                  │  │                  │  │           │ │
│  │  Proxies /api/*  │──│  Reads/writes    │──│           │ │
│  │  to Backend      │  │  data            │  │           │ │
│  └──────────────────┘  └──────────────────┘  └──────────┘ │
│                                                             │
│  All connected via "app-network" (Docker bridge network)   │
└─────────────────────────────────────────────────────────────┘
```

### How Requests Flow

```
1. User clicks "Add Subscription" in browser
2. Browser sends: POST /api/subscriptions
3. Nginx (Frontend) receives it
4. Nginx proxies to: http://backend:5000/api/subscriptions
5. Express.js processes the request
6. Stores data in PostgreSQL
7. Returns response through Nginx to browser
8. Browser updates UI
```

### The Docker Compose Orchestration

```yaml
docker-compose.yml defines:
├── services:
│   ├── backend (Node.js Express on 5000)
│   ├── frontend (Nginx on 80)
│   └── postgres (Database on 5432)
├── networks:
│   └── app-network (connects all 3)
└── volumes:
    └── db_data (persists database)
```

When you run `make dev`:
1. Docker reads `docker-compose.yml`
2. Builds all images
3. Creates `app-network`
4. Starts all 3 containers
5. Services communicate by name (`backend`, `postgres`)

---

## 🤖 Jenkins CI/CD Pipeline

### How Jenkins Automates Everything

```
YOU PUSH CODE TO GITHUB
            ↓
GITHUB SENDS WEBHOOK
            ↓
JENKINS RECEIVES WEBHOOK
            ↓
JENKINS EXECUTES PIPELINE:
┌─────────────────────────────────────┐
│ Stage 1: SCM Checkout               │ ← Clone from GitHub
│ Stage 2: Code Analysis              │ ← Verify project structure
│ Stage 3: Build Verification         │ ← Check Dockerfiles exist
│ Stage 4: Security Scan              │ ← Scan for vulnerabilities
│ Stage 5: Artifact Staging           │ ← Prepare artifacts
│ Stage 6: Quality Metrics            │ ← Generate report
└─────────────────────────────────────┘
            ↓
JENKINS REPORTS SUCCESS/FAILURE
            ↓
(Optional) DEPLOY NEW VERSION
```

### The Jenkinsfile (`.ci/jenkins/Jenkinsfile`)

This file defines the **entire deployment process** in code:

```groovy
pipeline {
    agent any
    
    stages {
        stage('SCM Checkout') {
            steps {
                checkout scm  # Clone from GitHub
            }
        }
        
        stage('Code Analysis') {
            steps {
                sh 'find backend -name "*.js" | wc -l'  # Count files
            }
        }
        
        // ... 4 more stages ...
    }
}
```

**Key Benefits:**
- ✅ Automated on every push
- ✅ Consistent process every time
- ✅ No manual steps = no errors
- ✅ Full audit trail in Jenkins logs

---

## 📡 API Reference

### Available Endpoints

```bash
# GET /health
# Returns: {"status": "healthy", "timestamp": "..."}
curl http://localhost:5000/health

# GET /api/subscriptions
# Returns: Array of subscriptions for user
curl -H "x-user-id: user123" http://localhost:5000/api/subscriptions

# POST /api/subscriptions
# Creates new subscription
curl -X POST http://localhost:5000/api/subscriptions \
  -H "x-user-id: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Netflix",
    "amount": 499,
    "category": "Entertainment",
    "billingCycle": "monthly",
    "nextDueDate": "2026-05-21"
  }'

# PUT /api/subscriptions/:id
# Updates subscription
curl -X PUT http://localhost:5000/api/subscriptions/sub_123 \
  -H "x-user-id: user123" \
  -H "Content-Type: application/json" \
  -d '{"amount": 599}'

# DELETE /api/subscriptions/:id
# Deletes subscription
curl -X DELETE http://localhost:5000/api/subscriptions/sub_123 \
  -H "x-user-id: user123"

# GET /api/spending-report
# Returns spending analytics
curl -H "x-user-id: user123" http://localhost:5000/api/spending-report
```

---

## 🛠️ Common Commands

```bash
# ========== STARTING & STOPPING ==========
make dev                    # Start development environment
make prod                   # Start production environment
make stop                   # Stop all containers
make restart                # Restart services
make clean                  # Remove everything (containers + volumes)

# ========== MONITORING ==========
make health-check           # Verify all services healthy
make smoke-tests            # Run integration tests
make logs                   # View real-time logs
make backend-logs           # View backend logs only
make frontend-logs          # View frontend logs only
make db-logs                # View database logs only

# ========== DEVELOPMENT ==========
make backend-shell          # SSH into backend container
make frontend-shell         # SSH into frontend container
make db-shell               # PostgreSQL shell
make test                   # Run backend tests
make lint                   # Run code linting

# ========== DOCKER MANAGEMENT ==========
make build                  # Build all Docker images
make images                 # List all images
make ps                     # List running containers

# ========== DATABASE ==========
make db-reset               # Reset database
make db-migrate             # Run migrations

# ========== VIEWING CONFIG ==========
make config-dev             # Show dev environment config
make config-prod            # Show prod environment config
make dockerfile-backend     # Show backend Dockerfile
make jenkinsfile            # Show Jenkinsfile
```

To see all available commands:
```bash
make help
```

---

## 🔍 Troubleshooting

### Issue: Containers won't start

```bash
# Check Docker is running
docker ps

# Check for port conflicts
lsof -i :80    # Frontend
lsof -i :5000  # Backend
lsof -i :5432  # Database

# Free up ports and restart
make clean
make dev
```

### Issue: "Could not reach server"

```bash
# Verify backend is healthy
curl http://localhost:5000/health

# Check backend logs
make backend-logs

# Verify network connectivity
docker network ls
docker network inspect subscription-tracker_app-network
```

### Issue: Database connection errors

```bash
# Verify database is running
docker ps | grep postgres

# Access database shell
make db-shell

# Check database logs
make db-logs
```

### Issue: Jenkins can't access Docker

```bash
# Verify Jenkins can run Docker commands
docker exec jenkins docker ps

# Verify socket mount
docker inspect jenkins | grep Mounts
```

---

## 🎓 Learning Path

If you're new to these technologies, learn in this order:

1. **Docker Basics** (30 min)
   - `docker run`, `docker build`, `Dockerfile`
   - Understand containers vs VMs
   - Read: [Docker Official Tutorial](https://docs.docker.com/guides/getting-started/)

2. **Docker Compose** (30 min)
   - Multi-container orchestration
   - Networks and volumes
   - Study: `docker-compose.yml` in this repo

3. **Jenkins Basics** (1 hour)
   - Pipeline concepts
   - Stages and steps
   - Read: `Jenkinsfile` in this repo

4. **CI/CD Concepts** (1 hour)
   - Automated testing
   - Automated deployment
   - Why it matters for teams

5. **This Project** (2 hours)
   - How it all works together
   - Experiment with making changes

---

## 📚 File Reference

### Critical Files

| File | Purpose | Edit When |
|------|---------|-----------|
| `docker-compose.yml` | Dev environment | Changing services/ports |
| `.ci/docker/Dockerfile.prod` | Production backend | Changing dependencies |
| `.ci/docker/Dockerfile.frontend` | Frontend serving | Changing nginx config |
| `.ci/jenkins/Jenkinsfile` | CI/CD pipeline | Adding/removing stages |
| `backend/src/server.js` | API logic | Changing endpoints |
| `Makefile` | Commands | Adding new shortcuts |

### Configuration Files

| File | Purpose |
|------|---------|
| `.ci/environments/dev.env` | Development secrets |
| `.ci/environments/staging.env` | Staging secrets |
| `.ci/environments/prod.env` | Production secrets |
| `.ci/docker/nginx.conf` | Frontend routing rules |

---

## 🚀 Next Steps

After getting familiar with the project:

1. **Make a code change** in backend
   ```bash
   # Edit backend/src/server.js
   # Watch it hot-reload (nodemon)
   ```

2. **Commit and push** to GitHub
   ```bash
   git add .
   git commit -m "Add new feature"
   git push origin main
   ```

3. **Watch Jenkins pipeline** execute automatically
   - Go to: http://localhost:8080
   - See 6 stages execute
   - View build reports

4. **Deploy changes** in production
   ```bash
   make prod
   ```

---

## 📞 Support

### Getting Help

1. Check logs:
   ```bash
   make logs
   ```

2. Run health checks:
   ```bash
   make health-check
   ```

3. Check troubleshooting section above

4. Review container status:
   ```bash
   docker ps
   docker stats
   ```

---

## 📄 License

This project is for educational purposes.

---

## 🎯 Key Takeaways

**Why this project matters:**

✅ **Docker** = Consistency & Reproducibility  
✅ **Jenkins** = Automation & Quality Control  
✅ **Git + CI/CD** = Professional software engineering  
✅ **Microservices** = Scalable architecture  
✅ **This combination** = How real companies operate  

You now have a production-ready, enterprise-grade application. 🎉

---

**Last Updated**: May 2026  
**Status**: Production Ready ✅  
**Maintained By**: Abdullah
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
