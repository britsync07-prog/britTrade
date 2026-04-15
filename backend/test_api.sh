#!/bin/bash
API="http://localhost:3000"

echo "1. Signing up..."
curl -s -X POST $API/auth/signup -H "Content-Type: application/json" -d '{"email":"test@trade.com","password":"password123"}'

echo -e "\n2. Logging in..."
TOKEN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" -d '{"email":"test@trade.com","password":"password123"}' | grep -oP '(?<="token":")[^"]*')

echo "Token: $TOKEN"

echo -e "\n3. Getting Strategies..."
curl -s -X GET $API/strategies -H "Authorization: Bearer $TOKEN"

echo -e "\n4. Running #1 UltimateFuturesScalper..."
curl -s -X POST $API/strategies/run -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"strategyId":3}'

echo -e "\n5. Checking Chart Data for BTC/USDT..."
curl -s -X GET $API/charts/BTC/USDT -H "Authorization: Bearer $TOKEN" | head -c 200
echo -e "\n..."
