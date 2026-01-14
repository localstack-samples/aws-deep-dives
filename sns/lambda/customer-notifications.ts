import { SNSEvent } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({});

interface OrderEvent {
  eventType: string;
  orderId: string;
  userId: string;
  priority: string;
  timestamp: string;
  orderTotal?: number;
  trackingNumber?: string;
  estimatedDelivery?: string;
  reason?: string;
  phoneNumber?: string; // Phone number for SMS notifications
}

export const handler = async (event: SNSEvent): Promise<void> => {
  console.log('Customer Notifications Lambda received event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const message: OrderEvent = JSON.parse(record.Sns.Message);

    console.log('Processing customer notification:', {
      eventType: message.eventType,
      orderId: message.orderId,
      userId: message.userId,
    });

    // Send SMS notifications based on event type
    switch (message.eventType) {
      case 'OrderPlaced':
        await sendOrderConfirmation(message);
        break;
      case 'OrderShipped':
        await sendShippingNotification(message);
        break;
      case 'OrderCancelled':
        await sendCancellationNotification(message);
        break;
      default:
        console.log(`Unhandled event type for customer notifications: ${message.eventType}`);
    }
  }
};

async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  if (!phoneNumber) {
    console.warn('No phone number provided, skipping SMS');
    return;
  }

  try {
    const command = new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message,
    });

    const result = await snsClient.send(command);
    console.log(`SMS sent successfully. MessageId: ${result.MessageId}`);
  } catch (error) {
    console.error(`Failed to send SMS to ${phoneNumber}:`, error);
    throw error;
  }
}

async function sendOrderConfirmation(order: OrderEvent): Promise<void> {
  const phoneNumber = order.phoneNumber || process.env.DEFAULT_PHONE_NUMBER;
  const total = order.orderTotal ? `$${order.orderTotal.toFixed(2)}` : 'N/A';
  const message = `Order Confirmed! Order #${order.orderId} has been placed. Total: ${total}. Thank you for your order!`;

  console.log(`[SMS] Sending order confirmation to ${phoneNumber}`);
  await sendSMS(phoneNumber!, message);
}

async function sendShippingNotification(order: OrderEvent): Promise<void> {
  const phoneNumber = order.phoneNumber || process.env.DEFAULT_PHONE_NUMBER;
  let message = `Your order #${order.orderId} has shipped! It's on its way.`;
  
  if (order.trackingNumber) {
    message += ` Track: ${order.trackingNumber}`;
  }
  if (order.estimatedDelivery) {
    message += ` Est. delivery: ${order.estimatedDelivery}`;
  }

  console.log(`[SMS] Sending shipping notification to ${phoneNumber}`);
  await sendSMS(phoneNumber!, message);
}

async function sendCancellationNotification(order: OrderEvent): Promise<void> {
  const phoneNumber = order.phoneNumber || process.env.DEFAULT_PHONE_NUMBER;
  let message = `We're sorry, your order #${order.orderId} has been cancelled.`;
  
  if (order.reason) {
    message += ` Reason: ${order.reason}`;
  }

  console.log(`[SMS] Sending cancellation notification to ${phoneNumber}`);
  await sendSMS(phoneNumber!, message);
}
