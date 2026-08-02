import type { Metadata } from "next";
import { LegalDocument, LegalNotice, LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = { title: "Contact and Grievance Redressal" };

const sections = [
  { id: "business", title: "1. Business information" },
  { id: "support", title: "2. Customer support" },
  { id: "grievance", title: "3. Grievance redressal" },
  { id: "privacy", title: "4. Privacy and content requests" },
  { id: "payment", title: "5. Payment and refund requests" },
  { id: "safety", title: "6. Safety notice" },
] as const;

export default function ContactPage() {
  return (
    <LegalDocument documentType="Contact and Grievance Redressal" title="Contact and Grievance Redressal" summary="Official business, support and grievance contact information for Sakhi AI and WestCoast Technologies LLP." sections={sections}>
      <LegalNotice>For the fastest verification, write from the email address associated with your Sakhi Account and use a descriptive subject line. We provide support by email and do not publish a customer-support telephone number.</LegalNotice>

      <LegalSection id="business" title="1. Business information">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-[11rem_1fr]">
          <dt className="font-medium text-foreground">Legal entity</dt><dd>WestCoast Technologies LLP</dd>
          <dt className="font-medium text-foreground">Product / trade name</dt><dd>Sakhi AI</dd>
          <dt className="font-medium text-foreground">Website</dt><dd><a href="https://trysakhi.com">trysakhi.com</a></dd>
          <dt className="font-medium text-foreground">Registered office</dt><dd>112 B, Parle Shopping, Monghibai Road, Vile Parle, Vileeparle (East), Mumbai, Maharashtra – 400057, India</dd>
          <dt className="font-medium text-foreground">Support email</dt><dd><a href="mailto:support@trysakhi.com">support@trysakhi.com</a></dd>
        </dl>
      </LegalSection>

      <LegalSection id="support" title="2. Customer support">
        <p>For Account access, product operation, files, chats, Helpers, integrations, automations, subscriptions or credits, email <a href="mailto:support@trysakhi.com">support@trysakhi.com</a>. Include the Account email, a concise description, when the issue occurred and any non-sensitive identifier or screenshot that helps reproduce it.</p>
      </LegalSection>

      <LegalSection id="grievance" title="3. Grievance redressal">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-[11rem_1fr]">
          <dt className="font-medium text-foreground">Designation</dt><dd>Grievance Officer</dd>
          <dt className="font-medium text-foreground">Organisation</dt><dd>WestCoast Technologies LLP</dd>
          <dt className="font-medium text-foreground">Email</dt><dd><a href="mailto:support@trysakhi.com">support@trysakhi.com</a></dd>
          <dt className="font-medium text-foreground">Postal address</dt><dd>112 B, Parle Shopping, Monghibai Road, Vile Parle, Vileeparle (East), Mumbai, Maharashtra – 400057, India</dd>
        </dl>
        <p>Use the subject line “<strong>Grievance</strong>”. State your name, Account email, the facts of the complaint, the affected content or transaction, the relief requested and any relevant reference number. We aim to acknowledge a complete grievance within 48 hours and resolve it within one month or the shorter period required by applicable law.</p>
        <p>We may ask for reasonable information to verify identity, ownership or authority. A request made for another person should include evidence of authority where legally required.</p>
      </LegalSection>

      <LegalSection id="privacy" title="4. Privacy and content requests">
        <p>Use the subject “Privacy Request” to request access, correction, completion, updating, erasure, withdrawal of consent or grievance redressal relating to personal data. Use the subject “Content Report” to identify publicly shared content that you believe violates your privacy, intellectual property or other rights.</p>
        <p>Explain the affected information and provide the exact public URL where relevant. Requests are handled in accordance with our <a href="/legal/privacy">Privacy Policy</a> and applicable law.</p>
      </LegalSection>

      <LegalSection id="payment" title="5. Payment and refund requests">
        <p>For a payment, subscription, invoice or refund concern, include the payment date, amount and relevant Razorpay payment, order, refund or subscription ID. Refund rules and processing times appear in our <a href="/legal/refunds">Cancellation and Refund Policy</a>.</p>
      </LegalSection>

      <LegalSection id="safety" title="6. Safety notice">
        <p>Never send us your password, complete card number, CVV, bank password, UPI PIN, OTP, API key or MCP authentication secret. Sakhi is not an emergency service. If there is an immediate risk to life, safety or property, contact the appropriate local emergency authority.</p>
      </LegalSection>
    </LegalDocument>
  );
}
