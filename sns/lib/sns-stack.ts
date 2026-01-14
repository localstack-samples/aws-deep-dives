import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class SnsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the SNS Topic for order events
    const orderEventsTopic = new sns.Topic(this, 'OrderEventsTopic', {
      topicName: 'order-events',
      displayName: 'Events from e-commerce orders',
    });

    // Lambda function defaults
    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
    };

    // 1. Order API Lambda (Publisher)
    const orderApiLambda = new NodejsFunction(this, 'OrderApiLambda', {
      ...lambdaDefaults,
      functionName: 'order-api',
      entry: 'lambda/order-api.ts',
      handler: 'handler',
      environment: {
        SNS_TOPIC_ARN: orderEventsTopic.topicArn,
      },
    });

    // Grant the Order API Lambda permission to publish to the topic
    orderEventsTopic.grantPublish(orderApiLambda);

    // API Gateway for the Order API
    const api = new apigateway.RestApi(this, 'OrderApi', {
      restApiName: 'Order Events API',
      description: 'API for publishing order events to SNS',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Add orders resource with POST method
    const orders = api.root.addResource('orders');
    orders.addMethod('POST', new apigateway.LambdaIntegration(orderApiLambda));

    // Add /orders/{orderId}/events resource for specific order events
    const orderById = orders.addResource('{orderId}');
    const events = orderById.addResource('events');
    events.addMethod('POST', new apigateway.LambdaIntegration(orderApiLambda));

    // 2. Customer Notifications Lambda (Filtered: OrderPlaced, OrderShipped, OrderCancelled)
    const customerNotificationsLambda = new NodejsFunction(this, 'CustomerNotificationsLambda', {
      ...lambdaDefaults,
      functionName: 'customer-notifications',
      entry: path.join(__dirname, '../lambda/customer-notifications.ts'),
      handler: 'handler',
    });

    // Grant permission to send SMS via SNS
    customerNotificationsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sns:Publish'],
        resources: ['*'], // Required for SMS publishing to phone numbers
      })
    );

    orderEventsTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(customerNotificationsLambda, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['OrderPlaced', 'OrderShipped', 'OrderCancelled'],
          }),
        },
      })
    );

    // 3. Analytics Lambda (No filter - receives all events)
    const analyticsLambda = new NodejsFunction(this, 'AnalyticsLambda', {
      ...lambdaDefaults,
      functionName: 'analytics-audit',
      entry: path.join(__dirname, '../lambda/analytics.ts'),
      handler: 'handler',
    });

    orderEventsTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(analyticsLambda)
    );

    // Create SNS Topic for Ops Alerts (email notifications)
    const opsAlertsTopic = new sns.Topic(this, 'OpsAlertsTopic', {
      topicName: 'ops-alerts',
      displayName: 'Operations Team Alerts',
    });

    // Add email subscription for ops team
    opsAlertsTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('ops@foo.com')
    );

    // 4. Operations Alert Lambda (Filtered: OrderDelayed, OrderCancelled with high priority)
    const opsAlertLambda = new NodejsFunction(this, 'OpsAlertLambda', {
      ...lambdaDefaults,
      functionName: 'ops-alerts',
      entry: path.join(__dirname, '../lambda/ops-alerts.ts'),
      handler: 'handler',
      environment: {
        OPS_ALERTS_TOPIC_ARN: opsAlertsTopic.topicArn,
      },
    });

    // Grant permission to publish to ops alerts topic
    opsAlertsTopic.grantPublish(opsAlertLambda);

    orderEventsTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(opsAlertLambda, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['OrderDelayed', 'OrderCancelled'],
          }),
          priority: sns.SubscriptionFilter.stringFilter({
            allowlist: ['high'],
          }),
        },
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: orderEventsTopic.topicArn,
      description: 'SNS Topic ARN for order events',
    });

    new cdk.CfnOutput(this, 'OrderApiLambdaName', {
      value: orderApiLambda.functionName,
      description: 'Order API Lambda function name',
    });
  }
}
