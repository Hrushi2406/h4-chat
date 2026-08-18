# WhatsApp Channel

This document is the durable product and engineering record for Sakhi's WhatsApp channel. The delivery tracker is [GitHub issue #16](https://github.com/Hrushi2406/h4-chat/issues/16). The architecture decision is recorded in [ADR 0001](./adr/0001-use-meta-cloud-api-for-whatsapp-channel.md).

## Product outcome

People can use Sakhi through one shared official WhatsApp Business number with the same account, credits, conversations, memories, Helpers, Connected Apps, tools, generated artifacts, and scheduled work available on the web. WhatsApp is an additional channel, not a separate assistant or billing system.

The first release is tested privately and then made available to everyone. It does not use a public allowlist or gradual public rollout.

## Account and consent

- A first-time phone number receives a versioned consent message with **Continue** and **Exit** controls before an account is created or AI work runs.
- Continue creates a free Sakhi Account and grants the current welcome-credit amount exactly once. Exit records the decision and performs no AI work.
- `STOP` opts the number out. `START` resumes it without granting another welcome balance.
- An existing web user can connect WhatsApp from Settings using a short-lived, one-time QR/deep link and confirmation message.
- If a WhatsApp-only user later signs into the web, the identities merge: history and purchased credits are preserved and welcome credits are never duplicated.
- Sakhi may auto-link only when one unambiguous account already owns a verified phone number. Established web identities, conflicting verified numbers, or dual paid balances require support review; Sakhi must not silently reassign them.
- Disconnecting WhatsApp stops channel access without deleting the Sakhi Account or its history. Verified erasure remains a support-assisted operation; there is no `/delete` command.

## Conversations

- WhatsApp-created conversations are normal Sakhi Threads and appear on the web after it next fetches data. No live cross-channel listener is required, and simultaneous web and WhatsApp writes to the same Thread are unsupported in v1.
- Replies return to the channel that submitted the message. A web message is not mirrored to WhatsApp, and a WhatsApp message is not pushed into an already-open web view.
- `/new` and a **New chat** help action start a fresh Thread. Four hours of inactivity also starts a fresh Thread; older Threads remain available on the web.
- Rapid inbound messages from one number execute sequentially. `/cancel` asks the active run to stop and prevents queued work from starting where possible.
- `/model` selects Sakhi 1 or Sakhi 1 Pro for the current account. Sakhi 1 remains the default.

## Supported content

- Inbound: text, images with captions, PDFs, supported documents, and voice notes.
- Voice notes are limited to four minutes. Sakhi stores the original audio and transcript, uses OpenAI `gpt-4o-transcribe` with automatic language detection, and replies in text.
- Launch QA covers English, Hindi, Hinglish, and Marathi. A successful transcription consumes additional Sakhi credits; a failed transcription is not charged.
- Unsupported stickers, contacts, locations, reactions, and videos receive a clear response explaining supported alternatives.
- Generated images and files are returned as native WhatsApp media when supported; otherwise Sakhi sends a short-lived secure download link.

## Sakhi capabilities on WhatsApp

- The channel uses the same billing, model policy, recent context, memories, Helpers, Connected Apps, and tool execution as the web.
- A WhatsApp-only user can authorize a Connected App from a short-lived secure link without first creating separate web credentials. After authorization, Sakhi resumes the pending task.
- When a WhatsApp request clearly asks Sakhi to send or change something, Sakhi executes the relevant tool directly. It asks only when required details such as the recipient or message are missing and reports the real result conversationally.
- Sakhi can use model-authored native reply buttons for useful 2-3 option choices or genuine confirmation, and can deliver tool-returned images, documents, and audio as native WhatsApp media with the URL retained as a fallback.
- The existing outbound WhatsApp Connected App remains separate from this inbound Sakhi channel.

## Long-running work and delivery UX

- Sakhi marks inbound messages read and shows a typing indicator.
- During noticeable Connected App or MCP work, Sakhi sends short, concrete progress updates authored inside the same model tool loop. External operations are held until `send_whatsapp_update` delivers the model-written update, then execute immediately. Updates are deduplicated and capped; there is no second generation call or hardcoded status-message map.
- The model-authored final answer is stored in the Thread and sent to WhatsApp.
- Delivery records Meta message IDs and status callbacks. Duplicate inbound webhook deliveries are ignored. Retryable outbound failures expose a **Retry** action; permanent failures are recorded clearly.
- Per-number cooldowns, opt-out state, and an administrative block flag protect the service from abuse.

## Credits and recovery

- `/credits` displays the current balance. Existing low-credit thresholds remain: warning at 20% and critical at 5%.
- At zero credits, WhatsApp offers purchase/plan controls rather than starting work.
- Recharge confirmation is sent to WhatsApp. After a successful recharge, the user can explicitly retry the last unprocessed message; it is not silently replayed.

## Scheduled work

- Scheduled tasks created on WhatsApp default to `notifyOnWhatsApp: true`.
- Existing tasks and tasks created on the web default to `false`; the web form offers an explicit WhatsApp notification switch.
- A successful scheduled run sends a WhatsApp notification only when the user is still inside Meta's 24-hour customer-service window. No delayed or template message is sent outside the window in v1.
- Notification delivery is recorded separately. A notification failure does not fail or pause the scheduled task, whose result remains stored as a Sakhi Thread.

## Support, privacy, and retention

- `/support` provides a pre-addressed `support@trysakhi.com` link and a support ID. There is no live-agent handoff in v1.
- Before launch, the Privacy Policy and consent copy explicitly cover phone numbers, WhatsApp messages and media, Meta identifiers and delivery metadata, Meta as a provider/subprocessor, Connected App authorization, retention, opt-out, account merge, and verified erasure.
- Erasure removes the phone mapping, consent and block state, WhatsApp inbox/outbox/status records, stored media/transcripts, Threads, memories, and related account data unless a documented legal-retention exception applies.

## Technical architecture

- Use the direct Meta WhatsApp Cloud API for one Sakhi-owned number. Do not use Twilio for the channel.
- `GET /api/whatsapp/webhook` verifies Meta's challenge. `POST` verifies `X-Hub-Signature-256` against the raw body, persists/deduplicates events by Meta message ID, schedules work with Next.js `after()`, and returns `200` immediately.
- WhatsApp processing uses the Node.js runtime with `maxDuration = 600`. Expected tasks usually finish within two to three minutes.
- WhatsApp must not use QStash. This v1 accepts best-effort background execution within Vercel rather than adding a durable job system.
- External calls are bounded by timeouts. The processing record makes partial state visible and safe to retry manually.
- Server-side Firestore transactions protect claims, account merge operations, credit charges, sequential per-number processing, and message persistence.
- Meta delivery callbacks are stored as append-only `whatsappOutboxStatusEvents` records. Successful status timestamps merge independently into the outbox record so simultaneous sent, delivered, and read callbacks do not contend on one transaction.
- Extract a reusable server conversation runner rather than calling the browser-oriented streaming `/api/chat` route.
- Required configuration includes `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and the existing OpenAI and Firebase server credentials.

## Explicit v1 exclusions

- No QStash for inbound WhatsApp work.
- No live web listener or guaranteed simultaneous web/WhatsApp editing of one Thread.
- No audio responses.
- No proactive template notifications outside Meta's 24-hour service window.
- No user-owned WhatsApp numbers, Twilio channel implementation, or live human support handoff.
- No self-service deletion command.

## Verification gates

- Signed Meta webhook end-to-end tests use fakes only at external boundaries.
- Companion tests cover account linking/merge and scheduled-task notification defaults.
- Unit tests cover signature verification, payload parsing, deduplication, consent, session rollover, credit/transcription charging, and status handling.
- Integration tests cover inbound text/media/voice, direct tool execution, Connected App resume, recharge retry, and automation notification behavior.
- Browser validation covers Settings connection/merge/disconnect and scheduled-task notification controls.
- Production launch requires Meta test-number validation, updated privacy/consent text, monitoring, operational runbooks, and an explicit launch checklist.
