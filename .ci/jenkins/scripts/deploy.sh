#!/bin/bash
set -e

ENVIRONMENT=${1:-development}
COMPOSE_FILE="docker-compose.yml"

if [ "$ENVIRONMENT" = "production" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
fi

echo "🚀 Deploying to $ENVIRONMENT environment..."
echo "📋 Using compose file: $COMPOSE_FILE"

# Load environment variables
if [ -f ".ci/environments/${ENVIRONMENT}.env" ]; then
    export $(cat .ci/environments/${ENVIRONMENT}.env | grep -v '^#' | xargs)
    echo "✅ Loaded environment variables from .ci/environments/${ENVIRONMENT}.env"
else
    echo "⚠️  Environment file not found: .ci/environments/${ENVIRONMENT}.env"
fi

# Pull latest images
echo "📥 Pulling latest images..."
docker-compose -f $COMPOSE_FILE pull || true

# Stop running containers
echo "🛑 Stopping running containers..."
docker-compose -f $COMPOSE_FILE down || true

# Remove unused volumes (optional)
echo "🧹 Cleaning up unused volumes..."
docker volume prune -f || true

# Start services
echo "▶️  Starting services..."
docker-compose -f $COMPOSE_FILE up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Display service status
echo "📊 Service status:"
docker-compose -f $COMPOSE_FILE ps

echo "✅ Deployment to $ENVIRONMENT completed successfully!"
echo "🌐 Access the application:"
echo "   - Frontend: http://localhost"
echo "   - Backend: http://localhost/api"
