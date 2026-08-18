import type { WhatsAppConfig } from "@/lib/whatsapp/config";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export interface MetaSendResult {
  messageId: string;
}

export interface MetaMediaDownload {
  bytes: ArrayBuffer;
  mimeType: string;
}

export class MetaWhatsAppClient {
  constructor(
    private readonly config: WhatsAppConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private endpoint(path = "messages") {
    return `https://graph.facebook.com/${this.config.graphApiVersion}/${this.config.phoneNumberId}/${path}`;
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        ...init.headers,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meta WhatsApp request failed (${response.status}): ${text.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  }

  private async send(payload: Record<string, unknown>): Promise<MetaSendResult> {
    const result = await this.request<{ messages?: { id?: string }[] }>(
      this.endpoint(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      },
    );
    const messageId = result.messages?.[0]?.id;
    if (!messageId) throw new Error("Meta WhatsApp response did not include a message ID");
    return { messageId };
  }

  sendText(to: string, body: string, replyToMessageId?: string) {
    return this.send({
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: true, body: body.slice(0, 4_096) },
      ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
    });
  }

  sendButtons(
    to: string,
    body: string,
    buttons: { id: string; title: string }[],
  ) {
    return this.send({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body.slice(0, 1_024) },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({
            type: "reply",
            reply: { id: button.id.slice(0, 256), title: button.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  sendLinkButton(to: string, body: string, displayText: string, url: string) {
    return this.send({
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body.slice(0, 1_024) },
        action: {
          name: "cta_url",
          parameters: {
            display_text: displayText.slice(0, 20),
            url,
          },
        },
      },
    });
  }

  markRead(messageId: string, typing = true) {
    return this.request<Record<string, unknown>>(this.endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        ...(typing ? { typing_indicator: { type: "text" } } : {}),
      }),
    });
  }

  async downloadMedia(mediaId: string): Promise<MetaMediaDownload> {
    const metadata = await this.request<{ url: string; mime_type?: string }>(
      `https://graph.facebook.com/${this.config.graphApiVersion}/${mediaId}`,
      { method: "GET" },
    );
    const mediaUrl = new URL(metadata.url);
    const trustedMediaHost =
      mediaUrl.protocol === "https:" &&
      (mediaUrl.hostname === "lookaside.fbsbx.com" ||
        mediaUrl.hostname.endsWith(".facebook.com") ||
        mediaUrl.hostname.endsWith(".fbcdn.net"));
    if (!trustedMediaHost) throw new Error("Meta returned an untrusted media URL");
    const response = await this.fetchImpl(metadata.url, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
      redirect: "error",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`WhatsApp media download failed (${response.status})`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_MEDIA_BYTES || !response.body) {
      throw new Error("WhatsApp media is larger than 25 MB");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MEDIA_BYTES) {
        await reader.cancel();
        throw new Error("WhatsApp media is larger than 25 MB");
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      bytes: combined.buffer,
      mimeType: response.headers.get("content-type") || metadata.mime_type || "application/octet-stream",
    };
  }

  async uploadMedia(bytes: ArrayBuffer, mimeType: string, filename: string) {
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", mimeType);
    form.set("file", new Blob([bytes], { type: mimeType }), filename);
    const result = await this.request<{ id?: string }>(this.endpoint("media"), {
      method: "POST",
      body: form,
    });
    if (!result.id) throw new Error("Meta WhatsApp upload did not include a media ID");
    return result.id;
  }

  sendMedia(
    to: string,
    kind: "image" | "document" | "audio",
    mediaId: string,
    options: { caption?: string; filename?: string } = {},
  ) {
    return this.send({
      to,
      type: kind,
      [kind]: {
        id: mediaId,
        ...(options.caption ? { caption: options.caption.slice(0, 1_024) } : {}),
        ...(kind === "document" && options.filename ? { filename: options.filename } : {}),
      },
    });
  }

  sendMediaUrl(
    to: string,
    kind: "image" | "document" | "audio",
    url: string,
    options: { caption?: string; filename?: string } = {},
  ) {
    return this.send({
      to,
      type: kind,
      [kind]: {
        link: url,
        ...(options.caption ? { caption: options.caption.slice(0, 1_024) } : {}),
        ...(kind === "document" && options.filename ? { filename: options.filename } : {}),
      },
    });
  }
}
