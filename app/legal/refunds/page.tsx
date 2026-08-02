import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalNotice, LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = { title: "Cancellation and Refund Policy" };

const sections = [
  { id: "scope", title: "1. Scope" },
  { id: "cancellation", title: "2. Subscription cancellation" },
  { id: "eligibility", title: "3. Refund eligibility" },
  { id: "recharges", title: "4. Recharge-credit refunds" },
  { id: "request", title: "5. How to request a refund" },
  { id: "processing", title: "6. Approval and processing time" },
  { id: "adjustments", title: "7. Access and credit adjustments" },
  { id: "disputes", title: "8. Chargebacks and disputes" },
] as const;

export default function RefundsPage() {
  return (
    <LegalDocument documentType="Cancellation and Refund Policy" title="Cancellation and Refund Policy" summary="This Policy explains how to cancel a Sakhi subscription, the circumstances in which a payment may qualify for a refund, and how approved refunds are processed through Razorpay." sections={sections}>
      <LegalNotice><strong>Policy summary:</strong> You may cancel at any time. Cancellation is effective at the end of the paid period. Payments are ordinarily non-refundable after activation, subject to the exceptions below and rights available under applicable law.</LegalNotice>

      <LegalSection id="scope" title="1. Scope">
        <p>This Policy applies to subscription payments and one-time recharge-credit purchases made directly to WestCoast Technologies LLP for Sakhi. It forms part of the <Link href="/legal/subscription-terms">Subscription and Credits Terms</Link>.</p>
        <p>Nothing in this Policy limits a mandatory refund, reversal or remedy available under applicable consumer law or the rules of a payment network.</p>
      </LegalSection>

      <LegalSection id="cancellation" title="2. Subscription cancellation">
        <p>You may cancel a paid subscription through billing settings or by emailing support from your Account address. Cancellation stops future renewals and ordinarily takes effect at the end of the current paid billing period. You retain paid access and remaining subscription credits until that date.</p>
        <p>Cancellation does not automatically refund any part of the current billing period. We do not ordinarily provide prorated refunds merely because you cancel early, do not use the Services or leave included credits unused. Subscription credits expire on their scheduled refresh or paid-through date and do not roll over.</p>
      </LegalSection>

      <LegalSection id="eligibility" title="3. Refund eligibility">
        <p>Once a paid subscription is activated, the payment is ordinarily final. We will, however, investigate and may approve a full or proportionate refund where:</p>
        <ul>
          <li>the same purchase was charged more than once;</li>
          <li>payment succeeded but the purchased plan was not activated within a reasonable period;</li>
          <li>we are unable to provide a material part of the prepaid Service for a substantial period;</li>
          <li>the amount charged differs from the amount you authorised, excluding a clearly disclosed bank or foreign-exchange charge;</li>
          <li>we expressly offer a refund in writing for the relevant incident; or</li>
          <li>a refund is required by applicable law.</li>
        </ul>
        <p>Dissatisfaction with an AI response, normal feature changes, intermittent maintenance, failure to cancel before renewal, or non-use does not by itself establish refund eligibility.</p>
      </LegalSection>

      <LegalSection id="recharges" title="4. Recharge-credit refunds">
        <p>A recharge-credit purchase may be considered for refund only while none of the credits from that purchase have been consumed. Once any associated recharge credit has been used, the purchase is non-refundable except for duplicate, unauthorised or erroneous charges confirmed by us, or where applicable law requires otherwise.</p>
        <p>Recharge credits do not expire while the Account and Sakhi credit system remain available, but they cannot be redeemed for cash or transferred.</p>
      </LegalSection>

      <LegalSection id="request" title="5. How to request a refund">
        <p>Email <a href="mailto:support@trysakhi.com">support@trysakhi.com</a> from the address linked to your Sakhi Account. Include:</p>
        <ul>
          <li>your name and Account email;</li>
          <li>the payment date and amount;</li>
          <li>the Razorpay payment, order or subscription ID, if available;</li>
          <li>the reason for the request and relevant supporting details; and</li>
          <li>for an unrecognised payment, a masked transaction reference or bank statement excerpt.</li>
        </ul>
        <p>Do not send your complete card number, CVV, bank password, UPI PIN or OTP. We may request reasonable information to verify the Account, payment or authority of the requester.</p>
      </LegalSection>

      <LegalSection id="processing" title="6. Approval and processing time">
        <p>We aim to acknowledge a complete request within 48 business hours. We will communicate whether the request is approved, rejected or requires further information after reviewing payment and usage records.</p>
        <p>Approved refunds are initiated through Razorpay to the <strong>original payment method</strong>. Razorpay states that a normal refund generally takes <strong>5–7 working days</strong> after initiation, although a bank or payment network may require longer. We cannot redirect a refund to another card, account or person. If the refund is not visible after the stated period, contact us with the refund reference.</p>
      </LegalSection>

      <LegalSection id="adjustments" title="7. Access and credit adjustments">
        <p>When a subscription payment is fully refunded or reversed, the corresponding paid access and unused subscription credits will be withdrawn. A partial refund may result in a proportionate adjustment.</p>
        <p>When a recharge is refunded, the corresponding recharge credits are removed. If a reversal occurs after those credits were consumed, we may place the Account in a negative credit balance and offset it against later credits, subject to applicable law.</p>
      </LegalSection>

      <LegalSection id="disputes" title="8. Chargebacks and disputes">
        <p>Please contact us first so we can investigate a charge. A chargeback, mandate revocation or payment dispute may cause the related subscription, credits or Paid Services to be restricted while the matter is reviewed. Fraud, material misuse or violation of our <Link href="/legal/terms">Terms and Conditions</Link> may make a discretionary refund unavailable, without limiting non-waivable legal rights.</p>
      </LegalSection>
    </LegalDocument>
  );
}
