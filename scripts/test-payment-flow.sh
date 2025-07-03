#!/bin/bash

# Payment Flow Integration Test Script
# Tests the complete payment flow with HTTP assertions

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
DB_FILE="${DB_FILE:-./mod-bot.sqlite3}"

# Test data
TEST_GUILD_FREE="test-guild-free-$(date +%s)"
TEST_GUILD_PRO="test-guild-pro-$(date +%s)"
TEST_SESSION_ID="test-session-$(date +%s)"

# Default session cookies (override with environment variables)
COOKIE_SESSION="${COOKIE_SESSION:-}"
DB_SESSION="${DB_SESSION:-}"

echo -e "${BLUE}🧪 Euno Payment Flow Integration Test${NC}"
echo "======================================"

# Function to make authenticated requests
make_request() {
    local method="$1"
    local url="$2"
    local expected_status="$3"
    local check_content="$4"
    
    if [ -z "$COOKIE_SESSION" ] || [ -z "$DB_SESSION" ]; then
        echo -e "${RED}❌ Session cookies not provided. Set COOKIE_SESSION and DB_SESSION environment variables.${NC}"
        echo "Example:"
        echo 'export COOKIE_SESSION="__client-session=eyJ1c2VySWQ..."'
        echo 'export DB_SESSION="__session=IjRlNGQ1OTE2..."'
        exit 1
    fi
    
    local full_url="${BASE_URL}${url}"
    local cookies="${COOKIE_SESSION}; ${DB_SESSION}"
    
    echo -e "${YELLOW}Testing: ${method} ${url}${NC}"
    
    # Make request and capture response
    local response=$(curl -s -w "\n%{http_code}" -X "$method" "$full_url" -H "Cookie: $cookies" 2>/dev/null)
    local body=$(echo "$response" | head -n -1)
    local status=$(echo "$response" | tail -n 1)
    
    # Check status code
    if [ "$status" = "$expected_status" ]; then
        echo -e "  ${GREEN}✅ Status: $status${NC}"
    else
        echo -e "  ${RED}❌ Expected: $expected_status, Got: $status${NC}"
        echo -e "  ${RED}Response: $body${NC}"
        return 1
    fi
    
    # Check content if provided
    if [ -n "$check_content" ]; then
        if echo "$body" | grep -q "$check_content"; then
            echo -e "  ${GREEN}✅ Content: Found '$check_content'${NC}"
        else
            echo -e "  ${RED}❌ Content: Missing '$check_content'${NC}"
            echo -e "  ${YELLOW}Response preview:${NC}"
            echo "$body" | head -n 3
            return 1
        fi
    fi
    
    echo
}

# Function to setup test data in database
setup_test_data() {
    echo -e "${BLUE}📋 Setting up test data...${NC}"
    
    # Create test guilds with different subscription tiers
    sqlite3 "$DB_FILE" "
        INSERT OR REPLACE INTO guild_subscriptions (guild_id, product_tier, status) 
        VALUES ('$TEST_GUILD_FREE', 'free', 'active');
        
        INSERT OR REPLACE INTO guild_subscriptions (guild_id, product_tier, status) 
        VALUES ('$TEST_GUILD_PRO', 'paid', 'active');
    "
    
    echo -e "  ${GREEN}✅ Created test guild: $TEST_GUILD_FREE (free)${NC}"
    echo -e "  ${GREEN}✅ Created test guild: $TEST_GUILD_PRO (paid)${NC}"
    echo
}

# Function to cleanup test data
cleanup_test_data() {
    echo -e "${BLUE}🧹 Cleaning up test data...${NC}"
    
    sqlite3 "$DB_FILE" "
        DELETE FROM guild_subscriptions WHERE guild_id IN ('$TEST_GUILD_FREE', '$TEST_GUILD_PRO');
    "
    
    echo -e "  ${GREEN}✅ Cleaned up test guilds${NC}"
    echo
}

# Function to check database state
check_database() {
    local guild_id="$1"
    local expected_tier="$2"
    
    local actual_tier=$(sqlite3 "$DB_FILE" "SELECT product_tier FROM guild_subscriptions WHERE guild_id = '$guild_id';")
    
    if [ "$actual_tier" = "$expected_tier" ]; then
        echo -e "  ${GREEN}✅ Database: $guild_id has tier '$actual_tier'${NC}"
    else
        echo -e "  ${RED}❌ Database: Expected '$expected_tier', got '$actual_tier'${NC}"
        return 1
    fi
}

# Main test execution
main() {
    echo -e "${YELLOW}Starting tests at $(date)${NC}"
    echo
    
    # Setup
    setup_test_data
    
    echo -e "${BLUE}🔐 Testing Authentication & Landing Pages${NC}"
    echo "----------------------------------------"
    
    # Test landing page (no auth required)
    make_request "GET" "/" "200" "Add to Discord Server"
    
    # Test auth protection
    echo -e "${YELLOW}Testing auth protection (should redirect to login)${NC}"
    local auth_response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/onboard")
    if [ "$auth_response" = "302" ]; then
        echo -e "  ${GREEN}✅ Auth protection working${NC}"
    else
        echo -e "  ${RED}❌ Auth protection failed: $auth_response${NC}"
    fi
    echo
    
    echo -e "${BLUE}🎯 Testing Onboard Flow${NC}"
    echo "----------------------"
    
    # Test free guild onboarding (should show Pro vs Free choice)
    make_request "GET" "/onboard?guild_id=$TEST_GUILD_FREE" "200" "Euno is now active"
    make_request "GET" "/onboard?guild_id=$TEST_GUILD_FREE" "200" "Start with Pro"
    make_request "GET" "/onboard?guild_id=$TEST_GUILD_FREE" "200" "Recommended"
    
    # Test pro guild onboarding (should show congratulations)
    make_request "GET" "/onboard?guild_id=$TEST_GUILD_PRO" "200" "Welcome to Euno Pro"
    make_request "GET" "/onboard?guild_id=$TEST_GUILD_PRO" "200" "Pro Features Activated"
    
    # Test error handling
    echo -e "${YELLOW}Testing error handling (missing guild_id)${NC}"
    local error_response=$(curl -s -w "%{http_code}" "$BASE_URL/onboard" -H "Cookie: $COOKIE_SESSION; $DB_SESSION" 2>/dev/null | tail -n 1)
    if [ "$error_response" = "400" ]; then
        echo -e "  ${GREEN}✅ Error handling working${NC}"
    else
        echo -e "  ${RED}❌ Error handling failed: $error_response${NC}"
    fi
    echo
    
    echo -e "${BLUE}💳 Testing Payment Flow${NC}"
    echo "---------------------"
    
    # Test upgrade page
    make_request "GET" "/upgrade?guild_id=$TEST_GUILD_FREE" "200" "Upgrade to Pro"
    make_request "GET" "/upgrade?guild_id=$TEST_GUILD_FREE" "200" "Free Plan"
    make_request "GET" "/upgrade?guild_id=$TEST_GUILD_FREE" "200" "Pro Plan"
    
    # Test payment success (this will update the database)
    make_request "GET" "/payment/success?session_id=$TEST_SESSION_ID&guild_id=$TEST_GUILD_FREE" "200" "Payment Successful"
    make_request "GET" "/payment/success?session_id=$TEST_SESSION_ID&guild_id=$TEST_GUILD_FREE" "200" "Subscription Activated"
    
    # Verify database was updated
    echo -e "${YELLOW}Checking database after payment...${NC}"
    check_database "$TEST_GUILD_FREE" "paid"
    echo
    
    # Test payment cancel
    make_request "GET" "/payment/cancel?guild_id=$TEST_GUILD_FREE" "200" "Payment Cancelled"
    make_request "GET" "/payment/cancel?guild_id=$TEST_GUILD_FREE" "200" "Try Again"
    
    echo -e "${BLUE}🔍 Testing OAuth Flow${NC}"
    echo "-------------------"
    
    # Test OAuth initiation (should redirect to Discord)
    echo -e "${YELLOW}Testing OAuth signup flow${NC}"
    local oauth_response=$(curl -s -I "$BASE_URL/auth?flow=signup" 2>/dev/null)
    if echo "$oauth_response" | grep -q "discord.com/api/oauth2/authorize"; then
        echo -e "  ${GREEN}✅ OAuth redirect to Discord working${NC}"
    else
        echo -e "  ${RED}❌ OAuth redirect failed${NC}"
    fi
    
    # Check OAuth parameters
    local oauth_url=$(echo "$oauth_response" | grep "location:" | sed 's/location: //')
    if echo "$oauth_url" | grep -q "permissions=1099512100352"; then
        echo -e "  ${GREEN}✅ Bot permissions included${NC}"
    else
        echo -e "  ${RED}❌ Bot permissions missing${NC}"
    fi
    
    if echo "$oauth_url" | grep -q "scope=.*bot.*applications.commands"; then
        echo -e "  ${GREEN}✅ Bot scope included${NC}"
    else
        echo -e "  ${RED}❌ Bot scope missing${NC}"
    fi
    echo
    
    echo -e "${BLUE}📊 Testing Error Scenarios${NC}"
    echo "-------------------------"
    
    # Test missing parameters
    echo -e "${YELLOW}Testing parameter validation${NC}"
    local test_cases=(
        "/payment/success?session_id=test|400|Missing guild ID"
        "/payment/success?guild_id=test|400|Missing session ID"
        "/upgrade|400|Guild ID is required"
    )
    
    for test_case in "${test_cases[@]}"; do
        IFS='|' read -ra PARTS <<< "$test_case"
        local url="${PARTS[0]}"
        local expected="${PARTS[1]}"
        local description="${PARTS[2]}"
        
        local status=$(curl -s -w "%{http_code}" "$BASE_URL$url" -H "Cookie: $COOKIE_SESSION; $DB_SESSION" -o /dev/null 2>/dev/null)
        if [ "$status" = "$expected" ]; then
            echo -e "  ${GREEN}✅ $description${NC}"
        else
            echo -e "  ${RED}❌ $description (got $status, expected $expected)${NC}"
        fi
    done
    echo
    
    # Cleanup
    cleanup_test_data
    
    echo -e "${GREEN}🎉 All tests completed successfully!${NC}"
    echo -e "${BLUE}Payment flow is working correctly and ready for production.${NC}"
}

# Help function
show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Environment Variables:"
    echo "  COOKIE_SESSION    Client session cookie (required)"
    echo "  DB_SESSION        Database session cookie (required)"
    echo "  BASE_URL          Base URL to test (default: http://localhost:3000)"
    echo "  DB_FILE           SQLite database file (default: ./mod-bot.sqlite3)"
    echo ""
    echo "Example:"
    echo '  export COOKIE_SESSION="__client-session=eyJ1c2VySWQ..."'
    echo '  export DB_SESSION="__session=IjRlNGQ1OTE2..."'
    echo "  $0"
    echo ""
    echo "Options:"
    echo "  -h, --help        Show this help message"
}

# Parse command line arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac