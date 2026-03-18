# AWS Deep Dives

This repository will contain a series of examples that will dig into using popular AWS services. Each example will be paired with a blog post on the LocalStack blog. Currently, the only examples are emulating SES and SQS on LocalStack.

## Prerequisites

- A valid [LocalStack for AWS license](https://localstack.cloud/pricing). Your license provides a [`LOCALSTACK_AUTH_TOKEN`](https://docs.localstack.cloud/getting-started/auth-token/) to activate LocalStack.
- [LocalStack CLI](https://docs.localstack.cloud/getting-started/installation/) installed
- LocalStack's AWS CDK wrapper [`cdklocal`](https://github.com/localstack/aws-cdk-local) installed
- LocalStack's AWS CLI wrapper [`awslocal`](https://github.com/localstack/awscli-local) installed
- Node.js and npm installed

Export your auth token before starting:

```bash
export LOCALSTACK_AUTH_TOKEN=<your-auth-token>
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
