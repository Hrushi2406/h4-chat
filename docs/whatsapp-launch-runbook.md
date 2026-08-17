# WhatsApp launch runbook

This checklist is for the Sakhi-owned Meta WhatsApp Cloud API number. Never paste secret values into an issue, pull request, log, screenshot, or this document.

## Configure the Meta test number

1. In the Meta app, enable WhatsApp and select the test phone number.
2. Set the callback URL to `https://<deployment>/api/whatsapp/webhook`.
3. Set a unique webhook verification token and subscribe to the `messages` field.
4. Add the test recipient numbers in Meta while the app is in development mode.
5. Configure the Vercel Preview environment variables listed in `env.example`.
6. Redeploy Preview so the Function receives the new environment.
7. Complete Meta's webhook challenge and send one signed inbound test message.

## Private validation

- Confirm an unknown number receives Continue/Exit and receives welcome credits once after Continue.
- Confirm STOP suppresses normal work and START resumes without another grant.
- Connect an existing web account from Settings, including expired and replayed link attempts.
- Merge a WhatsApp-first account into a web account; verify Threads, memories, recharge credits, and a single welcome balance.
- Exercise `/new`, the four-hour rollover boundary, `/model`, `/credits`, `/cancel`, `/support`, and Retry.
- Send supported image, PDF/document, and English/Hindi/Hinglish/Marathi voice samples. Reject an Ogg/Opus note over four minutes and unsupported media without an AI charge.
- Run a Connected App task that needs authorization, one that needs explicit confirmation, and an email send that shows progress and a terminal state.
- Create an automation from WhatsApp and confirm notification defaults on; create/edit one on web and confirm the switch defaults off.
- Validate scheduled completion delivery inside the 24-hour service window and no delivery outside it.
- Force duplicate inbound events, duplicate/out-of-order status callbacks, a Meta timeout, a model failure, and an outbound failure.
- Validate cooldown, administrative block, support ID, verified erasure, log redaction, and manual inbox retry.

## Browser validation

- Settings clearly shows disconnected, link-ready, connected, opted-out, expired-link, collision, and disconnected states on mobile and desktop widths.
- The one-time link opens WhatsApp with an exact prefilled `connect` command.
- Refreshing a web Thread shows messages created on WhatsApp; no live simultaneous-channel behavior is promised.
- The automation form exposes **Notify me on WhatsApp**, persists it, and explains the 24-hour restriction.
- Privacy Policy names WhatsApp/Meta data, consent, opt-out, retention, disconnect, and verified erasure.

## Operational checks

- Vercel logs contain Meta message IDs and internal support IDs, but never access tokens, full signed media URLs, raw phone numbers, or message bodies.
- Alert on webhook 5xx, invalid-signature spikes, processing leases older than ten minutes, permanent outbound failures, and transcription/model error-rate changes.
- An operator can distinguish accepted, processing, completed, cancelled, and failed inbox records and can request an explicit user retry.
- Support has a collision/merge procedure and a verified-erasure procedure before public availability.
- Rotate the Meta access token and app secret in Preview once as a rehearsal.

## Launch gate

Move from private testing to public availability only when all validation evidence is attached to GitHub issue #30, the Privacy Policy change is deployed, the official number is approved by Meta, required secrets exist in Production, and the launch owner explicitly approves the checklist. No public allowlist or gradual public rollout is required.
