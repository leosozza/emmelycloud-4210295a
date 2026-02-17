# Quick Start: Instagram Integration

## Prerequisites

1. Callbell account with Instagram channel connected
2. Callbell API token
3. Instagram channel UUID from Callbell

## Setup (5 minutes)

### 1. Configure Environment Variables

Set in Supabase Edge Functions secrets:

```bash
supabase secrets set CALLBELL_API_TOKEN=your-token-here
supabase secrets set CALLBELL_IG_CHANNEL_UUID=your-channel-uuid
```

### 2. Configure Callbell Webhook

In Callbell Settings → Webhooks:
- URL: `https://YOUR_PROJECT.supabase.co/functions/v1/callbell-webhook`
- Event: `message_created`

### 3. Test the Integration

Send a test message to your Instagram account and check logs:

```bash
supabase functions logs callbell-webhook --follow
```

## Common Operations

### Send a Text Message

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/callbell-send' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"conversation_id": "CONV_ID", "content": "Hello!"}'
```

### Send a Template Message

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/callbell-send' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "conversation_id": "CONV_ID",
    "template_uuid": "TEMPLATE_ID",
    "template_values": {"name": "John", "code": "123"}
  }'
```

### Check Message Status

```bash
curl 'https://YOUR_PROJECT.supabase.co/functions/v1/callbell-status?conversation_id=CONV_ID' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| CALLBELL_IG_CHANNEL_UUID not configured | Set environment variable in Supabase |
| No Instagram contact identifier | Ensure inbound message received first |
| Failed to send Instagram message | Verify API token and channel UUID |

## Next Steps

- Read full documentation: [INSTAGRAM_INTEGRATION.md](INSTAGRAM_INTEGRATION.md)
- Review test examples: [supabase/functions/_tests/](../supabase/functions/_tests/)
- Check logs for detailed error messages
