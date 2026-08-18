/**
 * Deal Exemption Handler Workflow — approval / denial processing
 *
 * Triggered when an approver clicks Approve or Deny on the exemption card.
 * Validates the approver, notifies the submitter, and updates HubSpot.
 */


// ─── Node: "Parse Approval Button" ───────────────────────────────────────────
//
// Extracts action data from the button click payload.
// Guards against non-approvers acting on the card — only users in
// APPROVER_SLACK_ID can approve or deny. Others get a private ephemeral error.

const payload = $json.payload;
const action = payload.actions[0];
const actionUserId = payload.user.id;
const isApproval = action.action_id === 'deal_exemption_approve';

const allowedApprovers = [process.env.APPROVER_SLACK_ID];
const isAuthorized = allowedApprovers.includes(actionUserId);

let buttonData;
try {
  buttonData = JSON.parse(action.value);
} catch {
  buttonData = {};
}

return [{
  json: {
    isApproval,
    isAuthorized,
    actionUserId,
    submitterId: buttonData.submitterId,
    dealId: buttonData.dealId,
    accountName: buttonData.accountName,
    discount: buttonData.discount || null,
    messageTs: payload.message?.ts,
    channelId: payload.channel?.id || payload.container?.channel_id,
    triggerId: payload.trigger_id,
  }
}];


// ─── Node: "Build Approval Notification" ─────────────────────────────────────
//
// Thread reply sent to the deal desk channel, notifying the submitter of the decision.
// Tags both the submitter and relevant stakeholders.

const { isApproval, submitterId, accountName, discount, actionUserId } = $json;

const statusEmoji = isApproval ? '✅' : '❌';
const statusText = isApproval ? 'approved' : 'denied';
const discountLine = isApproval && discount
  ? `\n*Approved discount:* ${discount}`
  : '';

const notificationText = [
  `${statusEmoji} <@${submitterId}> — your deal exemption request for *${accountName}* has been *${statusText}* by <@${actionUserId}>.`,
  discountLine,
].filter(Boolean).join('\n');

return [{ json: { text: notificationText } }];


// ─── Node: "Build Updated Card (Post-Decision)" ───────────────────────────────
//
// Replaces the approval buttons with a status banner so the card can't be
// actioned twice. Preserves all original card content, just removes the
// actions block and adds a status section.

const originalBlocks = $('Parse Approval Button').first().json.originalBlocks || [];
const { isApproval, actionUserId, accountName } = $json;

const statusBlock = {
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: isApproval
      ? `✅ *Approved* by <@${actionUserId}>`
      : `❌ *Denied* by <@${actionUserId}>`,
  },
};

// Remove the actions block (last block), add status instead
const updatedBlocks = [
  ...originalBlocks.filter(b => b.type !== 'actions'),
  { type: 'divider' },
  statusBlock,
];

return [{ json: { blocks: updatedBlocks } }];
