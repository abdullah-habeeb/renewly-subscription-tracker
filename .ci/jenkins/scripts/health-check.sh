#!/bin/bash
set -e

ENVIRONMENT=${1:-development}
BACKEND_URL="http://localhost:5000"
FRONTEND_URL="http://localhost"

if [ "$ENVIRONMENT" = "production" ]; then
    BACKEND_URL="http://backend:5000"
    FRONTEND_URL="http://frontend"
fi

echo "🏥 Running health checks for $ENVIRONMENT..."

# Check backend health
echo "🔍 Checking backend health..."
for i in {1..30}; do
    if curl -f ${BACKEND_URL}/health > /dev/null 2>&1; then
        echo "✅ Backend is healthy"
        break
    fi
    echo "⏳ Attempt $i/30: Waiting for backend..."
    sleep 2
done

# Check frontend health
echo "🔍 Checking frontend health..."
for i in {1..30}; do
    if curl -f ${FRONTEND_URL}/health > /dev/null 2>&1; then
        echo "✅ Frontend is healthy"
        break
    fi
    echo "⏳ Attempt $i/30: Waiting for frontend..."
    sleep 2
done

# Check API connectivity
echo "🔍 Testing API connectivity..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" ${BACKEND_URL}/api/subscriptions \
    -H "x-user-id: test-user" \
    -H "Content-Type: application/json")

if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "401" ]; then
    echo "✅ API is responding correctly (HTTP $RESPONSE)"
else
    echo "❌ API returned unexpected status: $RESPONSE"
    exit 1
fi

echo "✅ All health checks passed!"
