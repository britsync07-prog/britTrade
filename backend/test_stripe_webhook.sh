#!/bin/bash
# Mock script to test Stripe webhook logic locally

API="http://localhost:7286"
WEBHOOK_SECRET="whsec_placeholder_from_ai_audit"

# 1. Create a dummy payload
PAYLOAD='{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "metadata": {
        "userId": "1",
        "planId": "bundle"
      }
    }
  }
}'

# Note: In a real test, you'd need a valid signature. 
# Since we are using a placeholder secret, this will fail on signature verification 
# unless we mock the verification or use a real secret.
# This script is for documentation of how to test it.

echo "Sending mock webhook event to $API/payments/webhook..."
curl -X POST "$API/payments/webhook" \
     -H "Content-Type: application/json" \
     -H "Stripe-Signature: t=123,v1=mock_sig" \
     -d "$PAYLOAD"

echo -e "\n\nNote: This will likely return a 400 error due to 'mock_sig' being invalid."
echo "To test properly, use the Stripe CLI: stripe listen --forward-to localhost:7286/payments/webhook"
