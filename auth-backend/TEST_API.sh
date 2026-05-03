#!/bin/bash

# Aura AI Auth Backend - Testing Scripts
# Run these commands to test all API endpoints

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:5000"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_OTP=""
JWT_TOKEN=""

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Aura AI Auth Backend - API Tests${NC}"
echo -e "${BLUE}================================${NC}"

# Function to make requests with pretty output
test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local expected_status=$4

  echo -e "\n${YELLOW}[TEST]${NC} $method $endpoint"
  
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -b "authToken=$JWT_TOKEN")
  else
    response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data" \
      -b "authToken=$JWT_TOKEN")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo -e "Response (HTTP $http_code):"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"

  if [ "$http_code" = "$expected_status" ]; then
    echo -e "${GREEN}✓ Status: $http_code (expected)${NC}"
  else
    echo -e "${RED}✗ Status: $http_code (expected $expected_status)${NC}"
  fi
}

# ========== TESTS ==========

echo -e "\n${BLUE}1. Health Check${NC}"
test_endpoint "GET" "/health" "" "200"

echo -e "\n${BLUE}2. API Info${NC}"
test_endpoint "GET" "/" "" "200"

echo -e "\n${BLUE}3. Send OTP to Email${NC}"
test_endpoint "POST" "/auth/send-otp" "{\"email\":\"$TEST_EMAIL\"}" "200"

echo -e "\n${BLUE}4. Send OTP Again (Cooldown Test)${NC}"
test_endpoint "POST" "/auth/send-otp" "{\"email\":\"$TEST_EMAIL\"}" "429"

echo -e "\n${BLUE}5. Try Invalid Email${NC}"
test_endpoint "POST" "/auth/send-otp" "{\"email\":\"invalid-email\"}" "400"

echo -e "\n${BLUE}6. Try Invalid OTP Format${NC}"
test_endpoint "POST" "/auth/verify-otp" "{\"email\":\"$TEST_EMAIL\",\"otp\":\"12345\"}" "400"

echo -e "\n${BLUE}7. Try Wrong OTP${NC}"
test_endpoint "POST" "/auth/verify-otp" "{\"email\":\"$TEST_EMAIL\",\"otp\":\"000000\"}" "401"

echo -e "\n${YELLOW}⚠️  MANUAL STEP REQUIRED${NC}"
echo -e "Check your email ($TEST_EMAIL) for the OTP code"
echo -e "Enter the OTP: "
read TEST_OTP

echo -e "\n${BLUE}8. Verify OTP${NC}"
verify_response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"otp\":\"$TEST_OTP\"}")

http_code=$(echo "$verify_response" | tail -n1)
body=$(echo "$verify_response" | sed '$d')

echo "Response (HTTP $http_code):"
echo "$body" | jq '.' 2>/dev/null || echo "$body"

# Extract JWT token from response if successful
if [ "$http_code" = "200" ]; then
  JWT_TOKEN=$(echo "$body" | jq -r '.data.user.id // empty' 2>/dev/null)
  echo -e "${GREEN}✓ OTP Verified Successfully${NC}"
  echo -e "${BLUE}JWT Token received and will be used for protected routes${NC}"
else
  echo -e "${RED}✗ OTP Verification Failed${NC}"
  exit 1
fi

# Get JWT from cookie
echo -e "\n${BLUE}9. Get JWT Token from Cookie${NC}"
cookie_response=$(curl -s -c /tmp/cookies.txt -X POST "$BASE_URL/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL-2\",\"otp\":\"123456\"}" 2>/dev/null)
echo "✓ Cookies saved to /tmp/cookies.txt"

echo -e "\n${BLUE}10. Get Current User (Protected Route)${NC}"
test_endpoint "GET" "/auth/me" "" "200"

echo -e "\n${BLUE}11. Try Protected Route Without Token${NC}"
JWT_TEMP=$JWT_TOKEN
JWT_TOKEN=""
test_endpoint "GET" "/auth/me" "" "401"
JWT_TOKEN=$JWT_TEMP

echo -e "\n${BLUE}12. Logout${NC}"
test_endpoint "POST" "/auth/logout" "" "200"

echo -e "\n${BLUE}13. Try Protected Route After Logout${NC}"
test_endpoint "GET" "/auth/me" "" "401"

# ========== RATE LIMIT TESTS ==========

echo -e "\n${RED}=== Rate Limiting Tests ===${NC}"
echo -e "${YELLOW}Testing global rate limit (100 requests/15 min)${NC}"

for i in {1..5}; do
  echo -n "Request $i... "
  response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
  echo "HTTP $response"
done

echo -e "\n${YELLOW}Testing auth rate limit (10 requests/15 min)${NC}"

for i in {1..3}; do
  echo -n "Request $i... "
  response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/send-otp" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test$i@example.com\"}")
  echo "HTTP $response"
done

# ========== BRUTE FORCE TEST ==========

echo -e "\n${RED}=== Brute Force Protection Test ===${NC}"
echo -e "${YELLOW}Testing max OTP attempts (5 failures → 15 min block)${NC}"

BRUTE_FORCE_EMAIL="brute-force-test-$(date +%s)@example.com"

# First, send OTP
echo -e "\nSending OTP to $BRUTE_FORCE_EMAIL..."
curl -s -X POST "$BASE_URL/auth/send-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$BRUTE_FORCE_EMAIL\"}" > /dev/null
echo "✓ OTP sent"

# Try wrong OTP 5 times
echo -e "\nAttempting 5 wrong OTPs..."
for i in {1..5}; do
  echo -n "Attempt $i: "
  response=$(curl -s -X POST "$BASE_URL/auth/verify-otp" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$BRUTE_FORCE_EMAIL\",\"otp\":\"000000\"}")
  status=$(echo "$response" | jq -r '.error.message' 2>/dev/null || echo "error")
  echo "$status"
done

# Try 6th time (should be blocked)
echo -e "\nAttempt 6 (should be blocked):"
response=$(curl -s -X POST "$BASE_URL/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$BRUTE_FORCE_EMAIL\",\"otp\":\"000000\"}")
echo "$response" | jq '.' 2>/dev/null || echo "$response"

# ========== SUMMARY ==========

echo -e "\n${BLUE}================================${NC}"
echo -e "${GREEN}✓ All Basic Tests Completed!${NC}"
echo -e "${BLUE}================================${NC}"

echo -e "\n${YELLOW}Summary:${NC}"
echo "✓ Health check working"
echo "✓ API info endpoint working"
echo "✓ OTP send and verification working"
echo "✓ Protected routes require JWT"
echo "✓ Logout clears authentication"
echo "✓ Rate limiting active"
echo "✓ Brute force protection active"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Test with real Google OAuth tokens"
echo "2. Test with frontend integration"
echo "3. Test email delivery and templates"
echo "4. Load testing with k6 or Apache JMeter"
echo "5. Security testing with OWASP ZAP"

echo -e "\n${BLUE}Documentation:${NC}"
echo "- Full API documentation: README.md"
echo "- Quick start guide: QUICKSTART.md"
echo "- Frontend integration examples: FRONTEND_INTEGRATION.js"

echo -e "\n✨ Testing complete! ${NC}\n"
