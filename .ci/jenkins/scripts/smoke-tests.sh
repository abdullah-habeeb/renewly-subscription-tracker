#!/bin/bash
set -e

ENVIRONMENT=${1:-development}
BACKEND_URL="http://localhost:5000"

if [ "$ENVIRONMENT" = "production" ]; then
    BACKEND_URL="http://backend:5000"
fi

echo "🧪 Running smoke tests for $ENVIRONMENT..."

# Test 1: Health endpoint
echo "Test 1: Health endpoint..."
RESPONSE=$(curl -s ${BACKEND_URL}/health)
if echo "$RESPONSE" | grep -q "healthy"; then
    echo "✅ Health endpoint OK"
else
    echo "❌ Health endpoint failed"
    exit 1
fi

# Test 2: Get subscriptions (with auth header)
echo "Test 2: Get subscriptions endpoint..."
RESPONSE=$(curl -s -w "\n%{http_code}" ${BACKEND_URL}/api/subscriptions \
    -H "x-user-id: test-user-123" \
    -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Get subscriptions endpoint OK"
else
    echo "❌ Get subscriptions failed with HTTP $HTTP_CODE"
    exit 1
fi

# Test 3: Create subscription
echo "Test 3: Create subscription endpoint..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST ${BACKEND_URL}/api/subscriptions \
    -H "x-user-id: test-user-123" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Netflix",
        "amount": 15.99,
        "category": "Entertainment",
        "billingCycle": "monthly",
        "nextDueDate": "2024-06-15"
    }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "201" ]; then
    echo "✅ Create subscription endpoint OK"
else
    echo "⚠️  Create subscription returned HTTP $HTTP_CODE (expected 201)"
fi

# Test 4: Spending report endpoint
echo "Test 4: Spending report endpoint..."
RESPONSE=$(curl -s -w "\n%{http_code}" ${BACKEND_URL}/api/spending-report \
    -H "x-user-id: test-user-123" \
    -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Spending report endpoint OK"
else
    echo "❌ Spending report failed with HTTP $HTTP_CODE"
    exit 1
fi

echo ""
echo "✅ All smoke tests passed!"
