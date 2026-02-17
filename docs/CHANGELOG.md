# Changelog - Instagram/Callbell Integration

## [1.0.0] - 2024-02-17

### Added

#### Core Features
- **Instagram Messaging via Callbell API**: Replaced direct Meta Graph API integration with Callbell API for Instagram messages
- **Template Message Support**: Added ability to send template-based messages with dynamic values via `template_uuid` and `template_values`
- **First Contact Handling**: Automatic inclusion of `optin_contact: true` for first message to new contacts (Instagram compliance)
- **Message Status Tracking**: Enhanced status checking via Callbell API with proper status mapping (sent, delivered, read)

#### API Endpoints
- **POST /callbell-send**: Send messages via Callbell
  - Supports text messages with `content` parameter
  - Supports template messages with `template_uuid` and `template_values`
  - Automatically includes `optin_contact` on first contact
  - Returns external message ID from Callbell
  
- **GET /callbell-status**: Check message delivery status
  - Polls Callbell API for message status updates
  - Maps Callbell status to internal delivery_status
  - Updates read_at timestamp when messages are read
  - Returns list of updated messages

- **POST /callbell-webhook**: Receive incoming messages from Callbell
  - Processes `message_created` events
  - Creates or updates conversations
  - Extracts Instagram contact ID from webhook payload
  - Stores messages in database
  - Updates contact information (name, avatar)

#### Configuration
- **Environment Variables**: 
  - `CALLBELL_API_TOKEN`: Callbell API authentication token
  - `CALLBELL_IG_CHANNEL_UUID`: Instagram channel identifier
  - `CALLBELL_WA_CHANNEL_UUID`: WhatsApp channel identifier (optional)

#### Testing
- **43 comprehensive tests** covering:
  - Webhook payload parsing (14 tests)
  - Outbound message sending (12 tests)
  - Message status checking (16 tests)
  - Error handling scenarios
  - All tests passing ✓

#### Documentation
- **INSTAGRAM_INTEGRATION.md**: Complete setup and usage guide
  - Configuration instructions
  - API reference
  - Troubleshooting guide
  - Security best practices
  - Example curl commands
  
- **QUICKSTART.md**: Quick reference guide
  - 5-minute setup guide
  - Common operations
  - Troubleshooting table
  
- **.env.example**: Environment variable template
  - All required variables documented
  - Placeholder values provided
  - Comments explaining each variable

### Changed

#### Breaking Changes
- **Instagram sending now uses Callbell API instead of Meta Graph API**
  - Removed dependency on `META_PAGE_ACCESS_TOKEN` and `META_IG_ACCOUNT_ID` for Instagram
  - Instagram messages now require `CALLBELL_IG_CHANNEL_UUID` instead
  - Message response format changed to use Callbell's `message.uuid` instead of Meta's `message_id`

#### Improvements
- **Enhanced error handling**: More specific error messages for configuration issues
- **Better logging**: Debug logs for request/response payloads to aid troubleshooting
- **Proper HTTP status codes**: 400, 401, 404, 500, 502 for different error scenarios
- **Instagram contact identification**: Uses `contact_instagram` field from database
- **Message content handling**: Stores template identifier when using template messages

### Technical Details

#### Instagram Message Flow

**Inbound (Webhook):**
1. Callbell receives Instagram message
2. Callbell sends webhook to `/callbell-webhook`
3. Webhook handler extracts Instagram contact ID from `message.from`
4. Creates/updates conversation with `contact_instagram` field
5. Stores message in database

**Outbound (Send):**
1. Client calls `/callbell-send` with `conversation_id` and `content` or `template_uuid`
2. Function fetches conversation and extracts `contact_instagram`
3. Checks if first contact (no previous messages)
4. Builds Callbell API request:
   ```json
   {
     "to": "instagram-contact-id",
     "from": "instagram",
     "type": "text",
     "content": {"text": "message"},
     "channel_uuid": "instagram-channel-uuid",
     "optin_contact": true  // if first contact
   }
   ```
5. Sends to Callbell API endpoint
6. Stores message with external_id in database

**Status Check:**
1. Client calls `/callbell-status?conversation_id=xxx`
2. Function queries pending messages with external_id
3. Polls Callbell API `/messages/status/:id` for each
4. Maps Callbell status to internal status
5. Updates database records
6. Returns list of updated messages

#### API Request Format

**Callbell Messages API:**
- Endpoint: `POST https://api.callbell.eu/v1/messages/send`
- Headers: `Authorization: Bearer {token}`, `Content-Type: application/json`
- Body for Instagram text:
  ```json
  {
    "to": "instagram-user-id",
    "from": "instagram",
    "type": "text",
    "content": {"text": "Hello!"},
    "channel_uuid": "channel-uuid-here"
  }
  ```
- Body for Instagram template:
  ```json
  {
    "to": "instagram-user-id",
    "from": "instagram",
    "type": "template",
    "content": {
      "uuid": "template-uuid",
      "values": {"name": "John", "code": "123"}
    },
    "channel_uuid": "channel-uuid-here"
  }
  ```

### Migration Guide

If you're upgrading from the previous Meta Graph API implementation:

1. **Update Environment Variables:**
   ```bash
   # Remove (no longer needed for Instagram)
   # META_PAGE_ACCESS_TOKEN
   # META_IG_ACCOUNT_ID
   
   # Add
   supabase secrets set CALLBELL_API_TOKEN=your-token
   supabase secrets set CALLBELL_IG_CHANNEL_UUID=your-channel-uuid
   ```

2. **Configure Callbell Webhook:**
   - Add webhook URL in Callbell settings
   - Enable `message_created` event

3. **Test Integration:**
   - Send test message to Instagram account
   - Verify webhook receives it
   - Send outbound message via API
   - Check status endpoint

### Known Limitations

- Instagram messages require opt-in before sending (handled automatically on first contact)
- Template messages must be pre-approved in Callbell
- Rate limits apply according to Callbell API limits
- Status updates require polling (no push notification for status changes)

### Future Enhancements

Potential improvements for future versions:
- Real-time status updates via webhook
- Support for media messages (images, videos)
- Batch message sending
- Message scheduling
- Analytics and reporting
- Multi-language template support

---

For detailed documentation, see:
- [INSTAGRAM_INTEGRATION.md](INSTAGRAM_INTEGRATION.md)
- [QUICKSTART.md](QUICKSTART.md)
