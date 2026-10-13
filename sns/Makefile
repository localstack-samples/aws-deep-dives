LOCALSTACK_AUTH_TOKEN ?= $(LOCALSTACK_AUTH_TOKEN)

# lstk cdk runs the cdk CLI from PATH, so use the version pinned in package.json
export PATH := $(CURDIR)/node_modules/.bin:$(PATH)

.PHONY: start
start:
	@test -n "$(LOCALSTACK_AUTH_TOKEN)" || (echo "LOCALSTACK_AUTH_TOKEN is not set. Please set it before starting LocalStack." && exit 1)
	LOCALSTACK_DEBUG=1 LOCALSTACK_AUTH_TOKEN=$(LOCALSTACK_AUTH_TOKEN) lstk start

.PHONY: deploy
deploy:
	lstk cdk bootstrap
	lstk cdk deploy --require-approval never

.PHONY: test
test:
	./test.sh

.PHONY: help
help:
	@echo "Available commands:"
	@echo "  start     - Start LocalStack (requires LOCALSTACK_AUTH_TOKEN)"
	@echo "  deploy    - Deploy the SNS stack to LocalStack using CDK"
	@echo "  test      - Publish order events and check the filter policies"
