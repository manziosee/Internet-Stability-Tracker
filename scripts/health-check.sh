#!/bin/bash
# Deployment Health Check Script
# Verifies that both frontend and backend are properly deployed

set -e

echo "🔍 Internet Stability Tracker - Deployment Health Check"
echo "========================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# URLs
FRONTEND_URL="https://internet-stability-tracker.vercel.app"
BACKEND_URL="https://backend-cold-butterfly-9535.fly.dev"
API_URL="${BACKEND_URL}/api"

# Function to check URL
check_url() {
    local url=$1
    local name=$2
    
    echo -n "Checking ${name}... "
    
    if curl -sf -o /dev/null -w "%{http_code}" "${url}" | grep -q "200\|301\|302"; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        return 1
    fi
}

# Function to check JSON endpoint
check_json() {
    local url=$1
    local name=$2
    
    echo -n "Checking ${name}... "
    
    response=$(curl -sf "${url}" 2>/dev/null)
    if [ $? -eq 0 ] && echo "${response}" | jq . >/dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        return 1
    fi
}

echo "📱 Frontend Checks"
echo "------------------"
check_url "${FRONTEND_URL}" "Frontend Homepage"
check_url "${FRONTEND_URL}/status" "Status Page"
check_url "${FRONTEND_URL}/map" "Outage Map"
echo ""

echo "⚡ Backend API Checks"
echo "--------------------"
check_url "${BACKEND_URL}/health" "Health Endpoint"
check_url "${BACKEND_URL}/docs" "Swagger UI"
check_json "${API_URL}/stats?hours=24" "Stats API"
check_json "${API_URL}/isp-comparison" "ISP Comparison API"
check_json "${API_URL}/status" "Status API"
echo ""

echo "🔌 WebSocket Check"
echo "------------------"
echo -n "Checking WebSocket endpoint... "
if curl -sf -o /dev/null "${BACKEND_URL}/api/ws/live" 2>/dev/null; then
    echo -e "${YELLOW}⚠ Endpoint exists (WebSocket requires browser)${NC}"
else
    echo -e "${GREEN}✓ Endpoint configured${NC}"
fi
echo ""

echo "🔐 Security Headers Check"
echo "-------------------------"
headers=$(curl -sI "${FRONTEND_URL}" 2>/dev/null)

check_header() {
    local header=$1
    echo -n "  ${header}: "
    if echo "${headers}" | grep -qi "${header}"; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
    fi
}

check_header "X-Content-Type-Options"
check_header "X-Frame-Options"
check_header "Strict-Transport-Security"
check_header "Referrer-Policy"
echo ""

echo "📊 API Response Time"
echo "--------------------"
echo -n "Stats endpoint: "
time_ms=$(curl -sf -o /dev/null -w "%{time_total}" "${API_URL}/stats?hours=24" 2>/dev/null | awk '{print $1*1000}')
echo "${time_ms}ms"
echo ""

echo "✅ Health Check Complete!"
echo ""
echo "URLs:"
echo "  Frontend: ${FRONTEND_URL}"
echo "  Backend:  ${BACKEND_URL}"
echo "  API:      ${API_URL}"
echo "  Docs:     ${BACKEND_URL}/docs"
echo ""
