LOCALSTACK_AUTH_TOKEN ?= $(LOCALSTACK_AUTH_TOKEN)

.PHONY: start
start:
	@test -n "$(LOCALSTACK_AUTH_TOKEN)" || (echo "LOCALSTACK_AUTH_TOKEN is not set. Please set it before starting LocalStack." && exit 1)
	DEBUG=1 LOCALSTACK_AUTH_TOKEN=$(LOCALSTACK_AUTH_TOKEN) localstack start -d

.PHONY: deploy
deploy:
	cdklocal bootstrap
	cdklocal deploy --require-approval never

.PHONY: help
help:
	@echo "Available commands:"
	@echo "  start     - Start LocalStack (requires LOCALSTACK_AUTH_TOKEN)"
	@echo "  deploy    - Deploy the SNS stack to LocalStack using CDK"
