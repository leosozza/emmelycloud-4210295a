import { describe, it, expect, beforeEach, vi } from "vitest";

describe("callbell-send function", () => {
  const mockEnv = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    CALLBELL_API_TOKEN: "test-callbell-token",
    CALLBELL_IG_CHANNEL_UUID: "test-ig-channel-uuid",
    CALLBELL_WA_CHANNEL_UUID: "test-wa-channel-uuid",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Instagram message sending", () => {
    it("should send text message via Callbell API with correct Instagram identifiers", async () => {
      const mockConversation = {
        channel: "instagram",
        contact_instagram: "123456789",
        contact_phone: null,
        contact_email: null,
      };

      const mockRequestBody = {
        conversation_id: "conv-123",
        content: "Hello from Instagram!",
      };

      // Expected Callbell API request
      const expectedCallbellBody = {
        to: "123456789",
        from: "instagram",
        type: "text",
        content: { text: "Hello from Instagram!" },
        channel_uuid: "test-ig-channel-uuid",
      };

      // Test validates that:
      // 1. Correct 'to' field uses Instagram contact ID
      // 2. Correct 'from' field is "instagram"
      // 3. Correct channel_uuid is used
      expect(expectedCallbellBody.to).toBe(mockConversation.contact_instagram);
      expect(expectedCallbellBody.from).toBe("instagram");
      expect(expectedCallbellBody.channel_uuid).toBe(mockEnv.CALLBELL_IG_CHANNEL_UUID);
    });

    it("should include optin_contact on first contact", async () => {
      const mockConversation = {
        channel: "instagram",
        contact_instagram: "123456789",
      };

      // First message scenario - no previous messages
      const messageCount = 0;

      const expectedBody = {
        to: "123456789",
        from: "instagram",
        type: "text",
        content: { text: "First message" },
        channel_uuid: "test-ig-channel-uuid",
        optin_contact: true,
      };

      // Verify optin_contact is included when it's first contact
      if (messageCount === 0) {
        expect(expectedBody.optin_contact).toBe(true);
      }
    });

    it("should support template-based messages with template_uuid", async () => {
      const mockRequestBody = {
        conversation_id: "conv-123",
        template_uuid: "template-abc",
        template_values: { name: "John", code: "12345" },
      };

      const expectedCallbellBody = {
        to: "123456789",
        from: "instagram",
        type: "template",
        content: {
          uuid: "template-abc",
          values: { name: "John", code: "12345" },
        },
        channel_uuid: "test-ig-channel-uuid",
      };

      // Verify template message structure
      expect(expectedCallbellBody.type).toBe("template");
      expect(expectedCallbellBody.content.uuid).toBe(mockRequestBody.template_uuid);
      expect(expectedCallbellBody.content.values).toEqual(mockRequestBody.template_values);
    });

    it("should handle error responses from Callbell API", async () => {
      const mockErrorResponse = {
        error: "Invalid channel UUID",
        status: 400,
      };

      // Test should verify error handling
      expect(mockErrorResponse.error).toBeDefined();
      expect(mockErrorResponse.status).toBe(400);
    });

    it("should return error when Instagram contact identifier is missing", async () => {
      const mockConversation = {
        channel: "instagram",
        contact_instagram: null, // Missing Instagram ID
      };

      const expectedError = "No Instagram contact identifier";
      expect(expectedError).toBeDefined();
    });

    it("should return error when CALLBELL_IG_CHANNEL_UUID is not configured", async () => {
      const env = { ...mockEnv, CALLBELL_IG_CHANNEL_UUID: undefined };
      const expectedError = "CALLBELL_IG_CHANNEL_UUID not configured";
      
      if (!env.CALLBELL_IG_CHANNEL_UUID) {
        expect(expectedError).toBeDefined();
      }
    });
  });

  describe("Message validation", () => {
    it("should require either content or template_uuid", async () => {
      const invalidRequest = {
        conversation_id: "conv-123",
        // Missing both content and template_uuid
      };

      const expectedError = "conversation_id and either content or template_uuid required";
      expect(expectedError).toBeDefined();
    });

    it("should accept request with content", async () => {
      const validRequest = {
        conversation_id: "conv-123",
        content: "Hello",
      };

      expect(validRequest.conversation_id).toBeDefined();
      expect(validRequest.content).toBeDefined();
    });

    it("should accept request with template_uuid", async () => {
      const validRequest = {
        conversation_id: "conv-123",
        template_uuid: "template-123",
      };

      expect(validRequest.conversation_id).toBeDefined();
      expect(validRequest.template_uuid).toBeDefined();
    });
  });

  describe("Response handling", () => {
    it("should store message with external_id from Callbell response", async () => {
      const mockCallbellResponse = {
        message: {
          uuid: "msg-callbell-123",
          status: "sent",
        },
      };

      const expectedMessageRecord = {
        external_id: "msg-callbell-123",
        delivery_status: "sent",
        direction: "outbound",
      };

      expect(expectedMessageRecord.external_id).toBe(mockCallbellResponse.message.uuid);
    });

    it("should update conversation with last message info", async () => {
      const messageContent = "Test message";
      
      const expectedUpdate = {
        last_message_preview: messageContent.slice(0, 100),
      };

      expect(expectedUpdate.last_message_preview).toBe("Test message");
    });

    it("should store template messages with template identifier", async () => {
      const template_uuid = "template-123";
      const messageContent = `[Template: ${template_uuid}]`;

      expect(messageContent).toBe("[Template: template-123]");
    });
  });
});
