/**
 * Router Workflow — n8n Code Node: "Parse Slack Payload"
 *
 * Entry point for all Slack events. Handles two event types:
 *   1. Slash commands  (body.command exists)
 *   2. Block actions   (body.payload exists — button clicks, modal submissions)
 *
 * Normalizes both into a single `payload` shape for downstream routing.
 */

const body = $input.first().json.body;

let payload;

if (body.payload) {
  // Block Kit interaction (button click, modal submission, etc.)
  const decoded = decodeURIComponent(body.payload);
  payload = JSON.parse(decoded);
} else if (body.command) {
  // Slash command — normalize into the same shape
  payload = {
    type: 'slash_command',
    callback_id: 'deal_exemption_slash',
    trigger_id: body.trigger_id,
    user: { id: body.user_id },
    channel: { id: body.channel_id },
    text: body.text,
    command: body.command,
  };
}

return [{ json: { payload, body } }];


/**
 * Router Workflow — n8n Code Node: "Is Account Selected"
 *
 * Switch condition: did the user click a "Did you mean?" suggestion button?
 * These buttons have action_id 'deal_exemption_typo_select'.
 *
 * TRUE  → route to Intake Handler with the corrected company name
 * FALSE → continue to slash command handling
 */

const isAccountSelected =
  $json.payload.type === 'block_actions' &&
  $json.payload.actions?.[0]?.action_id === 'deal_exemption_typo_select';

return isAccountSelected;


/**
 * Router Workflow — n8n Code Node: "Build Button Click Payload"
 *
 * When a "Did you mean?" button is clicked, extract the selected company name
 * from the button's value and build the payload for the Intake Handler.
 *
 * The button value is JSON: { "accountName": "Wells Fargo", "searchTerm": "wlls fargo" }
 */

const action = $json.payload.actions[0];
const buttonValue = JSON.parse(action.value);

return [{
  json: {
    accountName: buttonValue.accountName,
    submitterId: $json.payload.user.id,
    triggerId: $json.payload.trigger_id,
    channelId: $json.payload.channel?.id || $json.payload.container?.channel_id,
    searchTerm: buttonValue.searchTerm,
    isSlashCommand: true, // treat button-selected accounts same as slash commands
  }
}];
