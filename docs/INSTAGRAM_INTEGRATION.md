# Instagram Messaging Integration with Callbell

This document describes how to configure and use the Instagram messaging integration with Callbell in the Emmelycloud application.

## Overview

The integration provides:
- **Inbound messaging**: Webhook handling for incoming Instagram messages via Callbell
- **Outbound messaging**: Sending Instagram messages through the Callbell API
- **Message status tracking**: Checking delivery and read status of sent messages
- **Template support**: Sending template-based messages with dynamic values
- **First contact handling**: Automatic `optin_contact` for first messages to new contacts

## Architecture

### Edge Functions

1. **`callbell-webhook`**: Processes incoming messages from Callbell and stores them in the database
2. **`callbell-send`**: Sends outbound messages via Callbell API (Instagram, WhatsApp, etc.)
3. **`callbell-status`**: Checks message delivery status for sent messages

## Configuration

### Environment Variables

Configure the following environment variables in your Supabase project (Edge Functions secrets):

```bash
# Callbell API Configuration
CALLBELL_API_TOKEN=your-callbell-api-token-here
CALLBELL_IG_CHANNEL_UUID=your-instagram-channel-uuid
CALLBELL_WA_CHANNEL_UUID=your-whatsapp-channel-uuid  # Optional, for WhatsApp

# Supabase Configuration (auto-configured in Supabase Edge Functions)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### How to Get Callbell Credentials

1. **API Token**: 
   - Log in to your Callbell account
   - Go to Settings → API
   - Generate or copy your API token

2. **Instagram Channel UUID**:
   - Navigate to Settings → Channels
   - Find your Instagram channel
   - Copy the channel UUID from the URL or channel details

### Setting Environment Variables

Using Supabase CLI:
```bash
# Set individual secrets
supabase secrets set CALLBELL_API_TOKEN=your-token-here
supabase secrets set CALLBELL_IG_CHANNEL_UUID=your-channel-uuid
```

Or using the Supabase Dashboard:
- Go to your project → Edge Functions → Manage secrets
- Add each environment variable

## Webhook Setup

### 1. Configure Callbell Webhook

In your Callbell account:

1. Go to Settings → Webhooks
2. Add a new webhook with the URL:
   ```
   https://your-project.supabase.co/functions/v1/callbell-webhook
   ```
3. Select the following events:
   - `message_created` (for incoming messages)
   - `message_status_updated` (optional, for status updates)

### 2. Test Webhook Verification

The webhook endpoint automatically handles Callbell webhook verification.

## Usage

### Sending Instagram Messages

#### Text Messages

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/callbell-send' \
  -H 'Authorization: Bearer YOUR_USER_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "conversation_id": "conv-uuid-here",
    "content": "Hello from Instagram!"
  }'
```

#### Template Messages

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/callbell-send' \
  -H 'Authorization: Bearer YOUR_USER_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "conversation_id": "conv-uuid-here",
    "template_uuid": "template-uuid-here",
    "template_values": {
      "name": "John",
      "code": "ABC123"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message_id": "msg-external-uuid"
}
```

### Checking Message Status

```bash
curl -X GET 'https://your-project.supabase.co/functions/v1/callbell-status?conversation_id=conv-uuid-here' \
  -H 'Authorization: Bearer YOUR_USER_TOKEN'
```

**Response:**
```json
{
  "success": true,
  "updated": [
    {
      "id": "msg-db-id-1",
      "status": "delivered"
    },
    {
      "id": "msg-db-id-2",
      "status": "read"
    }
  ]
}
```

## API Reference

### POST /callbell-send

Sends a message via Callbell.

**Headers:**
- `Authorization: Bearer <user-token>` (required)
- `Content-Type: application/json`

**Body Parameters:**
- `conversation_id` (string, required): The conversation UUID
- `content` (string, required if no template_uuid): Message text content
- `template_uuid` (string, required if no content): Template UUID
- `template_values` (object, optional): Template variable values

**Instagram-Specific Behavior:**
- Uses `contact_instagram` field as the recipient identifier
- Sets `from: "instagram"` in Callbell API request
- Uses `CALLBELL_IG_CHANNEL_UUID` as the channel
- Automatically includes `optin_contact: true` for first contact

**Response Codes:**
- `200`: Message sent successfully
- `400`: Invalid request (missing parameters)
- `401`: Unauthorized
- `404`: Conversation not found
- `500`: Server error
- `502`: Callbell API error

### GET /callbell-status

Checks message delivery status for a conversation.

**Headers:**
- `Authorization: Bearer <user-token>` (required)

**Query Parameters:**
- `conversation_id` (string, required): The conversation UUID

**Response:**
- `success` (boolean): Operation status
- `updated` (array): List of messages with updated status

### POST /callbell-webhook

Webhook endpoint for Callbell events.

**Headers:**
- None required (webhook verification handled automatically)

**Body:** Callbell webhook payload

**Handled Events:**
- `message_created`: New inbound message

**Behavior:**
- Creates or updates conversation
- Stores message in database
- Extracts Instagram contact ID from `message.from` field
- Updates contact name and avatar if provided
- Skips outbound messages

## Testing

Run the test suite:

```bash
npm test
```

The test suite includes:
- Webhook payload parsing tests
- Outbound message sending tests
- Error handling tests
- Status checking tests

### Manual Testing

1. **Test Webhook Receipt**:
   - Send a message to your Instagram business account
   - Check Supabase Edge Function logs for webhook payload
   - Verify message is stored in database

2. **Test Outbound Message**:
   - Use the curl command above to send a test message
   - Verify message appears in Instagram conversation
   - Check message is stored in database

3. **Test Status Check**:
   - Send a message and note the message_id
   - Use status endpoint to check delivery status
   - Verify status updates in database

## Troubleshooting

### Common Issues

1. **"CALLBELL_IG_CHANNEL_UUID not configured"**
   - Solution: Set the environment variable in Supabase Edge Functions secrets

2. **"No Instagram contact identifier"**
   - Solution: Ensure conversation has `contact_instagram` field populated
   - This should be set automatically by webhook on first inbound message

3. **"Failed to send Instagram message via Callbell"**
   - Check that `CALLBELL_API_TOKEN` is valid
   - Verify `CALLBELL_IG_CHANNEL_UUID` is correct
   - Check Callbell API logs for detailed error
   - Ensure Instagram channel is properly connected in Callbell

4. **Webhook not receiving messages**
   - Verify webhook URL is correct in Callbell settings
   - Check Supabase Edge Function logs for errors
   - Ensure webhook events include `message_created`

### Viewing Logs

Supabase Dashboard:
- Go to Edge Functions → Select function → Logs

Supabase CLI:
```bash
supabase functions logs callbell-webhook --follow
supabase functions logs callbell-send --follow
supabase functions logs callbell-status --follow
```

## Error Codes

### Callbell API Errors

- `400`: Invalid request (check channel UUID, contact ID, or template)
- `401`: Invalid API token
- `404`: Resource not found (channel, contact, or template)
- `429`: Rate limit exceeded
- `500`: Callbell server error

### Application Errors

- `401`: User not authenticated
- `400`: Missing required parameters
- `404`: Conversation not found
- `500`: Database or internal error
- `502`: External API error (Callbell)

## Best Practices

1. **First Contact**: The integration automatically includes `optin_contact: true` for first messages, ensuring compliance with Instagram messaging policies.

2. **Error Handling**: Always check the response status and handle errors appropriately in your client application.

3. **Status Checking**: Poll the status endpoint periodically to update message delivery status in your UI.

4. **Rate Limiting**: Be mindful of Callbell API rate limits when sending bulk messages.

5. **Template Messages**: Use templates for structured, pre-approved messages to improve delivery rates.

## Security Notes

- Never commit API tokens or secrets to version control
- Use environment variables for all sensitive configuration
- Rotate API tokens periodically
- Validate webhook signatures if Callbell provides them
- Use row-level security (RLS) in Supabase for data access control

## Support

For issues specific to:
- **Callbell API**: Check [Callbell API documentation](https://docs.callbell.eu/)
- **Instagram Messaging**: Check Instagram Messaging API requirements
- **This integration**: Check application logs and test suite results
