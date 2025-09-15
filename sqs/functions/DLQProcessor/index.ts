import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
const logger = new Logger({ serviceName: 'orderProcessor' });

// Update item status to failed in DynamoDB
const updateItemStatusToFailed = async (orderId: string, itemId: string): Promise<void> => {
    try {
        logger.error(`Updating item ${itemId} status to: FAILED`);
        
        // Update the item status to FAILED
        await dynamoDB.send(new UpdateCommand({
            TableName: process.env.ORDER_ITEMS_TABLE_NAME as string,
            Key: {
                orderId,
                itemId
            },
            UpdateExpression: 'SET itemStatus = :status, failedAt = :failedAt',
            ExpressionAttributeValues: {
                ':status': 'FAILED',
                ':failedAt': new Date().toISOString()
            }
        }));

        logger.info(`Successfully updated item ${itemId} to status: FAILED`);
        
    } catch (error) {
        logger.error(`Failed to update item status to FAILED for ${itemId}:`, error instanceof Error ? error : String(error));
        throw error;
    }
};

// Process failed items from the dead letter queue
const processFailedItem = async (itemMessage: OrderItemMessage): Promise<void> => {
    logger.info(`Processing failed item ${itemMessage.itemId} on order ${itemMessage.orderId} from DLQ`);
    
    // In a real implementation, you might:
    // 1. Send notifications to administrators
    // 2. Log to a separate error tracking system
    // 3. Attempt alternative processing methods
    
    try {
        // Mark the item as failed in DynamoDB
        await updateItemStatusToFailed(itemMessage.orderId, itemMessage.itemId);
        
        // in a real application, we'd probably want to update the order status too but we're not doing that here
        
        logger.error(`Item ${itemMessage.itemId} on order ${itemMessage.orderId} failed after maximum retries`);
        logger.info(`Item details:`, {
            orderId: itemMessage.orderId,
            userId: itemMessage.userId,
            itemDetail: itemMessage.itemDetail,
            quantity: itemMessage.quantity,
            price: itemMessage.price,
            timestamp: itemMessage.timestamp
        });
        
        // You might typically also send notifications or alerts here
        logger.info(`Item ${itemMessage.itemId} on order ${itemMessage.orderId} marked as FAILED and logged for manual review`);
        
    } catch (error) {
        logger.error(`Failed to process DLQ message for item ${itemMessage.itemId}:`, error instanceof Error ? error : String(error));
    }
};

// Process a single DLQ record
const processDLQRecord = async (record: SQSRecord): Promise<void> => {
    try {
        const itemMessage: OrderItemMessage = JSON.parse(record.body);
        logger.info(`Processing DLQ message for item ${itemMessage.itemId} on order ${itemMessage.orderId}`);
        
        await processFailedItem(itemMessage);
        
        logger.info(`DLQ message for item ${itemMessage.itemId} on order ${itemMessage.orderId} processed successfully`);
        
    } catch (error) {
        logger.error(`Failed to process DLQ record ${record.messageId}:`, error instanceof Error ? error : String(error));
    }
};

export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
    logger.info(`Processing ${event.Records.length} DLQ messages`);
    
    // Process all DLQ messages
    await Promise.allSettled(
        event.Records.map(record => processDLQRecord(record))
    );
    
    logger.info(`DLQ processing complete for ${event.Records.length} messages`);
};