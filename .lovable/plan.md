

# Fix: WUZAPI not forwarding messages (empty events subscription)

## Root Cause

The WUZAPI server status shows:
```
"events": "",
"webhook": "https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/wuzapi-webhook"
```

The webhook URL is correct, but **events subscription is empty**. The `Subscribe: ["Message"]` parameter is only sent during `session/connect`, but once the session is already authenticated, calling connect again does not re-apply subscriptions. This means the server receives messages but never forwards them to our webhook.

## Fix

### File: `supabase/functions/wuzapi-test-connection/index.ts`

1. **After auto-configuring webhook (line ~273), also subscribe to events**
   - Call `POST /session/subscribe` (or include events in the webhook config body) to ensure `Message` events are forwarded
   - WUZAPI supports setting events via the webhook endpoint: `{ "WebhookURL": "...", "Events": ["Message"] }`

2. **In the `configure_webhook` action (line ~134), include events subscription**
   - Change the webhook body from `{ WebhookURL: url }` to `{ WebhookURL: url, Events: ["Message"] }`

3. **Add a new check in the default status flow**: if `events` is empty and session is connected, automatically re-subscribe to events

### Changes summary

| Location | Change |
|---|---|
| Line ~138 (configure_webhook action) | Add `Events: ["Message"]` to webhook body |
| Line ~276 (auto-configure webhook) | Add `Events: ["Message"]` to webhook body |
| Line ~265-288 (after status check) | If events is empty and session is connected, auto-subscribe |

### Redeploy
- Redeploy `wuzapi-test-connection`
- Call the function once to trigger the event subscription fix
- Send a real test message to validate

