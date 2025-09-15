import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { makeIdempotent } from '@aws-lambda-powertools/idempotency';
import { DynamoDBPersistenceLayer } from '@aws-lambda-powertools/idempotency/dynamodb';
import type { Context, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';

interface OrderItem {
    itemDetail: string;
    quantity: number;
    price: number;
}

interface OrderEvent {
    orderItems: OrderItem[];
    orderId: string;
    userId: string;
    orderStatus: string;
}

const dynamoDBClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoDBClient);
const sqs = new SQSClient({});
const persistenceStore = new DynamoDBPersistenceLayer({
    tableName: process.env.IDEMPOTENCY_TABLE_NAME as string,
});
const logger = new Logger({ serviceName: 'orderManager' });


const addOrderToDatabase = async (orderId: string, userId: string, items: OrderItem[], orderStatus: string) => {
    const timestamp = new Date().toISOString();
    let orderItemRecords: any[] = [];
    
    try {
        // Store the order record
        const orderRecord = {
            orderId,
            userId,
            orderStatus,
            timestamp,
            totalItems: items.length,
            totalValue: items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
        };

        // Store individual order items
        orderItemRecords = items.map((item, index) => ({
            orderId,
            itemId: `${orderId}-item-${index}`, // Create unique item ID
            itemDetail: item.itemDetail,
            quantity: item.quantity,
            price: item.price,
            itemStatus: 'PENDING',
            timestamp
        }));

        // Store the order
        await dynamoDB.send(new PutCommand({
            TableName: 'OrdersTable',
            Item: orderRecord
        }));

        // Store the order items in batch
        const batchItems = orderItemRecords.map(item => ({
            PutRequest: { Item: item }
        }));
        await dynamoDB.send(new BatchWriteCommand({
            RequestItems: {
                'OrderItemsTable': batchItems
            }
        }))
    } catch (error) {
        logger.error(`Failed to add order to database:`, error instanceof Error ? error : String(error));
        throw error;
    }

    return orderItemRecords;
};

export const handler = makeIdempotent(
    async (event: OrderEvent, _context: Context): Promise<APIGatewayProxyResult> => {
        const orderItems = event.orderItems;
        const orderId = event.orderId;
        const userId = event.userId;
        const orderStatus = event.orderStatus;

        // a real world application would probably process payment here
        // but for this example we'll just add the order to the database
        const orderItemRecords = await addOrderToDatabase(orderId, userId, orderItems, orderStatus);

        logger.info(`Adding order items to DynamoDB for order ${orderId}`);
        logger.info(`Order items: ${JSON.stringify(orderItems)}`);
        

        // Send each item as a separate message for individual processing
        const messagePromises = orderItemRecords.map((itemMessage, index) => 
            sqs.send(new SendMessageCommand({
                QueueUrl: process.env.ORDERS_FIFO_QUEUE_URL as string,
                MessageBody: JSON.stringify(itemMessage),
                MessageGroupId: itemMessage.orderId,
                MessageDeduplicationId: `${itemMessage.itemId}-${Date.now()}-${index}`,
            }))
        );

        await Promise.all(messagePromises);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Orders processed successfully' })
        };
    }, {
        persistenceStore,
});