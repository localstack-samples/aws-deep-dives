# SQS FIFO Queue with Retry and Dead Letter Queue Demo

This project demonstrates AWS SQS FIFO queue functionality with retry mechanisms and dead letter queue (DLQ) handling using AWS CDK and Lambda functions.

## Architecture Overview

```
OrderManager → SQS FIFO Queue → OrderProcessor → OrderItems Table
                    ↓ (after 3 retries)              ↓
              Dead Letter Queue → DLQProcessor → Orders Table
```

## Components

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
  - Automatically updates order status based on all item statuses

### 4. Dead Letter Queue (DLQ)
- **Queue Name**: `sqs-dlq.fifo`
- **Purpose**: Stores messages that failed processing after maximum retries
- **Retention**: 14 days

### 5. DLQProcessor Lambda Function
- **Purpose**: Handles failed item messages from the dead letter queue
- **Functionality**: 
  - Updates individual item status to "FAILED" in DynamoDB
  - Automatically updates order status based on all item statuses
  - Logs failed items for manual review and monitoring

## Failure Simulation Logic

The OrderProcessor function includes a `shouldSimulateFailure()` function that determines which items should fail:

```typescript
const shouldSimulateFailure = (itemId: string): boolean => {
    const lastDigit = itemId.slice(-1);
    
    // Items ending in '3' always fail (will end up in DLQ after 3 retries)
    if (lastDigit === '3') {
        return true;
    }
    
    // Items ending in '1' fail 50% of the time (some will succeed after retries)
    if (lastDigit === '1') {
        return Math.random() < 0.5;
    }
    
    // All other items succeed
    return false;
};
```

This creates a realistic failure pattern for testing:
- **Items ending in '3'**: Always fail and end up in the dead letter queue after 3 retries
- **Items ending in '1'**: Fail 50% of the time, demonstrating retry success scenarios
- **Items ending in other digits**: Always process successfully

## Order Status Logic

Orders can have the following statuses based on their items:
- **PENDING**: Some items are still being processed
- **PROCESSED**: All items processed successfully
- **FAILED**: All items failed processing
- **PARTIALLY_PROCESSED**: Some items succeeded, some failed

## Deployment

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Deploy the Stack**:
   ```bash
   npm run deploy
   ```

3. **Get Function URLs**:
   After deployment, get the OrderManager function URL from the AWS Console or CLI.

## Testing

### Using the Test Script

1. **Update the test script**:
   Edit `test-order-processing.js` and replace `YOUR_ORDER_MANAGER_FUNCTION_URL_HERE` with your actual function URL.

2. **Run the test**:
   ```bash
   node test-order-processing.js
   ```

### Manual Testing

Send a POST request to your OrderManager function with this payload:

```json
{
    "orderId": "order-001",
    "userId": "user-001", 
    "orderStatus": "pending",
    "orderItems": [
        {
            "itemDetail": "Laptop",
            "quantity": 1,
            "price": 999.99
        }
    ]
}
```

## Monitoring and Observability

### CloudWatch Logs
- **OrderManager**: `/aws/lambda/SqsStack-orderManagerFunction-*`
- **OrderProcessor**: `/aws/lambda/SqsStack-orderProcessorFunction-*`
- **DLQProcessor**: `/aws/lambda/SqsStack-dlqProcessorFunction-*`

### SQS Console
- Monitor message counts in both main queue and DLQ
- View message details and retry attempts
- Check message attributes and metadata

### DynamoDB Console
- View stored order items in the `OrdersTable`
- Monitor table metrics and performance

## Expected Behavior

### Successful Orders (ending in 2, 4, 5, 6, 7, 8, 9, 0)
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

## Key Features Demonstrated

- **FIFO Queue**: Ensures message ordering by order ID
- **Retry Mechanism**: Automatic retries for failed processing
- **Dead Letter Queue**: Handles permanently failed messages
- **Idempotency**: Prevents duplicate order processing
- **Batch Processing**: Lambda processes up to 10 messages at once
- **Error Handling**: Comprehensive error logging and monitoring

## Cleanup

To remove all resources:

```bash
npm run destroy
```

## Troubleshooting

### Common Issues

1. **Function URL not working**: Ensure the OrderManager function has the correct permissions and is deployed successfully.

2. **Messages not processing**: Check CloudWatch logs for errors in the OrderProcessor function.

3. **DLQ not receiving messages**: Verify the maxReceiveCount is set to 3 and messages are actually failing processing.

4. **DynamoDB permissions**: Ensure all Lambda functions have the necessary DynamoDB permissions.

### Debugging Tips

- Check CloudWatch logs for detailed error messages
- Monitor SQS queue metrics in the AWS Console
- Verify environment variables are set correctly
- Check IAM permissions for all resources