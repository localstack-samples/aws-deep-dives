#!/bin/bash
# Run the README's setup and send flow, then check:
# - the sender identity is verified
# - the configuration set exists
# - the email subscription on the topic is confirmed
# - the text and HTML emails were sent, read back from LocalStack's SES message store
set -euo pipefail

ENDPOINT=${ENDPOINT:-http://localhost:4566}
SENDER=$(sed -n 's/^EMAIL_IDENTITY = //p' Makefile)
CONFIG_SET=sample-ses-config-set
TOPIC_NAME=ses-events-topic
TO_EMAIL="ci-$(date +%s)@example.com"

make setup-all

status=$(lstk aws ses get-identity-verification-attributes --identities "$SENDER" \
  --query "VerificationAttributes.\"$SENDER\".VerificationStatus" --output text)
if [ "$status" != "Success" ]; then
  echo "Test failed: $SENDER verification status is $status"
  exit 1
fi
echo "PASS: $SENDER is verified"

# make setup-all fails if creating the SNS event destination fails. Reading it back is
# not possible on LocalStack yet: describe-configuration-set returns no EventDestinations
# and sesv2 get-configuration-set-event-destinations is not implemented.
if ! lstk aws ses describe-configuration-set --configuration-set-name "$CONFIG_SET" > /dev/null; then
  echo "Test failed: configuration set $CONFIG_SET not found"
  exit 1
fi
echo "PASS: configuration set $CONFIG_SET exists"

TOPIC_ARN=$(lstk aws sns create-topic --name "$TOPIC_NAME" --query TopicArn --output text)
subscription=$(lstk aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" \
  --query "Subscriptions[?Protocol=='email'] | [0].SubscriptionArn" --output text)
if [ -z "$subscription" ] || [ "$subscription" = "None" ] || [ "$subscription" = "PendingConfirmation" ]; then
  echo "Test failed: the email subscription is not confirmed ($subscription)"
  exit 1
fi
echo "PASS: email subscription confirmed"

make send-email TO_EMAIL="$TO_EMAIL"
make send-html-email TO_EMAIL="$TO_EMAIL"

messages=$(curl -s "$ENDPOINT/_aws/ses?email=$SENDER" | jq --arg to "$TO_EMAIL" \
  '[.messages[] | select(.Destination.ToAddresses | index($to))]')
if ! echo "$messages" | jq -e 'length == 2 and all(.Subject == "Test Email from SES")' > /dev/null; then
  echo "Test failed: expected 2 emails to $TO_EMAIL, found $messages"
  exit 1
fi
if ! echo "$messages" | jq -e 'any(.Body.html_part // "" | contains("<strong>HTML email</strong>"))' > /dev/null; then
  echo "Test failed: the HTML email body was not stored: $messages"
  exit 1
fi
echo "PASS: text and HTML emails sent to $TO_EMAIL"

echo "Test passed: SES is configured and sends email"
