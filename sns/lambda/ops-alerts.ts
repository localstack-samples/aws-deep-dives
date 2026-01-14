import { SNSEvent } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({});
const OPS_ALERTS_TOPIC_ARN = process.env.OPS_ALERTS_TOPIC_ARN!;

interface OrderEvent {
  eventType: string;
  orderId: string;
  userId: string;
  priority: string;
  timestamp: string;
  reason?: string;
  estimatedDelivery?: string;
}

interface OpsAlert {
  alertType: 'WARNING' | 'CRITICAL';
  title: string;
  orderId: string;
  details: string;
  timestamp: string;
  actionRequired: string;
}

export const handler = async (event: SNSEvent): Promise<void> => {
  console.log('Operations Alert Lambda received event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const message: OrderEvent = JSON.parse(record.Sns.Message);

    console.log('Processing ops alert:', {
      eventType: message.eventType,
      orderId: message.orderId,
      priority: message.priority,
    });

    // This Lambda receives high-priority OrderDelayed and OrderCancelled events
    // due to the SNS filter policy
    const alert = createOpsAlert(message);

    // Send alert to operations team
    await sendOpsAlert(alert);
  }
};

function createOpsAlert(event: OrderEvent): OpsAlert {
  const isDelayed = event.eventType === 'OrderDelayed';

  return {
    alertType: isDelayed ? 'WARNING' : 'CRITICAL',
    title: isDelayed
      ? `High Priority Order Delayed: ${event.orderId}`
      : `High Priority Order Cancelled: ${event.orderId}`,
    orderId: event.orderId,
    details: formatAlertDetails(event),
    timestamp: new Date().toISOString(),
    actionRequired: isDelayed
      ? 'Contact shipping provider and update customer'
      : 'Investigate cancellation reason and follow up with customer',
  };
}

function formatAlertDetails(event: OrderEvent): string {
  const details = [
    `Order ID: ${event.orderId}`,
    `User ID: ${event.userId}`,
    `Event Type: ${event.eventType}`,
    `Priority: ${event.priority}`,
    `Original Timestamp: ${event.timestamp}`,
  ];

  if (event.reason) {
    details.push(`Reason: ${event.reason}`);
  }

  if (event.estimatedDelivery) {
    details.push(`Estimated Delivery: ${event.estimatedDelivery}`);
  }

  return details.join('\n');
}

async function sendOpsAlert(alert: OpsAlert): Promise<void> {
  // Format email message
  const emailSubject = `[${alert.alertType}] ${alert.title}`;
  const emailBody = `
========================================
[${alert.alertType}] OPS ALERT
========================================
Title: ${alert.title}

Details:
${alert.details}

Action Required: ${alert.actionRequired}
Alert Timestamp: ${alert.timestamp}
========================================
  `.trim();

  try {
    const command = new PublishCommand({
      TopicArn: OPS_ALERTS_TOPIC_ARN,
      Subject: emailSubject,
      Message: emailBody,
    });

    const result = await snsClient.send(command);
    console.log(`Ops alert email sent successfully. MessageId: ${result.MessageId}`);
  } catch (error) {
    console.error('Failed to send ops alert email:', error);
    throw error;
  }
}
