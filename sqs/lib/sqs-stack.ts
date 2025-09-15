import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export class SqsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table for storing orders
    const ordersTable = new dynamodb.Table(this, 'OrdersTable', {
      tableName: 'OrdersTable',
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add Global Secondary Index for querying by userId
    ordersTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
    });

    // DynamoDB Table for storing individual order items
    const orderItemsTable = new dynamodb.Table(this, 'OrderItemsTable', {
      tableName: 'OrderItemsTable',
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'itemId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add Global Secondary Index for querying by item status
    orderItemsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'itemStatus', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
    });

    const idempotencyTable = new dynamodb.Table(this, 'idempotencyTable', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'expiration',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Dead Letter Queue (DLQ)
    const dlq = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: 'sqs-dlq.fifo',
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.days(14),
    });

    // Main FIFO SQS Queue
    const queue = new sqs.Queue(this, 'OrdersFifoQueue', {
      queueName: 'sqs-main-queue.fifo',
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    });

    const orderManagerFunction = new NodejsFunction(this, 'orderManagerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'functions/OrderManager/index.ts',
      environment: {
        IDEMPOTENCY_TABLE_NAME: idempotencyTable.tableName,
        ORDERS_FIFO_QUEUE_URL: queue.queueUrl,
      },
    });
    idempotencyTable.grantReadWriteData(orderManagerFunction);
    ordersTable.grantReadWriteData(orderManagerFunction);
    orderItemsTable.grantReadWriteData(orderManagerFunction);
    queue.grantSendMessages(orderManagerFunction);

    // OrderProcessor Lambda function
    const orderProcessorFunction = new NodejsFunction(this, 'orderProcessorFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'functions/OrderProcessor/index.ts',
      environment: {
        ORDERS_TABLE_NAME: ordersTable.tableName,
        ORDER_ITEMS_TABLE_NAME: orderItemsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });
    ordersTable.grantReadWriteData(orderProcessorFunction);
    orderItemsTable.grantReadWriteData(orderProcessorFunction);

    // DLQ Processor Lambda function
    const dlqProcessorFunction = new NodejsFunction(this, 'dlqProcessorFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'functions/DLQProcessor/index.ts',
      environment: {
        ORDERS_TABLE_NAME: ordersTable.tableName,
        ORDER_ITEMS_TABLE_NAME: orderItemsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });
    ordersTable.grantReadWriteData(dlqProcessorFunction);
    orderItemsTable.grantReadWriteData(dlqProcessorFunction);

    // Grant SQS permissions to Lambda functions
    queue.grantConsumeMessages(orderProcessorFunction);
    dlq.grantConsumeMessages(dlqProcessorFunction);

    // Add SQS event sources to Lambda functions
    orderProcessorFunction.addEventSource(new lambdaEventSources.SqsEventSource(queue, {
      batchSize: 1, // Process one message at a time to allow individual success/failure
      // Note: maxBatchingWindow is not supported for FIFO queues
    }));

    dlqProcessorFunction.addEventSource(new lambdaEventSources.SqsEventSource(dlq, {
      batchSize: 10, // Process up to 10 messages at once
      // Note: maxBatchingWindow is not supported for FIFO queues
    }));

    // Output queue URLs for reference
    new cdk.CfnOutput(this, 'MainQueueUrl', {
      value: queue.queueUrl,
      description: 'Main FIFO Queue URL',
    });

    new cdk.CfnOutput(this, 'DLQUrl', {
      value: dlq.queueUrl,
      description: 'Dead Letter Queue URL',
    });
  }
}
