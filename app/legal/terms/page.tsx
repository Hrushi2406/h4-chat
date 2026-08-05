import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalNotice, LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = { title: "Terms and Conditions" };

const sections = [
  { id: "acceptance", title: "1. Acceptance and scope" },
  { id: "definitions", title: "2. Definitions" },
  { id: "eligibility", title: "3. Eligibility and accounts" },
  { id: "services", title: "4. The Services" },
  { id: "content", title: "5. Your Content and Output" },
  { id: "ai-limitations", title: "6. AI limitations and responsibility" },
  { id: "integrations", title: "7. Connected services and actions" },
  { id: "public-content", title: "8. Sharing and public content" },
  { id: "acceptable-use", title: "9. Acceptable use" },
  { id: "paid-services", title: "10. Paid Services" },
  { id: "intellectual-property", title: "11. Our intellectual property" },
  { id: "feedback", title: "12. Feedback" },
  { id: "suspension", title: "13. Suspension and termination" },
  { id: "disclaimers", title: "14. Disclaimers" },
  { id: "liability", title: "15. Limitation of liability" },
  { id: "indemnity", title: "16. Indemnity" },
  { id: "general", title: "17. General terms" },
  { id: "law", title: "18. Governing law and contact" },
] as const;

export default function TermsPage() {
  return (
    <LegalDocument
      documentType="Terms and Conditions"
      title="Terms and Conditions"
      summary="These Terms form a binding agreement governing your access to and use of Sakhi AI, including its AI models, files, memory, Helpers, integrations, automations, sharing features, subscriptions and credits."
      sections={sections}
    >
      <LegalNotice><strong>Please read these Terms carefully.</strong> By accessing or using the Services, creating an account, or purchasing a Paid Service, you confirm that you have read, understood and agree to be bound by these Terms and the policies incorporated into them.</LegalNotice>

      <LegalSection id="acceptance" title="1. Acceptance and scope">
        <p>Sakhi AI is operated by <strong>WestCoast Technologies LLP</strong>, a limited liability partnership registered in India, having its registered office at 112 B, Parle Shopping, Monghibai Road, Vile Parle, Vileeparle (East), Mumbai, Maharashtra – 400057, India.</p>
        <p>These Terms and Conditions (“<strong>Terms</strong>”) apply to trysakhi.com, Sakhi applications and every feature or service we make available under the Sakhi name (collectively, the “<strong>Services</strong>”). “<strong>Sakhi</strong>”, “<strong>we</strong>”, “<strong>us</strong>” and “<strong>our</strong>” mean WestCoast Technologies LLP.</p>
        <p>Our <Link href="/legal/privacy">Privacy Policy</Link>, <Link href="/legal/subscription-terms">Subscription and Credits Terms</Link>, <Link href="/legal/refunds">Cancellation and Refund Policy</Link>, and any feature-specific notices presented to you are incorporated into these Terms by reference. If you do not agree, you must not access or use the Services.</p>
      </LegalSection>

      <LegalSection id="definitions" title="2. Definitions">
        <ul>
          <li><strong>Account</strong> means the account used to access the Services.</li>
          <li><strong>Input</strong> means prompts, files, images, instructions, data, tool parameters and other material you submit or make available to the Services.</li>
          <li><strong>Output</strong> means text, images, analysis, suggestions, tool results or other material generated or returned in response to Input.</li>
          <li><strong>Your Content</strong> means Input and, as between you and Sakhi, Output.</li>
          <li><strong>Connected Service</strong> means a third-party application, model provider, MCP server, website or service accessed through or linked to Sakhi.</li>
          <li><strong>Paid Services</strong> means subscriptions, credit recharges and other paid features offered by Sakhi.</li>
        </ul>
      </LegalSection>

      <LegalSection id="eligibility" title="3. Eligibility and accounts">
        <p>You must be at least <strong>18 years old</strong> and legally capable of entering into a binding contract to use the Services. If you use the Services for an organisation, you represent that you have authority to bind that organisation, and “you” includes that organisation.</p>
        <p>You must provide accurate account information, keep it current, maintain the confidentiality of your login and connected-account permissions, and promptly notify us at <a href="mailto:support@trysakhi.com">support@trysakhi.com</a> of suspected unauthorised access. You are responsible for activities conducted through your Account unless caused by our breach of these Terms.</p>
        <p>You may not sell, transfer, share or make your Account available to another person, or create Accounts through automated or deceptive means. We may require reasonable verification to protect an Account or comply with law.</p>
      </LegalSection>

      <LegalSection id="services" title="4. The Services">
        <p>Sakhi is a general-purpose AI assistant. Depending on availability and your plan, it may generate or analyse content, process files, retain user-directed memories, use different AI models, connect to third-party applications, use user-configured MCP servers, create or publish Helpers, share chats or prompts, and execute scheduled automations.</p>
        <p>We may add, modify, limit, suspend or discontinue features to improve the Services, respond to provider changes, protect security or comply with law. We do not guarantee that any model, integration, feature or usage limit will always remain available. If we discontinue a material Paid Service before the end of a prepaid period, the remedy described in our Refund Policy will apply.</p>
      </LegalSection>

      <LegalSection id="content" title="5. Your Content and Output">
        <p><strong>Ownership.</strong> As between you and Sakhi, you retain your rights in Input and, to the extent permitted by applicable law, own Output. AI-generated material may not qualify for intellectual-property protection in every jurisdiction, and similar or identical Output may be generated for other users.</p>
        <p><strong>Permission to operate the Services.</strong> You grant us and our service providers a worldwide, non-exclusive, royalty-free licence to host, reproduce, process, transmit, display and otherwise use Your Content only as reasonably necessary to provide, maintain, secure, troubleshoot and improve the Services, comply with law, and carry out your instructions. This licence ends when the relevant content is deleted from active systems, subject to reasonable backup, security and legal-retention periods.</p>
        <p><strong>Your responsibility.</strong> You represent that you possess all rights, permissions and lawful bases needed to submit Input and instruct us to process it. Your Content and use of it must not violate law, confidentiality duties, intellectual-property rights, privacy rights or these Terms.</p>
      </LegalSection>

      <LegalSection id="ai-limitations" title="6. AI limitations and responsibility">
        <p>Artificial intelligence and automated tools are probabilistic. Output may be inaccurate, incomplete, misleading, offensive, outdated or unsuitable for your purpose. It may not reflect current events or the views of Sakhi. You must independently evaluate Output and use appropriate human review before relying on it or acting on it.</p>
        <p>The Services are not a substitute for advice from a qualified professional and are not designed for emergency use. Do not rely on Sakhi as the sole basis for medical, legal, financial, employment, credit, insurance, safety-critical or other high-impact decisions about a person. You remain responsible for decisions, communications and actions taken using Output.</p>
      </LegalSection>

      <LegalSection id="integrations" title="7. Connected services and actions">
        <p>When you connect or invoke a Connected Service, you authorise Sakhi and its integration providers to send the Input, context, credentials or parameters reasonably required to perform your instruction, and to return results to Sakhi. Connected Services are governed by their own terms and privacy practices.</p>
        <p>You are responsible for choosing trusted services, configuring permissions, reviewing requested scopes and verifying consequential actions before or after execution. This includes sending messages, posting content, changing or deleting records, scheduling events, making purchases and performing other external actions. We are not responsible for a Connected Service’s independent acts, omissions, availability, content or security, except to the extent liability cannot be excluded by law.</p>
      </LegalSection>

      <LegalSection id="public-content" title="8. Sharing and public content">
        <p>Certain features allow you to create public links, shared chats, prompt pages or published Helpers. By publishing or sharing, you direct us to make the selected content and associated display information available to people who can access the link or listing. They may view, copy or redistribute it.</p>
        <p>You must review content before sharing and remove confidential, personal or third-party information you are not authorised to disclose. Disabling a link stops future access through that link but cannot retract copies already made by others.</p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="9. Acceptable use">
        <p>You must comply with applicable law and may not use the Services to:</p>
        <ul>
          <li>violate another person’s rights, privacy or contractual obligations;</li>
          <li>commit or facilitate fraud, deception, impersonation, phishing, spam, malware, unauthorised surveillance or unlawful access;</li>
          <li>exploit, endanger, groom or sexualise a child, or create child sexual abuse material;</li>
          <li>harass, threaten, defame or unlawfully discriminate against another person;</li>
          <li>generate or distribute illegal content or instructions that materially facilitate serious harm;</li>
          <li>access accounts, systems or information without authorisation;</li>
          <li>circumvent safeguards, rate limits, payment controls, usage restrictions or security measures;</li>
          <li>reverse engineer, scrape or extract the Services or underlying models except where applicable law expressly permits it;</li>
          <li>misrepresent AI-generated material as human-generated where disclosure is legally required; or</li>
          <li>interfere with the Services or impose an unreasonable or abusive load.</li>
        </ul>
        <p>We may investigate suspected misuse and preserve or disclose relevant information where reasonably necessary to protect the Services, users or the public, or as required by law.</p>
      </LegalSection>

      <LegalSection id="paid-services" title="10. Paid Services">
        <p>Prices, billing intervals, included credits and material plan features are displayed before purchase. All prices displayed by Sakhi are inclusive of applicable GST unless checkout expressly states otherwise. Payments are processed by Razorpay and participating banks or payment networks.</p>
        <p>Subscriptions may renew automatically until cancelled. Credits are limited, non-transferable service units and are not cash, stored value or legal tender. Paid Services are additionally governed by our <Link href="/legal/subscription-terms">Subscription and Credits Terms</Link> and <Link href="/legal/refunds">Cancellation and Refund Policy</Link>.</p>
      </LegalSection>

      <LegalSection id="intellectual-property" title="11. Our intellectual property">
        <p>The Services, including the Sakhi name and marks, software, interfaces, design, documentation and other materials supplied by us, are owned by or licensed to WestCoast Technologies LLP and are protected by applicable intellectual-property laws. Subject to these Terms, we grant you a limited, revocable, non-exclusive, non-transferable right to use the Services for their intended purpose.</p>
        <p>No rights are granted except as expressly stated. You may not copy, modify, distribute, sell, lease or create derivative works from our technology or branding without written permission.</p>
      </LegalSection>

      <LegalSection id="feedback" title="12. Feedback">
        <p>If you voluntarily provide ideas, suggestions or feedback about Sakhi, you grant us a perpetual, irrevocable, worldwide, royalty-free right to use it without restriction or compensation. This does not transfer ownership of Your Content submitted for ordinary use of the Services.</p>
      </LegalSection>

      <LegalSection id="suspension" title="13. Suspension and termination">
        <p>You may stop using the Services at any time. You may cancel a subscription as described in the Subscription Terms. We may limit, suspend or terminate access where reasonably necessary to address non-payment, protect security or users, investigate misuse, comply with law, enforce these Terms or manage a material service risk.</p>
        <p>Where practicable and legally permitted, we will provide notice and an opportunity to remedy the issue or appeal by contacting support. On termination, your right to use the Services ends. Clauses which by their nature should survive—including ownership, payment obligations, disclaimers, liability, indemnity and dispute provisions—will survive.</p>
      </LegalSection>

      <LegalSection id="disclaimers" title="14. Disclaimers">
        <p>To the maximum extent permitted by applicable law, the Services are provided “<strong>as is</strong>” and “<strong>as available</strong>”. We disclaim implied warranties of merchantability, fitness for a particular purpose, accuracy, non-infringement and uninterrupted availability. We do not warrant that Output will be accurate or unique, that errors will be corrected, or that every integration or model will remain available.</p>
        <p>Nothing in these Terms excludes statutory guarantees or consumer rights that cannot lawfully be excluded or waived.</p>
      </LegalSection>

      <LegalSection id="liability" title="15. Limitation of liability">
        <p>To the maximum extent permitted by law, neither WestCoast Technologies LLP nor its partners, employees, affiliates or service providers will be liable for indirect, incidental, special, exemplary, punitive or consequential loss, or loss of profits, revenue, goodwill, data or business opportunity, arising from the Services.</p>
        <p>Our total aggregate liability arising out of or relating to a Paid Service will not exceed the greater of (a) the amount you paid to us for that Paid Service during the three months immediately preceding the event giving rise to the claim, or (b) INR 1,000. For free Services, total aggregate liability will not exceed INR 1,000. These limits do not apply to fraud, wilful misconduct, or liability that cannot lawfully be limited.</p>
      </LegalSection>

      <LegalSection id="indemnity" title="16. Indemnity">
        <p>If you use the Services on behalf of a business or organisation, that entity will indemnify and hold harmless WestCoast Technologies LLP and its personnel from third-party claims, losses and reasonable costs arising from its unlawful use of the Services, Your Content, violation of these Terms or infringement of another person’s rights. This clause does not apply to individual consumers to the extent prohibited by applicable law.</p>
      </LegalSection>

      <LegalSection id="general" title="17. General terms">
        <p><strong>Changes.</strong> We may update these Terms prospectively to reflect changes to the Services, law or risk. We will post the revised Terms with a new effective date and provide reasonable notice of material changes. Continued use after the effective date constitutes acceptance where permitted by law.</p>
        <p><strong>Assignment.</strong> You may not assign these Terms without our prior written consent. We may assign them as part of a merger, reorganisation, sale of business or by operation of law, subject to applicable consumer rights.</p>
        <p><strong>Severability and waiver.</strong> If a provision is held unenforceable, it will be enforced to the maximum permissible extent and the remaining provisions remain effective. Failure to enforce a provision is not a waiver.</p>
        <p><strong>Entire agreement.</strong> These Terms and incorporated policies constitute the entire agreement between you and us concerning the Services and supersede prior discussions on that subject.</p>
      </LegalSection>

      <LegalSection id="law" title="18. Governing law and contact">
        <p>These Terms are governed by the laws of India. Subject to any non-waivable consumer forum or jurisdiction available under applicable law, the courts at Mumbai, Maharashtra will have exclusive jurisdiction over disputes arising from these Terms or the Services.</p>
        <p>Before filing a claim, please contact us and allow a reasonable opportunity to resolve the concern. Notices and questions may be sent to <a href="mailto:support@trysakhi.com">support@trysakhi.com</a> or to our registered office listed above. Grievance details are available on our <Link href="/legal/contact">Contact and Grievance page</Link>.</p>
      </LegalSection>
    </LegalDocument>
  );
}
