# Slack App Setup Guide

## 1. Create the App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it something like "Deal Desk Bot"
4. Select your workspace

## 2. Add OAuth Scopes

Under **OAuth & Permissions → Scopes → Bot Token Scopes**, add:

| Scope | Why |
|---|---|
| `commands` | Receive slash command events |
| `chat:write` | Post messages and approval cards |
| `chat:write.public` | Post to channels the bot isn't a member of |
| `views:open` | Open modal dialogs |
| `views:update` | Update/replace modal content |
| `users:read` | Look up user info by ID |

## 3. Configure the Slash Command

Under **Slash Commands → Create New Command**:

| Field | Value |
|---|---|
| Command | `/deal-ex` (or your preferred name) |
| Request URL | `https://YOUR_N8N_INSTANCE/webhook/YOUR_WEBHOOK_PATH` |
| Short Description | Submit a deal exemption request |
| Usage Hint | `[company name]` |

## 4. Configure Interactivity

> ⚠️ **This is the most commonly missed step.**

Under **Interactivity & Shortcuts**:
1. Toggle **Interactivity** ON
2. Set **Request URL** to the **same URL** as your slash command

Without this, all button clicks and modal submissions are silently dropped. The slash command works but nothing interactive does.

## 5. Install to Workspace

Under **OAuth & Permissions → Install App**, click **Install to Workspace**.

Copy the **Bot User OAuth Token** (starts with `xoxb-`) — this goes in your `SLACK_BOT_TOKEN` env var.

## 6. Add Bot to Channel

The bot must be a member of the deal desk channel to post there:

```
/invite @YourBotName
```

## Testing the Setup

Test slash command:
```
/deal-ex acme corp
```

Expected flow:
1. Loading modal appears immediately
2. Modal updates with deal list or typo suggestions within ~5 seconds
3. After form submit, approval card appears in deal desk channel
