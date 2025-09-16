.PHONY: help
help:
	@echo "Available commands:"
	@echo "  deploy    - Create the SQS stack to LocalStack using CDK"
	@echo "  test-order     - Test the order processing functionality"
	@echo "  check-status-sqs      - get the status of the order items from SQS"
	@echo "  check-status-dynamo      - get the status of the order items from the database"
	@echo "  restart    - Restart the SQS stack on LocalStack"
.PHONY: deploy
deploy:
	cdklocal bootstrap
	cdklocal deploy --require-approval never

# You can also invoke this function using the LocalStack web console
# note that if you invoke this more than once, you'll need to change the payload
# as idempotency will prevent duplicate orders from being processed
.PHONY: test-order
test-order:
	@FUNCTION_NAME=$$(awslocal lambda list-functions --query 'Functions[?starts_with(FunctionName, `SqsStack-orderManagerFunction`)].FunctionName' --output text); \
	if [ -z "$$FUNCTION_NAME" ]; then \
		echo "Error: No function found starting with 'orderManagerFunction'"; \
		exit 1; \
	fi; \
	echo "Invoking function: $$FUNCTION_NAME"; \
	awslocal lambda invoke --function-name "$$FUNCTION_NAME" --payload file://sampleData/order.json --cli-binary-format raw-in-base64-out /dev/stdout;

# You can also view the SQS messages in the LocalStack web console
.PHONY: check-status-sqs
check-status-sqs:
	curl "http://localhost.localstack.cloud:4566/_aws/sqs/messages?QueueUrl=http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/sqs-main-queue.fifo"

# You can also view the DynamoDB table data in the LocalStack web console
.PHONY: check-status-dynamo
check-status-dynamo:
	awslocal dynamodb scan --table-name OrderItemsTable

.PHONY: restart
restart:
	localstack restart