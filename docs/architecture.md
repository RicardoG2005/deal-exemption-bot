# Architecture Notes

## Why n8n?

The team already used n8n for other automations. Using it here meant:
- No new infra to manage
- Visual workflow editor for non-engineering stakeholders to understand the flow
- Built-in credential management for Slack, HubSpot, and Anthropic
- Easy retry/error handling at the node level

## The 3-Second Problem

Slack requires an HTTP 200 response within 3 seconds of any slash command or block_action event. This is strict — Slack shows an error to the user if you miss it.

The bot's core operations (HubSpot API call + Claude API call) together take 4-8 seconds. This means you **cannot** do the work synchronously in the same workflow that receives the Slack event.

**Solution: Two-stage async dispatch**

```
Slack event
    │
    ▼
[Router Workflow]  ←── This must respond in < 3s
    │
    ├── 1. ACK Slack immediately (respondToWebhook node, empty body)
    │
    └── 2. Trigger [Intake Handler] with waitForSubWorkflow: false
              │
              └── Intake Handler runs independently, takes as long as needed
```

The `waitForSubWorkflow: false` flag is critical. Without it, the Router would block waiting for the sub-workflow to finish — hitting the 3s limit every time.

## Slack's Two Webhook URLs

Slack separates event delivery into two categories, each with its own URL config:

| Category | Where to configure |
|---|---|
| Slash commands | App settings → Slash Commands → each command has its own Request URL |
| All interactive components (buttons, modals, select menus) | App settings → Interactivity & Shortcuts → Request URL |

Both must point to the same n8n webhook endpoint. Missing the Interactivity URL means button clicks are silently dropped — no error, no delivery, the Router never sees them.

## Modal State Machine

```
trigger_id (from slash command event)
    │
    ▼
views.open  ──► Loading modal (immediate)
    │
    ├── [HubSpot query runs]
    ├── [Claude runs if typo detected]
    │
    ▼
views.update ──► Real form modal  (OR "Did you mean?" modal)
    │
    ▼
views_submission event (user submits form)
    │
    ▼
Card Builder AI runs
    │
    ▼
chat.postMessage to deal desk channel
```

Important: `trigger_id` expires after 3 seconds and can only be used **once** for `views.open`. Store the `view_id` from the `views.open` response to use with `views.update` later.

## Claude Integration

Two separate Claude calls in the flow:

### 1. Typo Correction (fast, claude-3-haiku)
- Input: user's search string + list of company names from HubSpot
- Output: `{ bestMatch, confidence, suggestions[] }`
- Only runs if no exact/close match found via HubSpot search

### 2. Card Generation (claude-3-5-sonnet)
- Input: full form submission data + deal context from HubSpot
- Output: structured JSON with `verifiedAccountName`, `riskAssessment`, `recommendation`
- Generates a human-readable summary for the approver

Both calls use structured output (JSON mode) so n8n can parse them without regex.

## HubSpot API Patterns

### Company Search
```
POST /crm/v3/objects/companies/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "name",
      "operator": "CONTAINS_TOKEN",
      "value": "{{searchTerm}}"
    }]
  }],
  "properties": ["name", "hs_object_id"]
}
```

### Fetch Associated Deals
```
POST /crm/v1/associations/companies/deals/batch/read
{ "inputs": [{ "id": "{{companyId}}" }] }
```

**Important:** This returns ALL deals, including closed-won and closed-lost. Filter by `dealstage` before showing to the user.

### Update Deal on Approval
```
PATCH /crm/v3/objects/deals/{{dealId}}
{ "properties": { "deal_exemption_approved": "true", "approved_discount": "{{discount}}" } }
```
