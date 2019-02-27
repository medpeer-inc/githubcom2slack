# githubcom2slack

## これは何か？

GitHub.com 上でコメントでメンションした相手に Slack DM 通知をする機能を構築する severless framework プロジェクトです。

## 事前準備

* Nodejs 8.10.0
  * [nodenv](https://github.com/nodenv/nodenv) で調整可能です。
  * v8.10.0 は 2019.02 時点 AWS Lambda Nodejs 最新バージョンです。

* serverless framework インストール
  ```bash
  npm install -g serverless
  ```

* aws-sdk インストール
  ```bash
  npm install
  ```

* yaml_vault インストール
  ```bash
  bundle install -j4 --path vendor/bundle
  ```

* direnv インストール  
  こちらはあくまで 1 方法ですので、その他方法があればそちらを採用ください。
  ```bash
  echo -n 'export AWS_ACCESS_KEY_ID=HOGEFUGA' >> .envrc
  echo -n 'export AWS_SECRET_ACCESS_KEY=BUDOUBAR' >> .envrc
  direnv allow .
  ```

## GitHub Webhook 作成

Organization の Webhook を作成します。

|*設定項目*|*内容*|
|---|---|
| Playload URL | 仮設定で良いです (ex. `https://hoge` )。 <br/>後ほど設定します。 |
| Content type | `application/json` |
| Secret | 認証の際に必要なパスワード情報です。<br/>適当なランダム値を設定してください。 |

以下イベントを対象としました。

* Commit comments
* Issue Commit
* Pull requests
* Pull request reviews
* Pull request review comments

### Create AWS KMS Key


* KMS キー作成
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

* キーエイリアス作成
```bash
aws kms create-alias \
	--alias-name alias/github2slack \
	--target-key-id yyyyyyyyyyyyyyyyyyyyyyyy
```

## 秘密情報の暗号化


* GITHUB_WEBHOOK_SECRET の暗号化
```bash
aws kms encrypt \
  --key-id arn:aws:kms:ap-northeast-1:xxxxxxxxxxx:key/yyyyyyyyyyyyyyyyyyyyyyyy \
  --plaintext "<GITHUB_WEBHOOK_SECRET>" \
  --query 'CiphertextBlob' \
  --output text
```

* SLACK_INCONMING_WEBHOOK_URL 暗号化
```bash
aws kms encrypt \
  --key-id arn:aws:kms:ap-northeast-1:xxxxxxxxxxx:key/yyyyyyyyyyyyyyyyyyyyyyyy \
  --plaintext "<SLACK_INCONMING_WEBHOOK_URL>" \
  --query 'CiphertextBlob' \
  --output text
```

上記の値を以下に設定します。

* secrets.yml
```bash
GITHUB_WEBHOOK_SECRET_ENCRYPTED: hogehoge...
SLACK_INCONMING_WEBHOOK_URL_ENCRYPTED: mogemoge....
AWS_KMS_KEY_ARN: arn:aws:kms:ap-northeast-1:xxxxxxxxxxx:key/yyyyyyyyyyyyyyyyyyyyyyyy
```

### secrets.yml 暗号化

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

### secrets.yml.enc 復号

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

## デプロイ

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

## Endpoint 表示

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

はじめに作成した GitHub Webhook の `Playload URL` に
上記 `https://xxxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/production/webhook` を設定してください。

## 試してみる

GitHub.com のプルリクエストでメンションします。

![img1](https://cdn-ak.f.st-hatena.com/images/fotolife/k/kenzo0107/20190227/20190227143042.png)

するとすぐに Slack DM 通知がきます。

![img2](https://cdn-ak.f.st-hatena.com/images/fotolife/k/kenzo0107/20190227/20190227123309.png)

## 通知がこないな、という時に

Lambda のログが CloudWatch Logs に流れてますので、ログを確認してください。

そもそもログが出ていないのであれば、 Webhook の設定忘れや URL に誤りがある等チェックしてみてください。

以上です。
