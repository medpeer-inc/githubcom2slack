# githubcom2slack

It trigger when someone mentions you on GitHub, automatically sending you a direct message on Slack with someone's comment and GitHub comment link.

## What's the purpose

It makes communication go smoothly with GitHub.com and Slack.

This project uses serverless framework to build an API Gateway + Lambda.

## Preparation

* setup Nodejs 8.10.0
  * [nodenv](https://github.com/nodenv/nodenv)

* Install serverless framework
  ```bash
  npm install -g serverless
  ```

* Install all dependencies for this project
  ```bash
  npm install
  ```

* Install yaml_vault to encrypt secrets.yml
  ```bash
  bundle install -j4 --path vendor/bundle
  ```

* Install direnv
  This is recommended, but please adopt it if there is another way.
  ```bash
  echo -n 'export AWS_ACCESS_KEY_ID=HOGEFUGA' >> .envrc
  echo -n 'export AWS_SECRET_ACCESS_KEY=BUDOUBAR' >> .envrc
  direnv allow .
  ```

## Create GitHub Webhook

Create Github Webhook with a webhook secret.

You like to trigger the webhook events.

ex.

* Commit comments
* Issue Commit
* Pull requests
* Pull request reviews
* Pull request review comments

### Create AWS KMS Key

```bash
aws kms create-key

{
    "KeyMetadata": {
        "AWSAccountId": "123456789012",
        "KeyId": "yyyyyyyyyyyyyyyyyyyyyyyy",
        "Arn": "arn:aws:kms:ap-northeast-1:xxxxxxxxxxx:key/yyyyyyyyyyyyyyyyyyyyyyyy",
        "CreationDate": 1549615619.872,
        "Enabled": true,
        "Description": "",
        "KeyUsage": "ENCRYPT_DECRYPT",
        "KeyState": "Enabled",
        "Origin": "AWS_KMS",
        "KeyManager": "CUSTOMER"
    }
}
```

Create a alias of key

```bash
aws kms create-alias \
	--alias-name alias/github2slack \
	--target-key-id yyyyyyyyyyyyyyyyyyyyyyyy
```

## Encrypt GitHub Webhook Secret

Set your parametes and use aws-cli to encrypt parameters.

```bash
aws kms encrypt \
  --key-id <AWS_KMS_KEY_ARN> \
  --plaintext "<GITHUB_WEBHOOK_SECRET>" \
  --query 'CiphertextBlob' \
  --output text
```

```bash
aws kms encrypt \
  --key-id <AWS_KMS_KEY_ARN> \
  --plaintext "<SLACK_INCONMING_WEBHOOK_URL>" \
  --query 'CiphertextBlob' \
  --output text
```

* secrets.yml

```
GITHUB_WEBHOOK_SECRET_ENCRYPTED: hogehoge...
SLACK_INCONMING_WEBHOOK_URL_ENCRYPTED: mogemoge....
AWS_KMS_KEY_ARN: arn:aws:kms:ap-northeast-1:123456789012:key/yyyyyyyyyyyyyyyyyyyyyyyy
```

## Encrypt/Decrypt by using yaml_vault

The Users having the permission of Administrator is able to execute yaml_vault with the KMS Key.

### Encrypt secrets.yml

```bash
env \
  AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
  AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
bundle exec yaml_vault encrypt \
  --cryptor=aws-kms \
  --aws-region=ap-northeast-1 \
  --aws-kms-key-id=alias/githubcom2slack \
  secrets.yml -o secrets.yml.enc
```

### Decrypt secrets.yml.enc

```bash
env \
  AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
  AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
bundle exec yaml_vault decrypt \
  --cryptor=aws-kms \
  --aws-region=ap-northeast-1 \
  --aws-kms-key-id=alias/githubcom2slack \
  secrets.yml.enc -o secrets.yml
```

## Deploy

```bash
env \
  AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
  AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
bundle exec yaml_vault decrypt \
  --cryptor=aws-kms \
  --aws-region=ap-northeast-1 \
  --aws-kms-key-id=alias/githubcom2slack \
  secrets.yml.enc -o secrets.yml

sls deploy -v
```

## Show Endpoint

```bash
sls info

Service Information
service: githubwebhook2slack
stage: production
region: ap-northeast-1
api keys:
  None
endpoints:
  POST - https://xxxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/production/webhook
functions:
  githubWebhookListener: githubwebhook2slack-production-githubWebhookListener
```

Thanks.
