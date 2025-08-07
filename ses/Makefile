# This Makefile provides commands to set up SES using the AWS CLI on LocalStack

# Variables
CONFIG_SET_NAME = sample-ses-config-set
SNS_TOPIC_NAME = ses-events-topic
EMAIL_IDENTITY = brian.rinaldi@localstack.cloud
SNS_TOPIC_EMAIL = foo@bar.com
TO_EMAIL = 
SUBJECT = Test Email from SES
MESSAGE = This is a test email sent via AWS SES on LocalStack using the CLI.

.PHONY: help
help:
	@echo "Available commands:"
	@echo "  create-config-set    - Create the SES configuration set"
	@echo "  create-sns-topic     - Create SNS topic for SES events"
	@echo "  subscribe-topic      - Subscribe to the SNS topic via email"
	@echo "  setup-event-dest     - Configure event destination to SNS"
	@echo "  verify-email         - Verify email identity"
	@echo "  setup-all           - Run complete setup (topic, config set, event dest, email)"
	@echo "  status              - Show current configuration status"
	@echo "  send-email          - Send test email (use TO_EMAIL=recipient@example.com)"
	@echo "  send-html-email     - Send HTML email (use TO_EMAIL=recipient@example.com)"
	@echo "  send-custom-email   - Send custom email (use TO_EMAIL, SUBJECT, MESSAGE vars)"

# Create SNS topic for SES events
.PHONY: create-sns-topic
create-sns-topic:
	@echo "Creating SNS topic: $(SNS_TOPIC_NAME)"
	awslocal sns create-topic --name $(SNS_TOPIC_NAME) --attributes DisplayName="SES Events Topic"

# Create SES configuration set
.PHONY: create-config-set
create-config-set:
	@echo "Creating SES configuration set: $(CONFIG_SET_NAME)"
	awslocal ses create-configuration-set --configuration-set Name=$(CONFIG_SET_NAME)
	@echo "Enabling reputation metrics tracking..."
	awslocal ses update-configuration-set-reputation-metrics-enabled \
		--configuration-set-name $(CONFIG_SET_NAME) \
		--enabled

# Setup event destination to SNS topic
# the possible events are send,reject,bounce,complaint,delivery,open,click,renderingFailure
# for example purposes, we're only including limited events
.PHONY: setup-event-dest
setup-event-dest:
	$(eval SNS_TOPIC_ARN := $(shell awslocal sns get-topic-attributes --topic-arn arn:aws:sns:$(shell awslocal configure get region):$(shell awslocal sts get-caller-identity --query Account --output text):$(SNS_TOPIC_NAME) --query 'Attributes.TopicArn' --output text 2>/dev/null || aws sns create-topic --name $(SNS_TOPIC_NAME) --query 'TopicArn' --output text))
	@echo "Setting up event destination to SNS topic: $(SNS_TOPIC_ARN)"
	awslocal ses create-configuration-set-event-destination \
		--configuration-set-name $(CONFIG_SET_NAME) \
		--event-destination Name=ToSns,Enabled=true,MatchingEventTypes=reject,bounce,complaint,SNSDestination='{TopicARN=$(SNS_TOPIC_ARN)}'

# Since we're working locally, we want to automatically verify the email identity
.PHONY: verify-email
verify-email:
	@echo "Verifying email identity: $(EMAIL_IDENTITY)"
	awslocal ses verify-email-identity --email-address $(EMAIL_IDENTITY)
	@echo "Email verification initiated. Check your email for verification link."

# Subscribe to the SNS topic
# As we are testing this locally on LocalStack, this will also automatically confirm the subscription
subscribe-topic:
	$(eval SNS_TOPIC_ARN := $(shell awslocal sns get-topic-attributes --topic-arn arn:aws:sns:$(shell awslocal configure get region):$(shell awslocal sts get-caller-identity --query Account --output text):$(SNS_TOPIC_NAME) --query 'Attributes.TopicArn' --output text 2>/dev/null || aws sns create-topic --name $(SNS_TOPIC_NAME) --query 'TopicArn' --output text))
	@echo "Subscribing to SNS topic: $(SNS_TOPIC_ARN)"
	SUBSCRIPTION_ARN=$$(awslocal sns subscribe --topic-arn $(SNS_TOPIC_ARN) --protocol email --notification-endpoint $(SNS_TOPIC_EMAIL) | jq -r '.SubscriptionArn') && \
	SUBSCRIPTION_TOKEN=$$(curl "http://localhost:4566/_aws/sns/subscription-tokens/$$SUBSCRIPTION_ARN" | jq -r '.subscription_token') && \
	awslocal sns confirm-subscription \
		--topic-arn $(SNS_TOPIC_ARN) \
		--token $$SUBSCRIPTION_TOKEN
	@echo "SNS subscription complete. Subscription confirmed."

# Complete setup
.PHONY: setup-all
setup-all: create-sns-topic create-config-set setup-event-dest verify-email subscribe-topic
	@echo "SES configuration setup complete!"
	@echo "Configuration set: $(CONFIG_SET_NAME)"
	@echo "SNS topic: $(SNS_TOPIC_NAME)"
	@echo "Email identity: $(EMAIL_IDENTITY)"

# Send simple text email
.PHONY: send-email
send-email:
	@if [ -z "$(TO_EMAIL)" ]; then \
		echo "Error: TO_EMAIL is required. Usage: make send-email TO_EMAIL=recipient@example.com"; \
		exit 1; \
	fi
	@echo "Sending email from $(EMAIL_IDENTITY) to $(TO_EMAIL)"
	@echo "Subject: $(SUBJECT)"
	awslocal ses send-email \
		--from $(EMAIL_IDENTITY) \
		--destination ToAddresses=$(TO_EMAIL) \
		--message Subject='{Data="$(SUBJECT)",Charset="UTF-8"}',Body='{Text={Data="$(MESSAGE)",Charset="UTF-8"}}' \
		--configuration-set-name $(CONFIG_SET_NAME)
	@echo "Email sent successfully!"

# Send HTML email
.PHONY: send-html-email
send-html-email:
	@if [ -z "$(TO_EMAIL)" ]; then \
		echo "Error: TO_EMAIL is required. Usage: make send-html-email TO_EMAIL=recipient@example.com"; \
		exit 1; \
	fi
	@echo "Sending HTML email from $(EMAIL_IDENTITY) to $(TO_EMAIL)"
	@echo "Subject: $(SUBJECT)"
	awslocal ses send-email \
		--from $(EMAIL_IDENTITY) \
		--destination ToAddresses=$(TO_EMAIL) \
		--message Subject='{Data="$(SUBJECT)",Charset="UTF-8"}',Body='{Html={Data="<html><body><h1>Test Email</h1><p>$(MESSAGE)</p><p>This is an <strong>HTML email</strong> sent via SES.</p></body></html>",Charset="UTF-8"},Text={Data="$(MESSAGE)",Charset="UTF-8"}}' \
		--configuration-set-name $(CONFIG_SET_NAME)
	@echo "HTML email sent successfully!"

# Send email with custom subject and message
.PHONY: send-custom-email
send-custom-email:
	@if [ -z "$(TO_EMAIL)" ]; then \
		echo "Error: TO_EMAIL is required. Usage: make send-custom-email TO_EMAIL=recipient@example.com SUBJECT='Your Subject' MESSAGE='Your message'"; \
		exit 1; \
	fi
	@echo "Sending custom email from $(EMAIL_IDENTITY) to $(TO_EMAIL)"
	@echo "Subject: $(SUBJECT)"
	awslocal ses send-email \
		--from $(EMAIL_IDENTITY) \
		--destination ToAddresses=$(TO_EMAIL) \
		--message Subject='{Data="$(SUBJECT)",Charset="UTF-8"}',Body='{Text={Data="$(MESSAGE)",Charset="UTF-8"}}' \
		--configuration-set-name $(CONFIG_SET_NAME)
	@echo "Custom email sent successfully!"

# Show current status
.PHONY: status
status:
	@echo "=== SES Configuration Status ==="
	@echo "Configuration Sets:"
	@awslocal ses list-configuration-sets --query 'ConfigurationSets[?Name==`$(CONFIG_SET_NAME)`]' --output table || echo "No configuration sets found"
	@echo ""
	@echo "SNS Topics:"
	@awslocal sns list-topics --query 'Topics[?contains(TopicArn, `$(SNS_TOPIC_NAME)`)]' --output table || echo "No matching SNS topics found"
	@echo ""
	@echo "Verified Email Identities:"
	@awslocal ses list-identities --identity-type EmailAddress --query 'Identities[?contains(@, `$(EMAIL_IDENTITY)`)]' --output table || echo "Email not verified"