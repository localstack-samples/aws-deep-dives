#!/bin/bash
# Submit the sample order and check every item ends where the README says:
# - ITEM-223 ends in 3, always fails, and the DLQ processor marks it FAILED
# - ITEM-101 ends in 1, fails half the time, and ends PROCESSED or FAILED
# - all other items are PROCESSED
# The order ID is unique per run, since idempotency skips repeated orders.
set -euo pipefail

MAX_ATTEMPTS=${MAX_ATTEMPTS:-60}
ORDER_ID="ORD-ci-$(date +%s)"
PAYLOAD=$(mktemp)
RESPONSE=$(mktemp)
trap 'rm -f "$PAYLOAD" "$RESPONSE"' EXIT

FUNCTION_NAME=$(lstk aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `SqsStack-orderManagerFunction`)].FunctionName' --output text)
if [ -z "$FUNCTION_NAME" ]; then
  echo "Test failed: OrderManager function not found, deploy the stack first"
  exit 1
fi

jq --arg id "$ORDER_ID" '.orderId = $id' sampleData/order.json > "$PAYLOAD"
lstk aws lambda invoke --function-name "$FUNCTION_NAME" --payload "fileb://$PAYLOAD" "$RESPONSE" > /dev/null
if ! jq -e '.statusCode == 200' "$RESPONSE" > /dev/null; then
  echo "Test failed: OrderManager returned $(cat "$RESPONSE")"
  exit 1
fi
echo "PASS: OrderManager accepted order $ORDER_ID"

order=$(lstk aws dynamodb query --table-name OrdersTable \
  --key-condition-expression 'orderId = :id' --expression-attribute-values "{\":id\": {\"S\": \"$ORDER_ID\"}}" \
  --query 'Items[0]' --output json)
if ! echo "$order" | jq -e '.totalItems.N == "6" and (.totalValue.N | tonumber - 38.95 | fabs < 0.001)' > /dev/null; then
  echo "Test failed: unexpected order record $order"
  exit 1
fi
echo "PASS: order stored with 6 items worth 38.95"

statuses=""
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  statuses=$(lstk aws dynamodb query --table-name OrderItemsTable \
    --key-condition-expression 'orderId = :id' --expression-attribute-values "{\":id\": {\"S\": \"$ORDER_ID\"}}" \
    --output json | jq -c '[.Items[] | {(.itemId.S): .itemStatus.S}] | add')
  if echo "$statuses" | jq -e 'length == 6 and (to_entries | all(.value != "PENDING"))' > /dev/null; then
    break
  fi
  echo "Attempt $attempt/$MAX_ATTEMPTS: $statuses"
  sleep 5
done
echo "Item statuses: $statuses"

if ! echo "$statuses" | jq -e '.["ITEM-223"] == "FAILED"' > /dev/null; then
  echo "Test failed: ITEM-223 should fail every attempt and be marked FAILED from the DLQ"
  exit 1
fi
echo "PASS: ITEM-223 moved to the DLQ and was marked FAILED"

if ! echo "$statuses" | jq -e '.["ITEM-101"] == "PROCESSED" or .["ITEM-101"] == "FAILED"' > /dev/null; then
  echo "Test failed: ITEM-101 did not finish processing"
  exit 1
fi
echo "PASS: ITEM-101 finished as $(echo "$statuses" | jq -r '.["ITEM-101"]')"

if ! echo "$statuses" | jq -e '[.["ITEM-334"], .["ITEM-452"], .["ITEM-565"], .["ITEM-678"]] | all(. == "PROCESSED")' > /dev/null; then
  echo "Test failed: ITEM-334, ITEM-452, ITEM-565 and ITEM-678 should be PROCESSED"
  exit 1
fi
echo "PASS: the remaining items were PROCESSED"

echo "Test passed: the queue retried failures and sent the poison item to the DLQ"
