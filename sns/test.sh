#!/bin/bash
# Publish order events through the API and check each subscriber only gets
# the events its filter policy allows (see the README's Event Types table):
# - analytics-audit gets every event
# - customer-notifications gets OrderPlaced, OrderShipped and OrderCancelled, and sends an SMS
# - ops-alerts gets OrderDelayed and OrderCancelled with high priority
set -euo pipefail

ENDPOINT=${ENDPOINT:-http://localhost:4566}
MAX_ATTEMPTS=${MAX_ATTEMPTS:-30}
RUN="ci-$(date +%s)"
PHONE="+13333333333"
START_MS=$(( $(date +%s) * 1000 ))

API_URL=$(lstk aws cloudformation describe-stacks --stack-name SnsStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)
API_URL=${API_URL%/}
echo "API: $API_URL"

# post <path> <json>, fails unless the API answers 200
post() {
  local response status
  response=$(curl -s -m 30 -w '\n%{http_code}' -H 'Content-Type: application/json' -d "$2" "$API_URL$1")
  status=${response##*$'\n'}
  if [ "$status" != "200" ]; then
    echo "Test failed: POST $1 returned HTTP $status: ${response%$'\n'*}"
    exit 1
  fi
}

post /orders "{\"eventType\": \"OrderPlaced\", \"orderId\": \"$RUN-placed\", \"userId\": \"user-123\", \"phoneNumber\": \"$PHONE\", \"orderTotal\": 99.99}"
post /orders "{\"eventType\": \"OrderDelayed\", \"orderId\": \"$RUN-delayed-low\", \"userId\": \"user-123\", \"priority\": \"low\"}"
post /orders "{\"eventType\": \"OrderDelayed\", \"orderId\": \"$RUN-delayed-high\", \"userId\": \"user-123\", \"priority\": \"high\", \"reason\": \"Weather delay\"}"
post "/orders/$RUN-cancelled/events" "{\"eventType\": \"OrderCancelled\", \"userId\": \"user-123\", \"phoneNumber\": \"$PHONE\", \"priority\": \"high\", \"reason\": \"Item out of stock\"}"
echo "PASS: published 4 order events through the API"

status=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d '{"eventType": "OrderLost"}' "$API_URL/orders")
if [ "$status" != "400" ]; then
  echo "Test failed: an invalid eventType returned HTTP $status, expected 400"
  exit 1
fi
echo "PASS: invalid eventType rejected with HTTP 400"

logs() {
  lstk aws logs filter-log-events --log-group-name "/aws/lambda/$1" --start-time "$START_MS" \
    --query 'events[].message' --output text 2>/dev/null || true
}

# Wait until every expected delivery shows up in the subscriber logs
expected=(
  "analytics-audit $RUN-placed" "analytics-audit $RUN-delayed-low" "analytics-audit $RUN-delayed-high" "analytics-audit $RUN-cancelled"
  "customer-notifications $RUN-placed" "customer-notifications $RUN-cancelled"
  "ops-alerts $RUN-delayed-high" "ops-alerts $RUN-cancelled"
)
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  analytics=$(logs analytics-audit)
  customer=$(logs customer-notifications)
  ops=$(logs ops-alerts)
  missing=()
  for entry in "${expected[@]}"; do
    function=${entry%% *}
    order=${entry#* }
    case $function in
      analytics-audit) text=$analytics ;;
      customer-notifications) text=$customer ;;
      ops-alerts) text=$ops ;;
    esac
    [[ "$text" == *"$order"* ]] || missing+=("$entry")
  done
  [ ${#missing[@]} = 0 ] && break
  echo "Attempt $attempt/$MAX_ATTEMPTS: waiting for ${missing[*]}"
  sleep 2
done
if [ ${#missing[@]} != 0 ]; then
  echo "Test failed: events not delivered: ${missing[*]}"
  exit 1
fi
echo "PASS: analytics-audit received all 4 events"
echo "PASS: customer-notifications received OrderPlaced and OrderCancelled"
echo "PASS: ops-alerts received the high priority OrderDelayed and OrderCancelled"

# Give stray deliveries a moment to arrive before checking the filters held
sleep 5
customer=$(logs customer-notifications)
ops=$(logs ops-alerts)
if [[ "$customer" == *"$RUN-delayed"* ]]; then
  echo "Test failed: customer-notifications received an OrderDelayed event"
  exit 1
fi
if [[ "$ops" == *"$RUN-placed"* || "$ops" == *"$RUN-delayed-low"* ]]; then
  echo "Test failed: ops-alerts received an event its filter should drop"
  exit 1
fi
echo "PASS: filter policies dropped the other events"

if [[ "$ops" != *"Ops alert email sent successfully"* ]]; then
  echo "Test failed: ops-alerts did not publish to the ops-alerts topic"
  exit 1
fi
echo "PASS: ops-alerts published the alert to the ops-alerts topic"

sms=$(curl -s "$ENDPOINT/_aws/sns/sms-messages")
for order in "$RUN-placed" "$RUN-cancelled"; do
  if ! echo "$sms" | jq -e --arg id "$order" '[.. | objects | select(has("Message")) | .Message] | any(contains($id))' > /dev/null; then
    echo "Test failed: no SMS sent for $order"
    echo "$sms"
    exit 1
  fi
done
echo "PASS: customer-notifications sent SMS for the placed and cancelled orders"

echo "Test passed: SNS fanned out the events and the filter policies routed them"
