// Messaging provider preferences per channel
// Stored in localStorage so admin can toggle between Callbell and Direct API

export type MessagingProvider = "callbell" | "direct";
export type MessagingChannel = "instagram" | "whatsapp";

const STORAGE_KEY = "messaging_providers";

interface ProviderConfig {
  instagram: MessagingProvider;
  whatsapp: MessagingProvider;
}

const DEFAULT_CONFIG: ProviderConfig = {
  instagram: "callbell",
  whatsapp: "callbell",
};

export function getProviderConfig(): ProviderConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_CONFIG;
}

export function setProviderForChannel(channel: MessagingChannel, provider: MessagingProvider) {
  const config = getProviderConfig();
  config[channel] = provider;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getProviderForChannel(channel: MessagingChannel): MessagingProvider {
  return getProviderConfig()[channel];
}

/** Returns the edge function name to use for sending */
export function getSendFunctionName(channel: MessagingChannel): string {
  const provider = getProviderForChannel(channel);
  if (provider === "direct") {
    return channel === "instagram" ? "instagram-send" : "callbell-send"; // WhatsApp direct not yet implemented
  }
  return "callbell-send";
}
