#!/bin/bash
# Run the README's setup and send flow, then check:
# - the sender identity is verified
# - the configuration set sends reject, bounce and complaint events to the SNS topic
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

described=$(lstk aws ses describe-configuration-set --configuration-set-name "$CONFIG_SET" \
  --configuration-set-attribute-names eventDestination --output json)
echo "describe-configuration-set: $described"
v2=$(lstk aws sesv2 get-configuration-set-event-destinations --configuration-set-name "$CONFIG_SET" --output json || true)
echo "sesv2 get-configuration-set-event-destinations: $v2"
destination=$(echo "$described" | jq '.EventDestinations[0]')
if ! echo "$destination" | jq -e --arg topic ":$TOPIC_NAME" \
  '.Enabled and (.SNSDestination.TopicARN | endswith($topic)) and (.MatchingEventTypes | sort == ["bounce", "complaint", "reject"])' > /dev/null; then
  echo "Test failed: unexpected event destination $destination"
  exit 1
fi
echo "PASS: $CONFIG_SET sends reject, bounce and complaint events to $TOPIC_NAME"

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
