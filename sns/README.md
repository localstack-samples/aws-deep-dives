# SNS LocalStack Setup

A sample application demonstrating Amazon SNS for event-driven architecture using order lifecycle events that can be deployed and tested on LocalStack.

## Architecture

```
Order API (Lambda + API Gateway)
        |
        v
   SNS Topic: order-events
        |
        |--> Lambda: Customer Notifications (filtered: OrderPlaced, OrderShipped, OrderCancelled)
        |
        |--> Lambda: Analytics/Audit (all events)
        |
        |--> Lambda: Ops Alerts (filtered: OrderDelayed, OrderCancelled + high priority)
```

## SNS Concepts Demonstrated

- **Fan-out messaging**: One publisher, multiple subscribers
- **Message filtering**: Subscribers receive only relevant events
- **Loose coupling**: Add new subscribers without changing the publisher
- **Message attributes**: Metadata for filtering without parsing message body
- **Application-to-person messaging**: Sending emails and text messages for notifications

## Prerequisites

- A valid [LocalStack for AWS license](https://localstack.cloud/pricing). Your license provides a [`LOCALSTACK_AUTH_TOKEN`](https://docs.localstack.cloud/getting-started/auth-token/) to activate LocalStack.
- [LocalStack CLI](https://docs.localstack.cloud/getting-started/installation/) installed
- LocalStack's AWS CDK wrapper [`cdklocal`](https://github.com/localstack/aws-cdk-local) installed
- LocalStack's AWS CLI wrapper [`awslocal`](https://github.com/localstack/awscli-local) installed
- Node.js and npm installed

Export your auth token before starting:

```bash
export LOCALSTACK_AUTH_TOKEN=<your-auth-token>
```

## Start LocalStack

```bash
make start
```

## Deployment and Usage

The Lambdas are built using TypeScript, so you'll need to first install dependencies.

```bash
npm install
```

### Makefile Usage

```bash
make deploy
```

### Manual Deployment

Deploy the CDK stack:

```bash
cdklocal bootstrap
cdklocal deploy
```

After deployment, note the outputs:
- `ApiEndpoint` - The API Gateway URL
- `SnsTopicArn` - The SNS topic ARN

## Event Types

| Event | Description | Subscribers |
|-------|-------------|-------------|
| `OrderPlaced` | New order created | Customer Notifications, Analytics |
| `OrderShipped` | Order has shipped | Customer Notifications, Analytics |
| `OrderDelayed` | Shipping delayed | Analytics, Ops Alerts (if high priority) |
| `OrderCancelled` | Order cancelled | Customer Notifications, Analytics, Ops Alerts (if high priority) |

## Manual Usage

### Publish Events via API

**Create a new order (OrderPlaced):**
```bash
curl -X POST https://<api-id>.execute-api.localhost.localstack.cloud:4566/prod/orders \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "OrderPlaced",
    "userId": "user-123",
    "phoneNumber": "3333333333",
    "orderTotal": 99.99,
    "items": [
      {"productId": "PROD-001", "quantity": 2, "price": 49.99}
    ]
  }'
```

**Ship an order:**
```bash
curl -X POST https://<api-id>.execute-api.localhost.localstack.cloud:4566/prod/orders/ORD-12345/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "OrderShipped",
    "userId": "user-123",
    "phoneNumber": "3333333333",
    "trackingNumber": "1Z999AA10123456784",
    "estimatedDelivery": "2024-01-15"
  }'
```

**Report a delayed order (high priority - triggers ops alert):**
```bash
curl -X POST https://<api-id>.execute-api.localhost.localstack.cloud:4566/prod/orders/ORD-12345/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "OrderDelayed",
    "userId": "user-123",
    "phoneNumber": "3333333333",
    "priority": "high",
    "reason": "Weather delay at distribution center"
  }'
```

**Cancel an order (high priority - triggers ops alert):**
```bash
curl -X POST  https://6epzwkqhxp.execute-api.localhost.localstack.cloud:4566/prod/orders/ORD-12345/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "OrderCancelled",
    "userId": "user-123",
    "phoneNumber": "3333333333",
    "priority": "high",
    "reason": "Item out of stock"
  }'
```

## Message Attributes

Each message includes attributes for filtering:

```json
{
  "eventType": {
    "DataType": "String",
    "StringValue": "OrderShipped"
  },
  "priority": {
    "DataType": "String",
    "StringValue": "high"
  }
}
```

## Filter Policies

**Customer Notifications:**
```json
{
  "eventType": ["OrderPlaced", "OrderShipped", "OrderCancelled"]
}
```

**Ops Alerts (multi-attribute filter):**
```json
{
  "eventType": ["OrderDelayed", "OrderCancelled"],
  "priority": ["high"]
}
```

## Testing Filter Behavior

1. **Low priority delay** - Only Analytics receives it:
   ```bash
   curl -X POST <api-url>/orders \
     -d '{"eventType": "OrderDelayed", "userId": "test", "priority": "low"}'
   ```

2. **High priority delay** - Analytics AND Ops Alerts receive it:
   ```bash
   curl -X POST <api-url>/orders \
     -d '{"eventType": "OrderDelayed", "userId": "test", "priority": "high"}'
   ```

3. **Order placed** - Customer Notifications AND Analytics receive it:
   ```bash
   curl -X POST <api-url>/orders \
     -d '{"eventType": "OrderPlaced", "userId": "test", "orderTotal": 50}'
   ```
