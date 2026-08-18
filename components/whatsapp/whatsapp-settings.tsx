"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { auth } from "@/lib/clients/firebase";
import { Button } from "@/components/ui/button";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { WhatsAppLogo } from "@/lib/brand-logos";
import { cn } from "@/lib/utils";

type ConnectionState =
  | { connected: false }
  | { connected: true; phoneNumber: string; optedOut: boolean; connectedAt?: string };

type LinkState = { link: string; message: string; expiresAt: string };

const iosSurfaceClass =
  "bg-[color-mix(in_oklch,var(--foreground)_4.5%,var(--card))]";
const iosListClass = cn(
  "overflow-hidden rounded-[20px] divide-y divide-border/70",
  iosSurfaceClass,
);
const iosRowClass =
  "flex min-h-11 items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-foreground/[0.03]";

const token = async () => auth.currentUser?.getIdToken();

function StatusPill({ tone, label }: { tone: "connected" | "paused"; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "connected"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "connected" ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      {label}
    </span>
  );
}

export function WhatsAppSettings() {
  const [connection, setConnection] = useState<ConnectionState>({ connected: false });
  const [link, setLink] = useState<LinkState>();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string>();
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
    const next = (await response.json()) as ConnectionState;
    setConnection(next);
    return next;
  }, []);

  useEffect(() => {
    load()
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Couldn’t load WhatsApp status"),
      )
      .finally(() => setLoading(false));
  }, [load]);

  // The user leaves for WhatsApp and comes back — re-check on return instead of
  // making them press "Check connection".
  useEffect(() => {
    if (!link || connection.connected) return;
    const onFocus = () => {
      void load()
        .then((next) => {
          if (next?.connected) {
            setLink(undefined);
            setNotice(undefined);
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [link, connection.connected, load]);

  const createLink = async () => {
    setCreating(true);
    setError(undefined);
    setNotice(undefined);
    // Claim the tab inside the click gesture — opening it after the request
    // resolves gets swallowed by popup blockers. `noopener` is left off on
    // purpose: it makes window.open return null and we need the handle.
    const pending = window.open("about:blank", "_blank");
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
      if (pending && !pending.closed) {
        pending.opener = null;
        pending.location.replace(data.link);
        setNotice("Opened WhatsApp — send the pre-filled message without editing it.");
      }
    } catch (caught) {
      pending?.close();
      setError(caught instanceof Error ? caught.message : "Couldn’t create a connection link");
    } finally {
      setCreating(false);
    }
  };

  const checkConnection = async () => {
    setChecking(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const next = await load();
      if (next?.connected) setLink(undefined);
      else
        setNotice(
          "Not connected yet — send the pre-filled message, then check again.",
        );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t load WhatsApp status");
    } finally {
      setChecking(false);
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
      setNotice(undefined);
      setConfirmDisconnect(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t disconnect WhatsApp");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="space-y-1.5" aria-labelledby="whatsapp-settings-title">
      <div className={iosListClass}>
        <div className="flex items-start gap-3 px-4 py-3">
          <WhatsAppLogo className="mt-0.5 size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="whatsapp-settings-title" className="text-[15px] font-medium">
                WhatsApp
              </h2>
              {connection.connected && (
                <StatusPill
                  tone={connection.optedOut ? "paused" : "connected"}
                  label={connection.optedOut ? "Paused" : "Connected"}
                />
              )}
            </div>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              Chat with Sakhi from her official number, with the same chats, memories,
              tools, and credits.
            </p>
          </div>
        </div>

        {loading ? (
          <div className={iosRowClass}>
            <span className="text-[15px] text-muted-foreground">Checking status…</span>
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          </div>
        ) : connection.connected ? (
          <>
            <div className={iosRowClass}>
              <span className="text-[15px]">Number</span>
              <span className="text-right text-[15px] tabular-nums text-muted-foreground">
                {connection.phoneNumber}
              </span>
            </div>
            {connection.optedOut && (
              <div className={iosRowClass}>
                <div className="min-w-0">
                  <p className="text-[15px]">Messages paused</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Send START on WhatsApp to start receiving replies again.
                  </p>
                </div>
              </div>
            )}
            <div className={iosRowClass}>
              <div className="min-w-0">
                <p className="text-[15px]">Disconnect WhatsApp</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Keeps your account, chats, memories, and credits.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-8 shrink-0 self-center px-3 text-[13px] font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmDisconnect(true)}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : link ? (
          <>
            <div className={iosRowClass}>
              <div className="min-w-0">
                <p className="text-[15px]">Waiting for your message</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Send the pre-filled message without editing it. The link expires in
                  10 minutes.
                </p>
              </div>
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 self-center px-3 text-[13px] font-medium"
              >
                <a href={link.link} target="_blank" rel="noreferrer">
                  Open again
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={checking}
              onClick={() => void checkConnection()}
              className="h-11 w-full rounded-none text-[15px] font-medium hover:bg-foreground/[0.03]"
            >
              {checking && <Loader2 className="size-4 animate-spin" />}
              Check connection
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled={creating}
            onClick={() => void createLink()}
            className="h-11 w-full rounded-none text-[15px] font-medium text-primary hover:bg-foreground/[0.03] hover:text-primary"
          >
            {creating && <Loader2 className="size-4 animate-spin" />}
            Connect WhatsApp
          </Button>
        )}
      </div>

      {notice && <p className="px-1 text-[13px] text-muted-foreground">{notice}</p>}
      {error && (
        <p className="px-1 text-[13px] text-destructive" role="alert">
          {error}
        </p>
      )}

      <ConfirmationDialog
        open={confirmDisconnect}
        title="Disconnect WhatsApp?"
        description="This stops WhatsApp access but keeps your Sakhi account, chats, memories, and credits."
        confirmLabel="Disconnect"
        confirmingLabel="Disconnecting..."
        isConfirming={disconnecting}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => void disconnect()}
      />
    </section>
  );
}
