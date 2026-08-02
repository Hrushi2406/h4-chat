import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalNotice, LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = { title: "Subscription and Credits Terms" };

const sections = [
  { id: "scope", title: "1. Scope and order of precedence" },
  { id: "purchase", title: "2. Purchase and activation" },
  { id: "price", title: "3. Price, tax and invoices" },
  { id: "renewal", title: "4. Recurring mandate and renewal" },
  { id: "subscription-credits", title: "5. Subscription credits" },
  { id: "recharge-credits", title: "6. Recharge credits" },
  { id: "measurement", title: "7. Usage measurement" },
  { id: "plan-changes", title: "8. Plan and price changes" },
  { id: "failed-payments", title: "9. Failed payments" },
  { id: "cancellation", title: "10. Cancellation and expiry" },
  { id: "refunds", title: "11. Refunds and reversals" },
  { id: "restrictions", title: "12. Restrictions and fair use" },
  { id: "contact", title: "13. Billing support" },
] as const;

export default function SubscriptionTermsPage() {
  return (
    <LegalDocument documentType="Subscription and Credits Terms" title="Subscription and Credits Terms" summary="These additional terms govern recurring Sakhi subscriptions, subscription credits, one-time recharge credits, payment mandates, renewals, plan changes and cancellation." sections={sections}>
      <LegalNotice>These terms supplement the <Link href="/legal/terms">Terms and Conditions</Link>. The plan, billing interval, price and benefits displayed immediately before you confirm payment form part of your purchase.</LegalNotice>

      <LegalSection id="scope" title="1. Scope and order of precedence">
        <p>These Subscription and Credits Terms (“<strong>Billing Terms</strong>”) apply whenever you purchase or use a Paid Service. Capitalised words not defined here have the meaning given in the Terms and Conditions.</p>
        <p>If these Billing Terms conflict with the Terms and Conditions on a payment, subscription or credit matter, these Billing Terms control only for that matter. A checkout confirmation may contain purchase-specific information; it controls over a general description if the two differ.</p>
      </LegalSection>

      <LegalSection id="purchase" title="2. Purchase and activation">
        <p>You must review the plan, amount, billing interval and payment method before confirming a purchase. By confirming, you authorise WestCoast Technologies LLP, Razorpay and the relevant bank or payment provider to process the displayed payment and, for a subscription, establish the applicable recurring-payment mandate.</p>
        <p>Access is activated after we receive reliable confirmation of successful payment and any required mandate authorisation. A pending, failed or abandoned payment does not create an entitlement. Paid access and credits are assigned to the Sakhi Account used at checkout and cannot be transferred.</p>
      </LegalSection>

      <LegalSection id="price" title="3. Price, tax and invoices">
        <p>All prices displayed by Sakhi are <strong>inclusive of applicable GST</strong> unless checkout expressly states otherwise. The total amount payable is shown before confirmation. You are responsible for any bank, foreign-exchange, data or other third-party charge separately imposed by your provider.</p>
        <p>We may issue an electronic invoice or payment receipt using your Account and transaction information. You are responsible for providing accurate billing details and promptly reporting an error.</p>
      </LegalSection>

      <LegalSection id="renewal" title="4. Recurring mandate and renewal">
        <p>A subscription automatically renews at the monthly or annual interval selected at checkout until cancelled. By subscribing, you authorise recurring charges under the approved mandate for the then-applicable subscription price, subject to authentication, pre-debit notification and other requirements of your bank, payment network and applicable law.</p>
        <p>Razorpay or the payment provider may send payment, mandate, renewal, failure or cancellation notifications by email or SMS using information provided during payment. The expected renewal date may shift because of banking processing, authentication, retries or plan changes.</p>
      </LegalSection>

      <LegalSection id="subscription-credits" title="5. Subscription credits">
        <p>A paid plan includes the quantity of monthly usage credits shown at purchase. Credits refresh on the plan’s monthly refresh date, including where an annual subscription is paid in advance. <strong>Unused subscription credits expire at refresh and do not roll over.</strong></p>
        <p>Subscription credits remain attached to the active plan. They expire when the paid-through period ends, the subscription is refunded or reversed, or the Account is terminated for material misuse, subject to applicable law.</p>
      </LegalSection>

      <LegalSection id="recharge-credits" title="6. Recharge credits">
        <p>Recharge credits are one-time, separately purchased usage credits. They do not expire while your Account and Sakhi’s credit system remain available. They are consumed according to the usage rules displayed in Sakhi and cannot be transferred between Accounts.</p>
        <p>Recharge credits are not a deposit, bank balance, stored-value facility, security, currency or legal tender. They cannot be sold, gifted, exchanged or redeemed for cash. Their only function is to measure eligible use of Sakhi.</p>
      </LegalSection>

      <LegalSection id="measurement" title="7. Usage measurement">
        <p>Credit consumption may vary by model, input and output size, cached context, file or image processing, tool calls, Helper generation and automation runs. Usage estimates and examples are illustrative; they do not guarantee a particular number of messages or tasks.</p>
        <p>Sakhi’s metering records determine credit consumption absent manifest error. We may update model rates or metering formulas prospectively to reflect provider costs, capacity and product changes. We will provide reasonable notice before a material change affects already-purchased usage.</p>
      </LegalSection>

      <LegalSection id="plan-changes" title="8. Plan and price changes">
        <p>Before a plan change is confirmed, we will display the selected plan, effective timing and any immediate payment required. A change may take effect immediately, on the next renewal date or after a new mandate is authorised, depending on the choice shown and payment-provider rules.</p>
        <p>We may change future subscription prices by giving reasonable advance notice. A new price applies no earlier than the next renewal after the notified effective date. You may cancel before that renewal if you do not accept the new price.</p>
      </LegalSection>

      <LegalSection id="failed-payments" title="9. Failed payments">
        <p>If a recurring payment fails, Razorpay, your bank or the payment network may retry the charge and request additional authentication. During this period, the subscription may be marked pending, past due, halted, paused or restricted.</p>
        <p>If payment is not completed, we may suspend paid features, stop new subscription-credit allocation, or move the Account to a free plan. This does not waive an amount validly due for a period already supplied.</p>
      </LegalSection>

      <LegalSection id="cancellation" title="10. Cancellation and expiry">
        <p>You may cancel from Sakhi’s billing settings or by contacting support. Cancellation stops future renewal charges and ordinarily takes effect at the end of the current paid period. Until then, paid features and remaining subscription credits continue to be available unless the payment is reversed, the Account is suspended for misuse or law requires otherwise.</p>
        <p>Cancellation does not itself create a refund for the current period. When the paid-through period ends, remaining subscription credits expire and the Account moves to the plan then applicable. Separately purchased recharge credits remain subject to clause 6.</p>
      </LegalSection>

      <LegalSection id="refunds" title="11. Refunds and reversals">
        <p>Eligibility, procedure and expected processing time are stated in our <Link href="/legal/refunds">Cancellation and Refund Policy</Link>. Approved refunds are returned to the original payment method through Razorpay.</p>
        <p>A full refund, chargeback or payment reversal revokes the corresponding plan access or credits. If credits related to a reversed recharge have already been consumed, we may offset the resulting negative balance against future credits, subject to applicable law.</p>
      </LegalSection>

      <LegalSection id="restrictions" title="12. Restrictions and fair use">
        <p>Credits and subscriptions may not be resold, shared across Accounts, obtained through payment abuse or used to evade technical limits. Features described as “unlimited” remain subject to ordinary-use expectations, availability, safety restrictions, technical capacity, rate limits and third-party provider limits.</p>
      </LegalSection>

      <LegalSection id="contact" title="13. Billing support">
        <p>For subscription, credit, invoice or payment questions, email <a href="mailto:support@trysakhi.com">support@trysakhi.com</a> from your Account email. Include the date, amount and relevant Razorpay payment, order or subscription ID. Never send a full card number, password, UPI PIN or OTP.</p>
      </LegalSection>
    </LegalDocument>
  );
}
