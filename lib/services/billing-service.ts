"use client";

import { auth } from "@/lib/clients/firebase";
import type { BillingPlanId } from "@/lib/billing/config";
import type { BillingSummary } from "@/lib/billing/types";

type CheckoutOutcome = {
  activationPending: boolean;
};

type RechargeCheckoutOutcome = {
  creditingPending: boolean;
};

type PaymentCompletedCallback = () => void;

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
    script.onload = () => {
      script.onload = null;
      script.onerror = null;
      if (window.Razorpay) {
        resolve();
        return;
      }
      checkoutScriptPromise = undefined;
      script.remove();
      reject(new Error("Razorpay Checkout is unavailable"));
    };
    script.onerror = () => {
      script.onload = null;
      script.onerror = null;
      checkoutScriptPromise = undefined;
      script.remove();
      reject(new Error("Could not load Razorpay Checkout"));
    };
    document.head.appendChild(script);
  });
  return checkoutScriptPromise;
};

class BillingService {
  async getCurrentBilling(): Promise<BillingSummary> {
    const authToken = await getAuthToken();
    const response = await fetch("/api/billing", {
      headers: { Authorization: `Bearer ${authToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await readError(response));

    const result = (await response.json()) as { billing: BillingSummary };
    return result.billing;
  }

  async startCheckout(
    planId: Exclude<BillingPlanId, "free">,
    onPaymentCompleted?: PaymentCompletedCallback,
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
    return this.openSubscriptionCheckout(
      result.checkout,
      onPaymentCompleted,
    );
  }

  private async openSubscriptionCheckout(
    checkoutDetails: SubscriptionCheckout,
    onPaymentCompleted?: PaymentCompletedCallback,
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
          onPaymentCompleted?.();
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
            resolve({ activationPending });
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
    onPaymentCompleted?: PaymentCompletedCallback,
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
            onPaymentCompleted?.();
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
              resolve({ creditingPending: verification.status === 202 });
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

  async changeSubscription(
    planId: Exclude<BillingPlanId, "free">,
    onPaymentCompleted?: PaymentCompletedCallback,
  ) {
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
    if (!result.checkout) {
      return {
        ...result,
        confirmationPending: response.status === 202,
      };
    }

    const outcome = await this.openSubscriptionCheckout(
      result.checkout,
      onPaymentCompleted,
    );
    if (!outcome) {
      return {
        updated: false,
        confirmationPending: false,
        message: "Plan change was not completed.",
      };
    }
    return {
      updated: !outcome.activationPending,
      confirmationPending: outcome.activationPending,
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
