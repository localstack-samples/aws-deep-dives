# SQS LocalStack Setup

This project demonstrates AWS SQS with a first-in-first-out (FIFO) queue and a dead-letter queue (DLQ). The example uses a fake ordering system to demonstrate the use of a queue, including how SQS handles retries and moves items to the DLQ after retries fail.

## Architecture Overview

### 1. OrderManager Lambda Function
- **Purpose**: Receives order requests and stores orders and items separately in DynamoDB
- **Functionality**: 
  - Validates and stores order metadata in the OrdersTable
  - Stores individual order items in the OrderItemsTable
  - Calculates total value and item count for each order
  - Sends individual item processing messages to the SQS FIFO queue
  - Uses idempotency to prevent duplicate processing

### 2. SQS FIFO Queue
- **Queue Name**: `sqs-main-queue.fifo`
- **Configuration**:
  - FIFO queue with content-based deduplication
  - Visibility timeout: 30 seconds
  - Retention period: 4 days
  - Dead letter queue configured with max receive count of 3

### 3. OrderProcessor Lambda Function
- **Purpose**: Processes individual order items from the FIFO queue
- **Failure Simulation**: 
  - Items with IDs ending in '1' fail 50% of the time (demonstrates retry success)
  - Items with IDs ending in '3' always fail (demonstrates DLQ functionality)
- **Retry Behavior**: Failed messages are retried up to 3 times before moving to DLQ
- **DynamoDB Updates**: 
  - Updates individual item status from "PENDING" to "PROCESSED"

### 4. Dead Letter Queue (DLQ)
- **Queue Name**: `sqs-dlq.fifo`
- **Purpose**: Stores messages that failed processing after maximum retries
- **Retention**: 14 days

### 5. DLQProcessor Lambda Function
- **Purpose**: Handles failed item messages from the dead letter queue
- **Functionality**: 
  - Updates individual item status to "FAILED" in DynamoDB

## Deployment and Usage

- LocalStack running locally
- LocalStack's thin AWS CDK wrapper `cdklocal` installed
- LocalStack's thin AWS CLI wrapper `awslocal` installed

The Lambdas are built using TypeScript, so you'll need to first install dependencies.

```bash
npm install
```

### Makefile Usage

**Deploy the project:**

```bash
make deploy
```

Once deployed, it is recommended that you invoke the Lambda, view DynamoDB data, view the SQS queues or explore the CloudWatch Logs via the [LocalStack web console](https://app.localstack.cloud). This will simplify interaction with the services through a visual interface.

Test the project using sample order data:

```bash
make test-order
```

View the status of items on the main FIFO queue:

```bash
make check-status-sqs
```

View the status of items reflected in the DynamoDB table:

```bash
make check-status-dynamo
```

### Manual Deployment

Deploy the CDK stack:

```bash
cdklocal bootstrap
cdklocal deploy
```

## Expected Behavior

### Successful Orders (ending in 2, 4, 5, 6)
1. OrderManager receives request
2. Order items stored in DynamoDB with status "PENDING"
3. Message sent to SQS FIFO queue
4. OrderProcessor processes message successfully
5. Order status updated to "PROCESSED" in DynamoDB

### Orders with Retry Success (ending in 1 - 50% chance)
1. OrderManager receives request
2. Order items stored in DynamoDB with status "PENDING"
3. Message sent to SQS FIFO queue
4. OrderProcessor attempts processing and may fail initially
5. SQS retries the message (up to 3 times)
6. Eventually succeeds and order status updated to "PROCESSED" in DynamoDB

### Orders that End in DLQ (ending in 3 - always fail)
1. OrderManager receives request
2. Order items stored in DynamoDB with status "PENDING"
3. Message sent to SQS FIFO queue
4. OrderProcessor attempts processing and fails
5. SQS retries the message (up to 3 times)
6. After 3 failed attempts, message moves to DLQ
7. DLQProcessor updates order status to "FAILED" in DynamoDB