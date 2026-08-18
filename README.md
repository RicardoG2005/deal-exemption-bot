# Deal Exemption Bot

An AI-powered Slack bot that streamlines the deal exemption request process for sales teams. Built with n8n, Claude AI, HubSpot CRM, and the Slack API.

## What It Does

Sales reps use a Slack slash command to submit deal exemption requests. The bot:

1. **Corrects typos** in company names using Claude AI (e.g., `/deal-ex wlls fargo` → suggests "Wells Fargo")
2. **Pulls live deal data** from HubSpot CRM to populate a modal form
3. **Routes requests** to the appropriate approver via a structured Slack card
4. **Handles approvals/denials** and notifies the original submitter in-thread

No more copying deal IDs from HubSpot or hunting down approvers manually — the whole flow is async and lives inside Slack.

---

## Architecture

```
Slack Slash Command
      │
      ▼
 [Router Workflow]
  ├── Is it a slash command?  ──► [Intake Handler Workflow]
  └── Is it a button click?   ──►   ├── Show loading modal
                                    ├── Query HubSpot for deals
                                    ├── Claude corrects typo (if needed)
                                    ├── Build & open deal form modal
                                    └── On submit → [Card Builder AI]
                                                        │
                                                        ▼
                                               [Approver Card posted]
                                                        │
                                          ┌─────────────┴─────────────┐
                                          ▼                           ▼
                               [Deal Exemption Handler]    [Deal Exemption Handler]
                                    (Approved)                  (Denied)
                                          │                           │
                                          ▼                           ▼
                               Notify submitter                Notify submitter
                               + update HubSpot               + close thread
```

---

## Tech Stack

| Layer | Tool |
|---|---|
| Workflow automation | [n8n](https://n8n.io) (cloud) |
| AI (typo correction + card generation) | [Claude API](https://anthropic.com) (claude-3-5-sonnet) |
| CRM | HubSpot (Deals + Associations APIs) |
| Messaging | Slack API (slash commands, Block Kit modals, `chat.postMessage`) |
| Hosting | n8n cloud |

---

## Workflow Breakdown

The bot is split into **6 interconnected n8n workflows**:

### 1. Router (`router`)
Entry point for all Slack events. Handles both slash commands and Block Kit button interactions. Routes to the correct downstream workflow based on `payload.type`.

Key logic:
```javascript
// Handles both slash commands and block_actions (button clicks)
if (body.payload) {
  const decoded = decodeURIComponent(body.payload);
  payload = JSON.parse(decoded);
} else if (body.command) {
  payload = { type: 'slash_command', ... };
}

// True if a "did you mean?" suggestion button was clicked
const isAccountSelected =
  payload.type === 'block_actions' &&
  payload.actions?.[0]?.action_id === 'deal_exemption_typo_select';
```

> **Note on Slack webhook routing**: Slack has *two separate* URL settings — one for slash commands (under "Slash Commands") and one for all interactive components like button clicks (under "Interactivity & Shortcuts"). Both must point to the same n8n webhook URL.

---

### 2. Intake Handler (`intake-handler`)
Core orchestration workflow. Called by the Router; runs the full intake flow.

**Steps:**
1. ACK Slack's webhook immediately (Slack requires a response within 3 seconds)
2. Open a loading modal via `views.open`
3. Search HubSpot for deals matching the submitted company name
4. If no exact match → call Claude to suggest corrections → show "Did you mean?" modal
5. If match found → fetch all open deals for that company → build the exemption form modal
6. Replace loading modal with the form via `views.update`

**Typo correction prompt (sent to Claude):**
```
You are a company name corrector. The user typed: "{{searchTerm}}"
Here are real company names from our CRM: {{companiesList}}

Return JSON: { "bestMatch": "CompanyName", "confidence": 0.0-1.0, "suggestions": ["Name1", "Name2"] }
Only suggest names with confidence > 0.7. If nothing fits, return bestMatch: null.
```

**ACK pattern (critical for Slack's 3-second limit):**
```javascript
// Workflow 1: ACK immediately, return 200
$respondToWebhook({ body: '' });

// Workflow 2: Spin up async sub-workflow (waitForSubWorkflow: false)
// This is the key — the main workflow exits; sub-workflow runs independently
```

---

### 3. Card Builder AI (`card-builder-ai`)
Called after the user submits the exemption form. Uses Claude to generate a structured approval card.

Claude receives the form data and outputs structured JSON:
```javascript
{
  verifiedAccountName: "Wells Fargo",
  dealName: "Wells Fargo - Enterprise 2026",
  requestedDiscount: "15%",
  justification: "Competitive pressure from Salesforce",
  riskAssessment: "Low — existing 3-year relationship",
  recommendation: "Approve"
}
```

The card is then posted to the deal desk Slack channel using Block Kit with Approve/Deny buttons.

---

### 4. Deal Exemption Handler (`exemption-handler`)
Handles approver button clicks on the card. Validates that only authorized approvers can act, then:
- Posts a threaded reply notifying the submitter
- (On approval) Updates the relevant HubSpot deal property
- Closes the approval card by updating the message blocks

**Approver guard:**
```javascript
const allowedApprovers = [process.env.APPROVER_SLACK_ID];
if (!allowedApprovers.includes(actionUserId)) {
  // Post ephemeral error — only the clicker sees it
  return;
}
```

---

### 5. Renewal List Processor (`renewal-processor`)
Separate utility workflow that cross-references a renewal tracking spreadsheet against HubSpot deals. Flags deals where the contract renewal date is approaching but no renewal deal exists in the CRM.

---

### 6. Drive Organizer (`drive-organizer`)
Keeps Google Drive organized by syncing deal folder names with HubSpot deal names. Runs on a schedule and renames folders when deal names change in HubSpot.

---

## Key Implementation Notes

### Slack Modal Lifecycle
```
views.open  (loading modal)
    │
    ├── HubSpot + Claude run async
    │
views.update (replace with real form OR "did you mean?" suggestions)
    │
    └── User submits → views_submission event → Card Builder AI
```

### Credential Management in n8n
When adding new HTTP Request nodes in n8n that call the Slack API, credentials must be **manually assigned** in the node UI — they are not automatically inherited from similar nodes in the same workflow. Best practice: reuse existing nodes with working credentials rather than adding new ones.

### HubSpot Deal Filtering
The HubSpot Associations API returns **all associated deals**, including closed-won and closed-lost. The form dropdown filters these out to show only open/active deals. Keep this filter consistent across any node that counts or displays deals to avoid mismatches.

---

## Setup

### Prerequisites
- n8n cloud account (or self-hosted instance)
- Slack app with the following permissions:
  - `commands` (slash command)
  - `chat:write`
  - `views:open`, `views:update`
  - `users:read`
- HubSpot private app with CRM read access
- Anthropic API key

### Environment Variables

See [`.env.example`](.env.example) for all required configuration.

### Slack App Configuration

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add a slash command pointing to your n8n webhook URL
3. **Important:** Also set the **Interactivity & Shortcuts** Request URL to the same webhook. This is a separate setting and is required for button clicks to work.
4. Install the app to your workspace

---

## Project Structure

```
.
├── README.md
├── .env.example
├── workflows/
│   ├── router.js              # Payload parsing + routing logic
│   ├── intake-handler.js      # Core intake flow (modal + HubSpot + Claude)
│   ├── card-builder-ai.js     # AI card generation
│   └── exemption-handler.js   # Approval/denial handling
├── docs/
│   ├── architecture.md        # Detailed system design
│   ├── slack-setup.md         # Step-by-step Slack app config
│   └── hubspot-api-notes.md   # HubSpot API quirks and workarounds
└── examples/
    ├── modal-blocks.json       # Example Block Kit modal payload
    └── card-blocks.json        # Example approval card payload
```

---

## What I Learned

- **Slack's 3-second ACK window** requires a specific async dispatch pattern in n8n — the router must respond immediately while a sub-workflow handles the heavy lifting independently.
- **Block Kit modal state machine** — `views.open` → `views.update` → `views_submission` is a strict three-phase lifecycle; any deviation (wrong trigger_id, expired token) silently fails.
- **Two separate Slack webhook URLs** — slash commands and interactive components (buttons, modals) each have their own URL field in Slack app settings. This is not obvious from the docs.
- **Claude for fuzzy matching** — using Claude as a fuzzy company-name corrector is far more robust than Levenshtein distance for real sales data with abbreviations, punctuation differences, and legal entity variations.
- **n8n sub-workflow async** — `waitForSubWorkflow: false` is essential when you need to respond to Slack within 3s but the actual work takes 5-10s.

---

## Author

Ricardo Guardado — [linkedin.com/in/ricardoguardado](https://linkedin.com/in/ricardoguardado) · [github.com/RicardoG2005](https://github.com/RicardoG2005)

Built during an internship at [Lovable](https://lovable.dev) on the Revenue Operations team.
