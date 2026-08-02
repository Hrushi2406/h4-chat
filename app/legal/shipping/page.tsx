import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalNotice, LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = { title: "Shipping and Delivery Policy" };

const sections = [
  { id: "digital-only", title: "1. Digital-only services" },
  { id: "subscription", title: "2. Subscription delivery" },
  { id: "credits", title: "3. Recharge-credit delivery" },
  { id: "confirmation", title: "4. Delivery confirmation" },
  { id: "delay", title: "5. Delayed or failed activation" },
  { id: "support", title: "6. Delivery support" },
] as const;

export default function ShippingPage() {
  return (
    <LegalDocument documentType="Shipping and Delivery Policy" title="Shipping and Delivery Policy" summary="This Policy describes how Sakhi subscriptions and recharge credits are delivered electronically after payment. Sakhi does not sell or ship physical goods." sections={sections}>
      <LegalNotice>All products covered by this Policy are supplied digitally to the Sakhi Account used at checkout. No courier or physical delivery is involved.</LegalNotice>

      <LegalSection id="digital-only" title="1. Digital-only services">
        <p>WestCoast Technologies LLP supplies access to Sakhi’s online software features and usage credits. We do not dispatch parcels, charge shipping fees, appoint delivery agents or require a physical delivery address for these purchases.</p>
      </LegalSection>
      <LegalSection id="subscription" title="2. Subscription delivery">
        <p>A paid subscription is normally activated shortly after Razorpay confirms successful payment and any required recurring mandate. Activation gives the purchasing Account access to the plan features and subscription credits described at checkout.</p>
      </LegalSection>
      <LegalSection id="credits" title="3. Recharge-credit delivery">
        <p>One-time recharge credits are normally added to the credit balance of the purchasing Account shortly after successful payment confirmation. Credits cannot be delivered to or transferred to a different Account after purchase.</p>
      </LegalSection>
      <LegalSection id="confirmation" title="4. Delivery confirmation">
        <p>Delivery is confirmed when the active plan or additional credit balance appears in Sakhi’s Account or billing interface. Razorpay, your bank or payment network may separately issue a payment confirmation; that confirmation records payment but does not by itself prove that provisioning is complete.</p>
      </LegalSection>
      <LegalSection id="delay" title="5. Delayed or failed activation">
        <p>Banking, mandate or webhook processing can occasionally delay activation. If a successful payment is not reflected within 30 minutes, contact support with the Account email, payment date, amount and Razorpay payment ID.</p>
        <p>If we confirm that payment succeeded but cannot deliver the purchased Service within a reasonable period, we will activate it or provide an eligible remedy under our <Link href="/legal/refunds">Cancellation and Refund Policy</Link>.</p>
      </LegalSection>
      <LegalSection id="support" title="6. Delivery support">
        <p>Email <a href="mailto:support@trysakhi.com">support@trysakhi.com</a>. Do not send a full card number, CVV, bank password, UPI PIN or OTP. Support may ask for a masked transaction reference or payment identifier to verify the purchase.</p>
      </LegalSection>
    </LegalDocument>
  );
}
