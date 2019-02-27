'use strict'

const crypto = require('crypto')
const https = require('https')
const url = require('url')
const AWS = require('aws-sdk')

const kms = new AWS.KMS({ region: 'ap-northeast-1' })
const encrypted = {
  github_webhook_secret: process.env.GITHUB_WEBHOOK_SECRET_ENCRYPTED,
  slack_incoming_webhook_url: process.env.SLACK_INCONMING_WEBHOOK_URL_ENCRYPTED
}
let decrypted = {}

// 通知許可している github event
const allowActions = [
  'issue_comment',
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment'
]

// github username : slack username
const git2slackNames = {
  'kenzo0107': 'kenzo.tanaka',
}

// slack DM 拒否ユーザリスト
const denySlackDmUsers = [
  'orehayamete'
]

function signRequestBody (key, body) {
  return `sha1=${crypto.createHmac('sha1', key).update(body, 'utf-8').digest('hex')}`
}

function postMessage (message, callback) {
  const body = JSON.stringify(message)
  const options = url.parse('https://' + decrypted.slack_incoming_webhook_url)
  options.method = 'POST'
  options.headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }

  const postReq = https.request(options, (res) => {
    const chunks = []
    res.setEncoding('utf8')
    res.on('data', (chunk) => chunks.push(chunk))
    res.on('end', () => {
      if (callback) {
        console.error({
          body: chunks.join(''),
          statusCode: res.statusCode,
          statusMessage: res.statusMessage
        })
      }
    })
    return res
  })

  postReq.write(body)
  postReq.end()
}

function sendSlackDM (channel, message, callback) {
  const slackMessage = {
    channel: channel,
    text: `${message}`,
    username: `${process.env.SLACK_USERNAME}`,
    icon_emoji: `${process.env.SLACK_ICON}`
  }

  postMessage(slackMessage, (response) => {
    if (response.statusCode < 400) {
      console.info('Message posted successfully')
      callback(null)
    } else if (response.statusCode < 500) {
      console.error(`Error posting message to Slack API: ${response.statusCode} - ${response.statusMessage}`)
      callback(null)
    } else {
      console.error(`Server error when processing message: ${response.statusCode} - ${response.statusMessage}`)
    }
  })
}

function extractUsernameFromMessage (message) {
  let usernames = []
  let usernameCandidates = message.match(/@[a-zA-Z0-9-]+/g)
  if (!usernameCandidates) {
    return usernames
  }

  for (let i in usernameCandidates) {
    var u = usernameCandidates[i].replace('@', '')
    if (denySlackDmUsers.indexOf(u) > -1) {
      continue
    }
    if (git2slackNames[u]) {
      usernames.push(`@${git2slackNames[u]}`)
    }

    // github username と slack username に命名規則があれば、
    // ここで変換 git --> slack username へ変更するも良し
  }
  return usernames
}

function processEvent (event, context, callback) {
  console.log('event.body', event.body)
  const body = JSON.parse(event.body)
  if (['deleted', 'closed'].indexOf(body.action) > -1) {
    console.log(`No target acction: ${body.action}`)
    return
  }

  const headers = event.headers
  const githubEvent = headers['X-GitHub-Event']
  if (allowActions.indexOf(githubEvent) < 0) {
    console.log(`No target githubEvent: ${githubEvent}`)
    return
  }

  const sig = headers['X-Hub-Signature']
  const id = headers['X-GitHub-Delivery']
  const calculatedSig = signRequestBody(decrypted.github_webhook_secret, event.body)

  if (typeof decrypted.github_webhook_secret !== 'string') {
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Must provide a \'GITHUB_WEBHOOK_SECRET\' env variable'
    })
  }

  if (!sig) {
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: 'No X-Hub-Signature found on request'
    })
  }

  if (!githubEvent) {
    return callback(null, {
      statusCode: 422,
      headers: { 'Content-Type': 'text/plain' },
      body: 'No X-Github-Event found on request'
    })
  }

  if (!id) {
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: 'No X-Github-Delivery found on request'
    })
  }

  if (sig !== calculatedSig) {
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: 'X-Hub-Signature incorrect. Github webhook token doesn\'t match'
    })
  }

  console.log(`Github-Event: "${githubEvent}" with action: "${body.action}"`)

  let title
  let comment
  let usernames
  let htmlUrl
  let commentUser
  let commentUsers
  let message

  switch (githubEvent) {
    case 'issue_comment':
      comment = body.comment.body || body.issue.body
      usernames = extractUsernameFromMessage(comment)

      if (usernames.length === 0) {
        return
      }

      title = body.issue.title
      htmlUrl = body.comment.html_url
      commentUser = body.comment.user.login

      // コメントしたユーザ取得
      commentUsers = extractUsernameFromMessage(`@${commentUser}`)

      if (commentUsers !== null && commentUsers.length > 0) {
        commentUser = `\`${commentUser}\` (${commentUsers[0]})`
      }

      message = `:git: *${title}* ${htmlUrl} \n${commentUser}'s comment: \`\`\`${comment}\`\`\` `

      for (let i in usernames) {
        sendSlackDM(usernames[i], message, callback)
      }
      break

    case 'pull_request_review_comment':
      comment = body.comment.body
      usernames = extractUsernameFromMessage(comment)

      if (usernames.length === 0) {
        return
      }

      title = body.pull_request.title
      htmlUrl = body.comment.html_url
      commentUser = body.comment.user.login

      // コメントしたユーザ取得
      commentUsers = extractUsernameFromMessage(`@${commentUser}`)
      if (commentUsers !== null && commentUsers.length > 0) {
        commentUser = `\`${commentUser}\` (${commentUsers[0]})`
      }
      message = `:git: *${title}* ${htmlUrl} \n${commentUser}'s comment: \`\`\`${comment}\`\`\` `

      for (let i in usernames) {
        sendSlackDM(usernames[i], message, callback)
      }
      break

    case 'pull_request':
      comment = body.pull_request.body
      usernames = extractUsernameFromMessage(comment)
      if (usernames.length === 0) {
        return
      }

      title = body.pull_request.title
      htmlUrl = body.pull_request.html_url
      commentUser = body.pull_request.user.login
      commentUsers = extractUsernameFromMessage(`@${commentUser}`)
      if (commentUsers !== null && commentUsers.length > 0) {
        commentUser = `\`${commentUser}\` (${commentUsers[0]})`
      }
      message = `:git: *${title}* ${htmlUrl} \n${commentUser}'s comment: \`\`\`${comment}\`\`\` `

      for (let i in usernames) {
        sendSlackDM(usernames[i], message, callback)
      }
      break
  }

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      input: event
    })
  }

  return callback(null, response)
}

module.exports.githubWebhookListener = async (event, context, callback) => {
  if (decrypted.github_webhook_secret && decrypted.slack_incoming_webhook_url) {
    processEvent(event, context, callback)
  } else {
    try {
      const p1 = { CiphertextBlob: new Buffer(encrypted.github_webhook_secret, 'base64') }
      const p2 = { CiphertextBlob: new Buffer(encrypted.slack_incoming_webhook_url, 'base64') }
      const d = [await kms.decrypt(p1).promise(), await kms.decrypt(p2).promise()]
      decrypted.github_webhook_secret = d[0].Plaintext.toString('ascii')
      decrypted.slack_incoming_webhook_url = d[1].Plaintext.toString('ascii')
      processEvent(event, context, callback)
    } catch (err) {
      console.log('Decrypt error:', err)
      callback(err)
    }
  }
}
