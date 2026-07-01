import { Client, Receiver } from "@upstash/qstash";

let cachedClient: Client | undefined;
let cachedReceiver: Receiver | undefined;

export const isQstashConfigured = () => Boolean(process.env.QSTASH_TOKEN);

export const getQstashClient = () => {
  if (!process.env.QSTASH_TOKEN) {
    return undefined;
  }

  cachedClient ??= new Client({
    token: process.env.QSTASH_TOKEN,
    baseUrl: process.env.QSTASH_URL,
  });
  return cachedClient;
};

export const getQstashReceiver = () => {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentSigningKey || !nextSigningKey) {
    return undefined;
  }

  cachedReceiver ??= new Receiver({
    currentSigningKey,
    nextSigningKey,
  });

  return cachedReceiver;
};
