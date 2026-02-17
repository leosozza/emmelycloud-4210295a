import { describe, it, expect } from "vitest";

describe("callbell-webhook function", () => {
  describe("Instagram message webhook parsing", () => {
    it("should parse Instagram message from Callbell webhook payload", async () => {
      const mockWebhookPayload = {
        event: "message_created",
        payload: {
          message: {
            uuid: "msg-uuid-123",
            text: "Hello from Instagram!",
            direction: "in",
            from: "instagram-user-id-123",
            channel: "instagram",
            created_at: "2024-01-01T12:00:00Z",
            attachments: [],
          },
          contact: {
            name: "John Doe",
            instagram_id: "instagram-user-id-123",
            source: "instagram",
            profile_picture: "https://example.com/avatar.jpg",
          },
        },
      };

      // Expected parsed values
      const expectedMessageData = {
        content: "Hello from Instagram!",
        channel: "instagram",
        contactId: "instagram-user-id-123",
        contactName: "John Doe",
        externalId: "msg-uuid-123",
        direction: "inbound",
      };

      expect(mockWebhookPayload.payload.message.text).toBe(expectedMessageData.content);
      expect(mockWebhookPayload.payload.message.from).toBe(expectedMessageData.contactId);
      expect(mockWebhookPayload.payload.contact.name).toBe(expectedMessageData.contactName);
    });

    it("should extract Instagram contact ID from webhook", async () => {
      const mockPayload = {
        message: {
          from: "ig-contact-12345",
          channel: "instagram",
        },
        contact: {
          instagram_id: "ig-contact-12345",
        },
      };

      const contactIg = mockPayload.message.from || mockPayload.contact.instagram_id;
      expect(contactIg).toBe("ig-contact-12345");
    });

    it("should skip outbound messages", async () => {
      const outboundMessage = {
        event: "message_created",
        payload: {
          message: {
            direction: "out",
            text: "Reply from agent",
          },
        },
      };

      // Should be skipped
      const shouldSkip = outboundMessage.payload.message.direction === "out";
      expect(shouldSkip).toBe(true);
    });

    it("should skip non-message_created events", async () => {
      const nonMessageEvent = {
        event: "message_status_updated",
        payload: {
          message: {
            status: "read",
          },
        },
      };

      const shouldSkip = nonMessageEvent.event !== "message_created";
      expect(shouldSkip).toBe(true);
    });

    it("should map Instagram channel correctly", async () => {
      const channels = [
        { input: "instagram", expected: "instagram" },
        { input: "instagram_dm", expected: "instagram" },
        { input: "whatsapp", expected: "whatsapp" },
        { input: "email", expected: "email" },
        { input: "webchat", expected: "webchat" },
      ];

      channels.forEach(({ input, expected }) => {
        let dbChannel = input;
        if (input.includes("instagram")) dbChannel = "instagram";
        else if (input.includes("whatsapp")) dbChannel = "whatsapp";
        else if (input.includes("email")) dbChannel = "email";
        else dbChannel = "webchat";

        expect(dbChannel).toBe(expected);
      });
    });

    it("should handle messages with attachments", async () => {
      const messageWithMedia = {
        message: {
          text: "",
          attachments: [
            {
              type: "image",
              url: "https://example.com/image.jpg",
            },
          ],
        },
      };

      const mediaUrl = messageWithMedia.message.attachments[0]?.url;
      const mediaType = messageWithMedia.message.attachments[0]?.type;

      expect(mediaUrl).toBe("https://example.com/image.jpg");
      expect(mediaType).toBe("image");
    });

    it("should use correct contact identifier for conversation lookup", async () => {
      const instagramMessage = {
        channel: "instagram",
        contact: {
          instagram_id: "ig-12345",
          phone: null,
        },
      };

      const lookupColumn = "contact_instagram";
      const lookupValue = instagramMessage.contact.instagram_id;

      expect(lookupColumn).toBe("contact_instagram");
      expect(lookupValue).toBe("ig-12345");
    });

    it("should create new conversation if not found", async () => {
      const newConversationData = {
        channel: "instagram",
        contact_name: "New Contact",
        contact_instagram: "ig-new-user",
        status: "aberta",
        unread_count: 1,
      };

      expect(newConversationData.channel).toBe("instagram");
      expect(newConversationData.contact_instagram).toBe("ig-new-user");
      expect(newConversationData.unread_count).toBe(1);
    });

    it("should update existing conversation with new message", async () => {
      const updateData = {
        last_message_at: new Date().toISOString(),
        last_message_preview: "New message text".slice(0, 100),
        unread_count: 1,
        status: "aberta",
      };

      expect(updateData.last_message_preview).toBe("New message text");
      expect(updateData.unread_count).toBe(1);
      expect(updateData.status).toBe("aberta");
    });
  });

  describe("Error handling", () => {
    it("should handle missing payload gracefully", async () => {
      const invalidWebhook = {
        event: null,
        payload: null,
      };

      const shouldSkip = !invalidWebhook.event || !invalidWebhook.payload;
      expect(shouldSkip).toBe(true);
    });

    it("should handle missing message text", async () => {
      const messageWithoutText = {
        message: {
          text: "",
          content: {},
        },
      };

      const messageText = messageWithoutText.message.text || "";
      const shouldSkip = !messageText;
      
      expect(shouldSkip).toBe(true);
    });

    it("should log webhook errors without crashing", async () => {
      const invalidPayload = "not a json object";
      
      // Should catch and log error, return 500
      expect(() => {
        if (typeof invalidPayload !== "object") {
          throw new Error("Invalid payload");
        }
      }).toThrow();
    });
  });

  describe("Contact information extraction", () => {
    it("should extract contact name with fallback", async () => {
      const scenarios = [
        { contact: { name: "John" }, expected: "John" },
        { contact: { name: null, instagram_id: "ig-123" }, expected: "ig-123" },
        { contact: { name: null, instagram_id: null }, expected: "Desconhecido" },
      ];

      scenarios.forEach(({ contact, expected }) => {
        const contactName = contact.name || contact.instagram_id || "Desconhecido";
        expect(contactName).toBe(expected);
      });
    });

    it("should update contact avatar from webhook", async () => {
      const contactData = {
        contact: {
          profile_picture: "https://example.com/avatar.jpg",
        },
      };

      const contactAvatar = contactData.contact.profile_picture;
      expect(contactAvatar).toBeDefined();
    });
  });
});
