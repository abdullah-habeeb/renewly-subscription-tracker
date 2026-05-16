.PHONY: help build dev prod test lint clean deploy health-check logs stop

help:
	@echo "╔════════════════════════════════════════════════════════════╗"
	@echo "║     SUBSCRIPTION TRACKER - DOCKER & JENKINS COMMANDS       ║"
	@echo "╚════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "📦 BUILD COMMANDS:"
	@echo "  make build           Build all Docker images"
	@echo "  make build-backend   Build backend Docker image"
	@echo "  make build-frontend  Build frontend Docker image"
	@echo ""
	@echo "🚀 DEPLOYMENT COMMANDS:"
	@echo "  make dev             Start development environment (docker-compose.yml)"
	@echo "  make prod            Start production environment (docker-compose.prod.yml)"
	@echo "  make deploy ENV=dev  Deploy to environment (dev/staging/prod)"
	@echo ""
	@echo "🧪 TESTING COMMANDS:"
	@echo "  make test            Run backend tests"
	@echo "  make lint            Run linting checks"
	@echo "  make health-check    Run health checks"
	@echo "  make smoke-tests     Run smoke tests"
	@echo ""
	@echo "📊 UTILITIES:"
	@echo "  make logs            View container logs"
	@echo "  make ps              Show running containers"
	@echo "  make stop            Stop all containers"
	@echo "  make clean           Remove containers, volumes, and images"
	@echo "  make restart         Restart all services"
	@echo ""

# Build commands
build: build-backend build-frontend
	@echo "✅ All Docker images built successfully!"

build-backend:
	@echo "🐳 Building backend image..."
	@docker build -f .ci/docker/Dockerfile.prod -t subscription-tracker/backend:latest .

build-frontend:
	@echo "🐳 Building frontend image..."
	@docker build -f .ci/docker/Dockerfile.frontend -t subscription-tracker/frontend:latest .

# Deployment commands
dev:
	@echo "🚀 Starting development environment..."
	@docker-compose -f docker-compose.yml up -d
	@echo "✅ Development environment started!"
	@echo "📍 Frontend: http://localhost"
	@echo "📍 Backend: http://localhost:5000"
	@echo "📍 Database: localhost:5432"

prod:
	@echo "🚀 Starting production environment..."
	@docker-compose -f docker-compose.prod.yml up -d
	@echo "✅ Production environment started!"
	@echo "📍 Frontend: http://localhost"
	@echo "📍 Backend: http://localhost:5000"

deploy:
	@echo "🚀 Deploying to $(ENV) environment..."
	@bash .ci/jenkins/scripts/deploy.sh $(ENV)

# Testing commands
test:
	@echo "🧪 Running backend tests..."
	@cd backend && npm ci && npm run test

lint:
	@echo "🔍 Running linting checks..."
	@cd backend && npm ci && npm run lint

health-check:
	@echo "🏥 Running health checks..."
	@bash .ci/jenkins/scripts/health-check.sh development

smoke-tests:
	@echo "🧪 Running smoke tests..."
	@bash .ci/jenkins/scripts/smoke-tests.sh development

# Utility commands
logs:
	@docker-compose -f docker-compose.yml logs -f

logs-prod:
	@docker-compose -f docker-compose.prod.yml logs -f

ps:
	@docker-compose -f docker-compose.yml ps

ps-prod:
	@docker-compose -f docker-compose.prod.yml ps

stop:
	@echo "🛑 Stopping all containers..."
	@docker-compose -f docker-compose.yml down
	@echo "✅ Containers stopped!"

stop-prod:
	@echo "🛑 Stopping production containers..."
	@docker-compose -f docker-compose.prod.yml down
	@echo "✅ Production containers stopped!"

restart:
	@echo "🔄 Restarting services..."
	@make stop
	@make dev

clean:
	@echo "🧹 Cleaning up Docker resources..."
	@docker-compose -f docker-compose.yml down -v
	@docker-compose -f docker-compose.prod.yml down -v
	@docker system prune -f --volumes
	@echo "✅ Cleanup completed!"

# Backend-specific commands
backend-shell:
	@docker exec -it subscription-tracker-backend-dev sh

backend-logs:
	@docker logs -f subscription-tracker-backend-dev

# Database commands
db-shell:
	@docker exec -it subscription-tracker-postgres-dev psql -U devuser -d subscription_tracker_dev

db-reset:
	@echo "🔄 Resetting database..."
	@docker-compose -f docker-compose.yml down -v
	@docker-compose -f docker-compose.yml up -d postgres
	@echo "✅ Database reset!"

# Git and CI/CD commands
git-status:
	@git status

git-log:
	@git log --oneline -10

jenkins-info:
	@echo "📋 Jenkins Configuration:"
	@echo "Jenkinsfile location: .ci/jenkins/Jenkinsfile"
	@echo "Deployment scripts: .ci/jenkins/scripts/"
	@echo "Environment configs: .ci/environments/"
	@echo ""
	@echo "To setup Jenkins:"
	@echo "1. Create new Pipeline job in Jenkins"
	@echo "2. Point to this Git repository"
	@echo "3. Set script path to: .ci/jenkins/Jenkinsfile"
	@echo "4. Configure required credentials in Jenkins"
