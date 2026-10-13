# AWS Deep Dives

This repository will contain a series of examples that will dig into using popular AWS services. Each example will be paired with a blog post on the LocalStack blog. Currently, the examples emulate SES, SQS and SNS on LocalStack:

- [`ses`](ses): send email through a verified identity with a configuration set and SNS event notifications
- [`sqs`](sqs): a FIFO queue with retries and a dead-letter queue
- [`sns`](sns): fan-out to Lambda subscribers with message filtering

Each example has a `make test` target that checks it works, and CI runs all three on LocalStack.

## Prerequisites

- A valid [LocalStack for AWS license](https://localstack.cloud/pricing). Your license provides a [`LOCALSTACK_AUTH_TOKEN`](https://docs.localstack.cloud/aws/getting-started/auth-token/) to activate LocalStack.
- [`lstk` CLI](https://docs.localstack.cloud/aws/developer-tools/running-localstack/lstk/) installed
- [AWS CLI](https://docs.localstack.cloud/user-guide/integrations/aws-cli/), required by `lstk aws`
- Node.js and npm installed

Export your auth token before starting:

```bash
export LOCALSTACK_AUTH_TOKEN=<your-auth-token>
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
