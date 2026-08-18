/**
 * Card Builder AI Workflow — n8n Code Node: "Build Card Blocks"
 *
 * Receives Claude's structured output after form submission.
 * Assembles a Slack Block Kit approval card and posts it to the deal desk channel.
 *
 * The `text` field (separate from `blocks`) is used for Slack notifications —
 * it appears in push notifications and desktop alerts without being visible
 * in the rendered message. Mentioning the approver here triggers their notification
 * without adding a visible @mention to the card layout.
 */

const agentOutput = $('Claude Card Generator').first().json;
const submitterId = $('Parse Form Submission').first().json.submitterId;
const approverSlackId = process.env.APPROVER_SLACK_ID;

const blocks = [
  {
    type: 'header',
    text: {
      type: 'plain_text',
      text: '🔔 Deal Exemption Request',
    },
  },
  { type: 'divider' },
  {
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: `*Account:*\n${agentOutput.verifiedAccountName}` },
      { type: 'mrkdwn', text: `*Deal:*\n${agentOutput.dealName}` },
      { type: 'mrkdwn', text: `*Requested Discount:*\n${agentOutput.requestedDiscount}` },
      { type: 'mrkdwn', text: `*Submitted by:*\n<@${submitterId}>` },
    ],
  },
  {
    type: 'section',
    text: { type: 'mrkdwn', text: `*Justification:*\n${agentOutput.justification}` },
  },
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*AI Risk Assessment:*\n${agentOutput.riskAssessment}`,
    },
  },
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*AI Recommendation:* ${agentOutput.recommendation}`,
    },
  },
  { type: 'divider' },
  {
    type: 'actions',
    block_id: 'approval_actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Approve' },
        style: 'primary',
        action_id: 'deal_exemption_approve',
        value: JSON.stringify({
          dealId: agentOutput.dealId,
          submitterId,
          accountName: agentOutput.verifiedAccountName,
          discount: agentOutput.requestedDiscount,
        }),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ Deny' },
        style: 'danger',
        action_id: 'deal_exemption_deny',
        value: JSON.stringify({
          dealId: agentOutput.dealId,
          submitterId,
          accountName: agentOutput.verifiedAccountName,
        }),
      },
    ],
  },
];

// `text` triggers Slack notification for the approver without appearing in the card
const notificationText =
  `🔔 Deal Exemption Request — ${agentOutput.verifiedAccountName} <@${approverSlackId}>`;

return [{ json: { blocks, text: notificationText, agentOutput, submitterId } }];
