# SES LocalStack Setup

This folder contains a Makefile that helps you set up and test Amazon Simple Email Service (SES) using LocalStack for local development.

## Prerequisites

Before using this Makefile, make sure you have:

- LocalStack running locally
- LocalStack's thin AWS CLI wrapper `awslocal` installed
- `jq` command-line JSON processor installed

## Quick Start

To set up SES with a verified email identity, a configuration set and an SNS topic with subscription for bounces, unsubscribes and complaints, run:

```bash
make setup-all
```

## Available Commands

Note that, while you can run each command individually, some commands are dependent on other services existing, so the order you run them is important.

### Setup Commands

- **`make help`** - Shows all available commands
- **`make setup-all`** - Complete setup (recommended)
- **`make create-sns-topic`** - Creates an SNS topic for SES event notifications
- **`make create-config-set`** - Creates the SES configuration set
- **`make setup-event-dest`** - Links SES events to the SNS topic
- **`make verify-email`** - Verifies the sender email identity
- **`make subscribe-topic`** - Subscribes to SNS notifications via email

### Email Sending Commands

- **`make send-email TO_EMAIL=recipient@example.com`** - Send a simple preset text email
- **`make send-html-email TO_EMAIL=recipient@example.com`** - Send a simple preset HTML email
- **`make send-custom-email TO_EMAIL=recipient@example.com SUBJECT="Your Subject" MESSAGE="Your message"`** - Send email with custom content

### Status Command

- **`make status`** - Check the current configuration status

## Configuration

The Makefile uses these default settings (you can modify them at the top of the Makefile):

- **Sender Email**: `brian.rinaldi@localstack.cloud`
- **Configuration Set**: `sample-ses-config-set`
- **SNS Topic**: `ses-events-topic`
- **SNS Notification Email**: `foo@bar.com`
- **Default Subject**: "Test Email from SES"
- **Default Message**: "This is a test email sent via AWS SES on LocalStack using the CLI."

## Example Usage

1. **First-time setup:**

   ```bash
   make setup-all
   ```

2. **Send a test email:**

   ```bash
   make send-email TO_EMAIL=test@example.com
   ```

3. **Send a custom email:**

   ```bash
   make send-custom-email TO_EMAIL=colleague@company.com SUBJECT="Meeting Tomorrow" MESSAGE="Don't forget about our 2pm meeting!"
   ```

## What Each Setup Step Does

1. **SNS Topic Creation**: Creates a topic to receive notifications about email events (bounces, complaints, etc.)
2. **Configuration Set**: Creates a named configuration that groups SES settings together
3. **Event Destination**: Connects email events to the SNS topic so you get notified
4. **Email Verification**: Verifies that you're allowed to send emails from the specified address
5. **SNS Subscription**: Sets up email notifications for SES events

## Notes

- This setup is designed for local development with LocalStack, but the commands are the same for the AWS CLI (just replace `awslocal` with `aws`)
- Email verification happens automatically in LocalStack (no need to click verification links) but to create a similar setup on AWS, you will need to run through the verification process first
- The setup auto-confirms the SNS subscription, but in real AWS you would need to use the confirmation email link
- All AWS resources are created locally and won't affect your real AWS account
