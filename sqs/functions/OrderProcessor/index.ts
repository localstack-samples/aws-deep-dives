import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';

interface OrderItemMessage {
    orderId: string;
    userId: string;
    itemId: string;
    itemDetail: string;
    quantity: number;
    price: number;
    timestamp: string;
}

const dynamoDBClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoDBClient);
const sqs = new SQSClient({});
const logger = new Logger({ serviceName: 'orderProcessor' });

// Since this is a demo, we're going to simulate some failures to demonstrate SQS retries
const shouldSimulateFailure = (itemId: string): boolean => {
    const lastDigit = itemId.slice(-1);
    
    // Items ending in '3' always fail and end up on the DLQ
    if (lastDigit === '3') {
        return true;
    }
    
    // Items ending in '1' fail 50% of the time and will be retried
    if (lastDigit === '1') {
        return Math.random() < 0.5;
    }
    
    // All other items succeed
    return false;
};

// Since this is a demo, we're only simulating actual processing by adding a slight delay
const processOrderItem = async (itemMessage: OrderItemMessage): Promise<void> => {
    logger.info(`Processing item ${itemMessage.itemId} (${itemMessage.itemDetail}) for order ${itemMessage.orderId}`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    
    // We're simulating failures to demonstrate retries and DLQ
    if (shouldSimulateFailure(itemMessage.itemId)) {
        const error = new Error(`Simulated processing failure for item ${itemMessage.itemId}`);
        logger.error(`Processing failed for item ${itemMessage.itemId}:`, error.message);
        throw error;
    }
    
    logger.info(`Successfully processed item ${itemMessage.itemId}`);
};

// Update individual item status in DynamoDB
const updateItemStatus = async (orderId: string, itemId: string, status: string): Promise<void> => {
    try {
        logger.info(`Updating item ${itemId} status to: ${status}`);
        
        // Update the item status
        await dynamoDB.send(new UpdateCommand({
            TableName: process.env.ORDER_ITEMS_TABLE_NAME as string,
            Key: {
                orderId,
                itemId
            },
            UpdateExpression: 'SET itemStatus = :status, processedAt = :processedAt',
            ExpressionAttributeValues: {
                ':status': status,
                ':processedAt': new Date().toISOString()
            }
        }));

        logger.info(`Successfully updated item ${itemId} to status: ${status}`);
        
    } catch (error) {
        logger.error(`Failed to update item status for ${itemId}:`, error instanceof Error ? error : String(error));
        throw error;
    }
};

// Process a single SQS record
const processRecord = async (record: SQSRecord): Promise<void> => {
    try {
        const itemMessage: OrderItemMessage = JSON.parse(record.body);
        logger.info(`Received message for item ${itemMessage.itemId} in order ${itemMessage.orderId}`);
        
        // Check if item has already been processed (idempotency)
        const existingItem = await dynamoDB.send(new GetCommand({
            TableName: process.env.ORDER_ITEMS_TABLE_NAME as string,
            Key: {
                orderId: itemMessage.orderId,
                itemId: itemMessage.itemId
            }
        }));

        if (existingItem.Item && existingItem.Item.itemStatus === 'PROCESSED') {
            logger.info(`Item ${itemMessage.itemId} already processed, skipping`);
            return;
        }

        if (existingItem.Item && existingItem.Item.itemStatus === 'FAILED') {
            logger.info(`Item ${itemMessage.itemId} already failed, skipping`);
            return;
        }
        
        // Process the item (this may throw an error to trigger retries)
        await processOrderItem(itemMessage);
        
        // If processing succeeds, update the item status
        await updateItemStatus(itemMessage.orderId, itemMessage.itemId, 'PROCESSED');

        // in a real application, we'd probably want to update the order status too
        // we're not doing that here because we're simulating failures to demonstrate retries and DLQ
        // so the full order will never be completed
        
        logger.info(`Item ${itemMessage.itemId} processed successfully`);
        
    } catch (error) {
        logger.error(`Failed to process record ${record.messageId}:`, error instanceof Error ? error : String(error));
        
        // Re-throw the error to trigger SQS retry mechanism
        // After maxReceiveCount retries, the message will be moved to DLQ
        throw error;
    }
};

export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
    logger.info(`Processing ${event.Records.length} messages`);
    
    // Process all records - with batchSize: 1, each message is processed individually
    await Promise.all(
        event.Records.map(record => processRecord(record))
    );
    
    logger.info(`Successfully processed all ${event.Records.length} messages`);
};
