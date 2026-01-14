import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const snsClient = new SNSClient({});
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

// Valid event types for order lifecycle
type EventType = 'OrderPlaced' | 'OrderShipped' | 'OrderDelayed' | 'OrderCancelled';
type Priority = 'low' | 'medium' | 'high';

interface OrderEvent {
  eventType: EventType;
  orderId: string;
  userId: string;
  priority?: Priority;
  orderTotal?: number;
  items?: Array<{ productId: string; quantity: number; price: number }>;
  reason?: string;
  estimatedDelivery?: string;
  trackingNumber?: string;
  phoneNumber?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');

    // Extract orderId from path if present (for /orders/{orderId}/events endpoint)
    const pathOrderId = event.pathParameters?.orderId;

    const orderEvent: OrderEvent = {
      eventType: body.eventType,
      orderId: pathOrderId || body.orderId || `ORD-${Date.now()}`,
      userId: body.userId || 'anonymous',
      priority: body.priority || 'medium',
      orderTotal: body.orderTotal,
      items: body.items,
      reason: body.reason,
      estimatedDelivery: body.estimatedDelivery,
      trackingNumber: body.trackingNumber,
      phoneNumber: body.phoneNumber,
    };

    // Validate event type
    const validEventTypes: EventType[] = ['OrderPlaced', 'OrderShipped', 'OrderDelayed', 'OrderCancelled'];
    if (!validEventTypes.includes(orderEvent.eventType)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid eventType',
          validTypes: validEventTypes,
        }),
      };
    }

    // Add timestamp to the event
    const messagePayload = {
      ...orderEvent,
      timestamp: new Date().toISOString(),
    };

    // Publish to SNS with message attributes for filtering
    const publishCommand = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: JSON.stringify(messagePayload),
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: orderEvent.eventType,
        },
        priority: {
          DataType: 'String',
          StringValue: orderEvent.priority || 'medium',
        },
      },
    });

    const result = await snsClient.send(publishCommand);

    console.log('Published to SNS:', {
      messageId: result.MessageId,
      eventType: orderEvent.eventType,
      orderId: orderEvent.orderId,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Order event published successfully',
        messageId: result.MessageId,
        event: messagePayload,
      }),
    };
  } catch (error) {
    console.error('Error publishing event:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to publish order event',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
