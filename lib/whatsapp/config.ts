export interface WhatsAppConfig {
  verifyToken: string;
  appSecret: string;
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

export const getWhatsAppConfig = (): WhatsAppConfig => ({
  verifyToken: required("WHATSAPP_VERIFY_TOKEN"),
  appSecret: required("WHATSAPP_APP_SECRET"),
  accessToken: required("WHATSAPP_ACCESS_TOKEN"),
  phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
  graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v23.0",
});
