import { SNSEvent } from 'aws-lambda';

interface OrderEvent {
  eventType: string;
  orderId: string;
  userId: string;
  priority: string;
  timestamp: string;
  orderTotal?: number;
  items?: Array<{ productId: string; quantity: number; price: number }>;
  trackingNumber?: string;
  estimatedDelivery?: string;
  reason?: string;
}

interface AnalyticsRecord {
  eventId: string;
  eventType: string;
  orderId: string;
  userId: string;
  timestamp: string;
  receivedAt: string;
  metadata: Record<string, unknown>;
}

export const handler = async (event: SNSEvent): Promise<void> => {
  console.log('Analytics Lambda received event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const snsMessage = record.Sns;
    const orderEvent: OrderEvent = JSON.parse(snsMessage.Message);

    // Create analytics record
    const analyticsRecord: AnalyticsRecord = {
      eventId: snsMessage.MessageId,
      eventType: orderEvent.eventType,
      orderId: orderEvent.orderId,
      userId: orderEvent.userId,
      timestamp: orderEvent.timestamp,
      receivedAt: new Date().toISOString(),
      metadata: {
        priority: orderEvent.priority,
        orderTotal: orderEvent.orderTotal,
        itemCount: orderEvent.items?.length || 0,
        trackingNumber: orderEvent.trackingNumber,
        reason: orderEvent.reason,
      },
    };

    // Log for analytics/auditing purposes
    // In production, this would write to:
    // - DynamoDB for queryable event store
    // - S3 for data lake / long-term storage
    // - Kinesis Firehose for real-time analytics
    // - CloudWatch Metrics for dashboards
    console.log('=== ANALYTICS RECORD ===');
    console.log(JSON.stringify(analyticsRecord, null, 2));

    // Track metrics by event type
    await trackEventMetrics(orderEvent);
  }
};

async function trackEventMetrics(event: OrderEvent): Promise<void> {
  // In production, this would emit CloudWatch custom metrics
  console.log('=== EVENT METRICS ===');
  console.log(`Event Type: ${event.eventType}`);
  console.log(`Order ID: ${event.orderId}`);
  console.log(`User ID: ${event.userId}`);
  console.log(`Priority: ${event.priority}`);

  if (event.orderTotal) {
    console.log(`Order Value: $${event.orderTotal}`);
  }

  if (event.items) {
    const totalItems = event.items.reduce((sum, item) => sum + item.quantity, 0);
    console.log(`Total Items: ${totalItems}`);
  }

  // Simulate writing to analytics pipeline
  console.log('--- Analytics record would be written to data pipeline ---');
}
