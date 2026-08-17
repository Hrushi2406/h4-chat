"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, Unplug } from "lucide-react";
import { auth } from "@/lib/clients/firebase";
import { Button } from "@/components/ui/button";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";

type ConnectionState =
  | { connected: false }
  | { connected: true; phoneNumber: string; optedOut: boolean; connectedAt?: string };

type LinkState = { link: string; message: string; expiresAt: string };

const token = async () => auth.currentUser?.getIdToken();

export function WhatsAppSettings() {
  const [connection, setConnection] = useState<ConnectionState>({ connected: false });
  const [link, setLink] = useState<LinkState>();
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const idToken = await token();
    if (!idToken) return;
    const response = await fetch("/api/whatsapp/account", {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Couldn’t load WhatsApp status");
    setConnection((await response.json()) as ConnectionState);
  }, []);

  useEffect(() => {
    load().catch((caught) => setError(caught instanceof Error ? caught.message : "Couldn’t load WhatsApp status")).finally(() => setLoading(false));
  }, [load]);

  const createLink = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const idToken = await token();
      const response = await fetch("/api/whatsapp/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: idToken }),
      });
      const data = (await response.json()) as LinkState & { error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn’t create a connection link");
      setLink(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t create a connection link");
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const idToken = await token();
      const response = await fetch("/api/whatsapp/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error("Couldn’t disconnect WhatsApp");
      setConnection({ connected: false });
      setLink(undefined);
      setConfirmDisconnect(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t disconnect WhatsApp");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="rounded-[20px] border border-border/70 bg-card p-4" aria-labelledby="whatsapp-settings-title">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="whatsapp-settings-title" className="text-[15px] font-semibold">Chat with Sakhi on WhatsApp</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Use the same chats, memories, tools, and credits from Sakhi’s official number.
            </p>
          </div>
        </div>
        {connection.connected && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Connected" />}
      </div>

      {loading && !link ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading WhatsApp status…</div>
      ) : connection.connected ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Connected to {connection.phoneNumber}</p>
            <p className="text-xs text-muted-foreground">{connection.optedOut ? "Messages paused — send START on WhatsApp to resume" : "Ready for Sakhi messages"}</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setConfirmDisconnect(true)}>
            <Unplug className="h-3.5 w-3.5" /> Disconnect
          </Button>
        </div>
      ) : link ? (
        <div className="mt-4 rounded-2xl bg-muted/50 p-3">
          <p className="text-sm font-medium">Your one-time link is ready</p>
          <p className="mt-1 text-xs text-muted-foreground">It expires in 10 minutes. Open it and send the pre-filled message without editing it.</p>
          <Button asChild className="mt-3 w-full rounded-full sm:w-auto">
            <a href={link.link} target="_blank" rel="noreferrer">Open WhatsApp <ExternalLink className="h-4 w-4" /></a>
          </Button>
          <Button type="button" variant="ghost" size="sm" className="mt-2 rounded-full sm:ml-2 sm:mt-3" onClick={() => void load()}>Check connection</Button>
        </div>
      ) : (
        <Button type="button" className="mt-4 rounded-full" onClick={() => void createLink()}>
          <MessageCircle className="h-4 w-4" /> Connect WhatsApp
        </Button>
      )}

      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}

      <ConfirmationDialog
        open={confirmDisconnect}
        title="Disconnect WhatsApp?"
        description="This stops WhatsApp access but keeps your Sakhi account, chats, memories, and credits."
        confirmLabel="Disconnect"
        isConfirming={disconnecting}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => void disconnect()}
      />
    </section>
  );
}
