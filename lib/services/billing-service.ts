"use client";

import { auth } from "@/lib/clients/firebase";
import type { BillingPlanId } from "@/lib/billing/config";
import type { BillingSummary } from "@/lib/billing/types";

type BillingResponse = {
  billing: BillingSummary;
};

type CheckoutOutcome = BillingResponse & {
  activationPending: boolean;
};

type RechargeCheckoutOutcome = BillingResponse & {
  creditingPending: boolean;
};

type SubscriptionCheckout = {
  keyId: string;
  subscriptionId: string;
  name: string;
  description: string;
};

type RazorpayCheckoutResult = {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  subscription_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  name: string;
  description: string;
  prefill?: { name?: string | null; email?: string | null };
  theme?: { color: string };
  handler(result: RazorpayCheckoutResult): void;
  modal?: { ondismiss(): void };
};

type RazorpayCheckoutInstance = {
  open(): void;
  on(event: "payment.failed", callback: (response: unknown) => void): void;
};

declare global {
  interface Window {
    Razorpay?: new (
      options: RazorpayCheckoutOptions,
    ) => RazorpayCheckoutInstance;
  }
}

let checkoutScriptPromise: Promise<void> | undefined;

const getAuthToken = async () => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in to manage your plan");
  return token;
};

const readError = async (response: Response) => {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: string }
    | undefined;
  return body?.error || "Billing request failed";
};

const loadCheckoutScript = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Checkout requires a browser"));
  }
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    document.head.appendChild(script);
  });
  return checkoutScriptPromise;
};

class BillingService {
  async getBilling(): Promise<BillingResponse> {
    const response = await fetch("/api/billing", {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
      },
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json() as Promise<BillingResponse>;
  }

  async startCheckout(
    planId: Exclude<BillingPlanId, "free">,
  ): Promise<CheckoutOutcome | undefined> {
    const authToken = await getAuthToken();
    const response = await fetch("/api/billing/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", planId, authToken }),
    });
    if (!response.ok) throw new Error(await readError(response));

    const result = (await response.json()) as {
      checkout: SubscriptionCheckout;
    };
    return this.openSubscriptionCheckout(result.checkout);
  }

  private async openSubscriptionCheckout(
    checkoutDetails: SubscriptionCheckout,
  ): Promise<CheckoutOutcome | undefined> {
    await loadCheckoutScript();
    if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable");

    return new Promise<CheckoutOutcome | undefined>((resolve, reject) => {
      let completed = false;
      let hadFailedAttempt = false;
      const checkout = new window.Razorpay!({
        key: checkoutDetails.keyId,
        subscription_id: checkoutDetails.subscriptionId,
        name: checkoutDetails.name,
        description: checkoutDetails.description,
        prefill: {
          name: auth.currentUser?.displayName,
          email: auth.currentUser?.email,
        },
        theme: { color: "#3b82f6" },
        handler: async (payment) => {
          completed = true;
          try {
            if (!payment.razorpay_subscription_id) {
              throw new Error("Razorpay did not return a subscription ID");
            }
            const verificationAuthToken = await getAuthToken();
            const verification = await fetch("/api/billing/subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "verify",
                authToken: verificationAuthToken,
                razorpayPaymentId: payment.razorpay_payment_id,
                razorpaySubscriptionId:
                  payment.razorpay_subscription_id,
                razorpaySignature: payment.razorpay_signature,
              }),
            });
            if (!verification.ok && verification.status !== 202) {
              throw new Error(await readError(verification));
            }
            const activationPending = verification.status === 202;
            resolve({
              ...(await this.getBilling()),
              activationPending,
            });
          } catch (error) {
            reject(error);
          }
        },
        modal: {
          ondismiss: () => {
            if (completed) return;
            if (hadFailedAttempt) {
              reject(new Error("Payment failed. No credits were added."));
              return;
            }
            resolve(undefined);
          },
        },
      });
      checkout.on("payment.failed", () => {
        // Razorpay keeps Checkout open and lets the customer retry. Do not
        // settle this promise until a retry succeeds or the modal is closed.
        hadFailedAttempt = true;
      });
      checkout.open();
    });
  }

  async startRechargeCheckout(
    credits: number,
  ): Promise<RechargeCheckoutOutcome | undefined> {
    const authToken = await getAuthToken();
    const response = await fetch("/api/billing/recharge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", credits, authToken }),
    });
    if (!response.ok) throw new Error(await readError(response));

    const result = (await response.json()) as {
      checkout: {
        keyId: string;
        orderId: string;
        name: string;
        description: string;
        currency: string;
        amountPaise: number;
      };
    };
    await loadCheckoutScript();
    if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable");

    return new Promise<RechargeCheckoutOutcome | undefined>(
      (resolve, reject) => {
        let completed = false;
        let hadFailedAttempt = false;
        const checkout = new window.Razorpay!({
          key: result.checkout.keyId,
          order_id: result.checkout.orderId,
          amount: result.checkout.amountPaise,
          currency: result.checkout.currency,
          name: result.checkout.name,
          description: result.checkout.description,
          prefill: {
            name: auth.currentUser?.displayName,
            email: auth.currentUser?.email,
          },
          theme: { color: "#3b82f6" },
          handler: async (payment) => {
            completed = true;
            try {
              if (!payment.razorpay_order_id) {
                throw new Error("Razorpay did not return an order ID");
              }
              const verification = await fetch("/api/billing/recharge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "verify",
                  authToken: await getAuthToken(),
                  razorpayPaymentId: payment.razorpay_payment_id,
                  razorpayOrderId: payment.razorpay_order_id,
                  razorpaySignature: payment.razorpay_signature,
                }),
              });
              if (!verification.ok && verification.status !== 202) {
                throw new Error(await readError(verification));
              }
              resolve({
                ...(await this.getBilling()),
                creditingPending: verification.status === 202,
              });
            } catch (error) {
              reject(error);
            }
          },
          modal: {
            ondismiss: () => {
              if (completed) return;
              if (hadFailedAttempt) {
                reject(new Error("Payment failed. No credits were added."));
                return;
              }
              resolve(undefined);
            },
          },
        });
        checkout.on("payment.failed", () => {
          hadFailedAttempt = true;
        });
        checkout.open();
      },
    );
  }

  async changeSubscription(planId: Exclude<BillingPlanId, "free">) {
    const response = await fetch("/api/billing/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "change_plan",
        authToken: await getAuthToken(),
        planId,
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const result = (await response.json()) as {
      updated: boolean;
      billing?: BillingSummary;
      message?: string;
      checkout?: SubscriptionCheckout;
    };
    if (!result.checkout) return result;

    const outcome = await this.openSubscriptionCheckout(result.checkout);
    if (!outcome) {
      return {
        updated: false,
        message: "Plan change was not completed.",
      };
    }
    return {
      updated: !outcome.activationPending,
      billing: outcome.billing,
      message: outcome.activationPending
        ? "Payment received. Razorpay is confirming your new plan."
        : undefined,
    };
  }

  async cancelSubscription() {
    const response = await fetch("/api/billing/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cancel",
        authToken: await getAuthToken(),
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json() as Promise<{
      cancelledAtPeriodEnd: boolean;
      paidThrough: string | null;
    }>;
  }
}

const billingService = new BillingService();
export default billingService;
