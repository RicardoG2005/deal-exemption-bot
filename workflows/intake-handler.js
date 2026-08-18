/**
 * Intake Handler Workflow — core intake orchestration
 *
 * Called by the Router after a slash command or button click.
 * Handles the full flow: loading modal → HubSpot → Claude (if needed) → form modal.
 *
 * Critical constraint: Slack requires an HTTP 200 ACK within 3 seconds.
 * The Router ACKs immediately; this workflow runs asynchronously via
 * n8n's executeWorkflow node with waitForSubWorkflow: false.
 */


// ─── Node: "Build Loading Modal" ────────────────────────────────────────────
//
// Opens an immediate loading modal so the user sees feedback while
// HubSpot + Claude work in the background.

const loadingModal = {
  type: 'modal',
  callback_id: 'deal_exemption_loading',
  title: { type: 'plain_text', text: 'Deal Exemption' },
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':hourglass_flowing_sand: Looking up deals in HubSpot...',
      },
    },
  ],
};

return [{ json: { modal: loadingModal } }];


// ─── Node: "Build Corrected Did You Mean Modal" ──────────────────────────────
//
// Called when Claude returns suggestions (no exact HubSpot match found).
// Presents up to 3 company name suggestions as clickable buttons.
// Buttons carry the corrected name + original search term as JSON values.

const claudeOutput = $('Claude Typo Correction').first().json;
const suggestions = claudeOutput.suggestions || [];
const searchTerm = $('Parse Input').first().json.searchTerm;

const suggestionBlocks = [
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `We couldn't find *"${searchTerm}"* in HubSpot. Did you mean one of these?`,
    },
  },
  { type: 'divider' },
];

suggestions.slice(0, 3).forEach((company) => {
  suggestionBlocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*${company.name}*` },
    accessory: {
      type: 'button',
      text: { type: 'plain_text', text: company.name },
      action_id: 'deal_exemption_typo_select',
      // Value carries both names so the Router knows what the user originally typed
      value: JSON.stringify({ accountName: company.name, searchTerm }),
    },
  });
});

const didYouMeanModal = {
  type: 'modal',
  callback_id: 'deal_exemption_did_you_mean',
  title: { type: 'plain_text', text: 'Did You Mean?' },
  close: { type: 'plain_text', text: 'Cancel' },
  blocks: suggestionBlocks,
};

return [{ json: { view: didYouMeanModal } }];


// ─── Node: "Build Deal Form Modal" ───────────────────────────────────────────
//
// Builds the actual exemption request form once we have confirmed deals.
// Populates a static_select dropdown with the company's open deals from HubSpot.
// Filters out closed-won and closed-lost so reps only see actionable deals.
//
// HubSpot note: The associations batch API returns ALL deals including closed ones.
// Filter here — do NOT rely on the count returned by the associations endpoint.

const deals = $('Fetch HubSpot Deals').all()
  .map(item => item.json)
  .filter(deal => !['closedwon', 'closedlost'].includes(deal.dealstage));

const dealOptions = deals.map(deal => ({
  text: { type: 'plain_text', text: deal.dealname },
  value: deal.hs_object_id,
}));

const accountName = $('Parse Input').first().json.accountName;

const formModal = {
  type: 'modal',
  callback_id: 'deal_exemption_submit',
  title: { type: 'plain_text', text: 'Deal Exemption Request' },
  submit: { type: 'plain_text', text: 'Submit' },
  close: { type: 'plain_text', text: 'Cancel' },
  private_metadata: JSON.stringify({ accountName }),
  blocks: [
    {
      type: 'input',
      block_id: 'deal_select',
      label: { type: 'plain_text', text: 'Deal' },
      element: {
        type: 'static_select',
        action_id: 'deal_id',
        placeholder: { type: 'plain_text', text: 'Select a deal' },
        options: dealOptions,
      },
    },
    {
      type: 'input',
      block_id: 'discount_block',
      label: { type: 'plain_text', text: 'Requested Discount (%)' },
      element: {
        type: 'number_input',
        action_id: 'discount_pct',
        is_decimal_allowed: true,
        min_value: '0',
        max_value: '100',
      },
    },
    {
      type: 'input',
      block_id: 'justification_block',
      label: { type: 'plain_text', text: 'Justification' },
      element: {
        type: 'plain_text_input',
        action_id: 'justification',
        multiline: true,
        placeholder: { type: 'plain_text', text: 'Why is this exemption needed?' },
      },
    },
  ],
};

return [{ json: { view: formModal } }];


// ─── Node: "Build Close Modal View" ──────────────────────────────────────────
//
// Called after an ephemeral message is sent to the user's DM.
// Replaces the loading modal with a dismissible "check below" message.
// Routes through the existing "Update Modal via views.update" node
// (which already has Slack credentials assigned) rather than a new HTTP node.
//
// Why: n8n doesn't auto-assign credentials to newly added HTTP Request nodes,
// even when they're configured identically to existing ones. Routing through
// a known-working node avoids this credential issue entirely.

return [{
  json: {
    view: {
      type: 'modal',
      title: { type: 'plain_text', text: 'Deal Exemption' },
      close: { type: 'plain_text', text: 'Dismiss' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':point_down: Check the message below — we found some suggestions for you.',
          },
        },
      ],
    },
  },
}];
