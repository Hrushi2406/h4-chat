import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalNotice, LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = { title: "Privacy Policy" };

const sections = [
  { id: "scope", title: "1. Scope and data fiduciary" },
  { id: "collection", title: "2. Personal data we collect" },
  { id: "sources", title: "3. Sources of personal data" },
  { id: "purposes", title: "4. Purposes of processing" },
  { id: "ai-processing", title: "5. AI models and automated processing" },
  { id: "integrations", title: "6. Connected apps and MCP servers" },
  { id: "sharing", title: "7. How we disclose personal data" },
  { id: "providers", title: "8. Service providers and subprocessors" },
  { id: "public", title: "9. Public and shared content" },
  { id: "cookies", title: "10. Cookies and analytics" },
  { id: "retention", title: "11. Retention and deletion" },
  { id: "transfers", title: "12. International processing" },
  { id: "security", title: "13. Information security" },
  { id: "rights", title: "14. Your rights and choices" },
  { id: "children", title: "15. Children" },
  { id: "changes", title: "16. Changes to this Policy" },
  { id: "contact", title: "17. Contact and grievances" },
] as const;

export default function PrivacyPage() {
  return (
    <LegalDocument
      documentType="Privacy Policy"
      title="Privacy Policy"
      summary="This Privacy Policy describes how WestCoast Technologies LLP collects, uses, discloses, stores and protects personal data when you use Sakhi AI."
      sections={sections}
    >
      <LegalNotice>This Policy should be read with our <Link href="/legal/terms">Terms and Conditions</Link>. It is intended to give you clear notice of the personal data involved in Sakhi’s AI, file, memory, integration, sharing, automation and payment features.</LegalNotice>

      <LegalSection id="scope" title="1. Scope and data fiduciary">
        <p>This Policy applies to trysakhi.com, Sakhi applications and related support, payment and communication services (collectively, the “<strong>Services</strong>”). It does not govern a third-party service that processes data for its own purposes under its own privacy policy.</p>
        <p><strong>WestCoast Technologies LLP</strong>, having its registered office at 112 B, Parle Shopping, Monghibai Road, Vile Parle, Vileeparle (East), Mumbai, Maharashtra – 400057, India, is the operator of Sakhi and the entity responsible for the personal data described here. Under applicable Indian data-protection law, we act as the data fiduciary for processing whose purpose and means we determine.</p>
        <p>“Personal data” means data about an identifiable individual. “Process” includes collecting, storing, using, transmitting, disclosing and deleting personal data.</p>
      </LegalSection>

      <LegalSection id="collection" title="2. Personal data we collect">
        <p>The data we collect depends on how you use Sakhi:</p>
        <ul>
          <li><strong>Account and identity data:</strong> name, email address, profile image, Google account identifier, authentication records and account status.</li>
          <li><strong>Profile, preferences and memory:</strong> occupation, personalisation settings, model choices, interface settings and facts you ask Sakhi to remember.</li>
          <li><strong>Content:</strong> prompts, messages, responses, chat titles, feedback, instructions, uploaded files, filenames, images, extracted file content, tool inputs and tool results.</li>
          <li><strong>Integrations:</strong> connected-service identifiers, authorisation status and scopes, actions requested, information retrieved, connection metadata, and user-configured MCP server names, URLs, headers and tool definitions.</li>
          <li><strong>Helpers, sharing and automations:</strong> Helper instructions, public descriptions, logos, share links, author display information, usage counts, automation instructions, schedules, time zones, run history, results and errors.</li>
          <li><strong>Payments and entitlements:</strong> selected plan, billing interval, credit balance and consumption, transaction amount and status, and Razorpay customer, order, payment, mandate, subscription, refund and dispute identifiers. Sakhi does not receive or store your complete card number, bank password, UPI PIN or OTP.</li>
          <li><strong>Device, usage and network data:</strong> IP address, approximate location derived from IP, browser and device type, operating system, referring pages, timestamps, pages or features used, diagnostic events, cookies and local-storage identifiers.</li>
          <li><strong>Communications:</strong> waitlist submissions, support messages, privacy requests, complaints, grievances and related correspondence.</li>
        </ul>
        <p>Please do not submit passwords, authentication secrets, payment credentials, government identifiers, health data or other highly sensitive information unless a specific feature requires it, you are authorised to provide it, and you understand which provider or Connected Service will receive it.</p>
      </LegalSection>

      <LegalSection id="sources" title="3. Sources of personal data">
        <p>We receive personal data: (a) directly from you; (b) automatically from your device and use of the Services; (c) from identity and payment providers; (d) from Connected Services when you authorise access; (e) from people who share content with or about you; and (f) from publicly available sources when a feature you invoke retrieves such information.</p>
      </LegalSection>

      <LegalSection id="purposes" title="4. Purposes of processing">
        <p>We process personal data for the following purposes:</p>
        <ul>
          <li>to authenticate users, maintain Accounts and provide requested Services;</li>
          <li>to generate responses, process files, apply memories and route requests to selected AI models or tools;</li>
          <li>to connect third-party applications, operate MCP tools, execute automations and return results;</li>
          <li>to create public links or listings when you request sharing or publication;</li>
          <li>to process payments, activate entitlements, maintain credits, issue invoices or refunds and handle disputes;</li>
          <li>to provide support, verify and respond to rights requests, and redress grievances;</li>
          <li>to secure the Services, prevent fraud and abuse, debug failures and enforce our Terms;</li>
          <li>to analyse reliability and feature usage and improve the quality and usability of Sakhi; and</li>
          <li>to comply with law, lawful orders, tax and accounting duties, and establish or defend legal claims.</li>
        </ul>
        <p>Where applicable law requires consent, we will seek consent through an appropriate notice or product control. You may withdraw consent prospectively, but withdrawal does not affect processing already lawfully completed and may prevent us from providing a feature that requires the data.</p>
      </LegalSection>

      <LegalSection id="ai-processing" title="5. AI models and automated processing">
        <p>To answer a request, Sakhi may send relevant Input, conversation context, memories, files, tool results, system instructions and limited technical context to the AI model provider selected by you or by the relevant feature. Sakhi currently supports models supplied by providers that may include OpenAI, Anthropic, Google, DeepSeek, Moonshot AI, MiniMax and xAI.</p>
        <p>AI-generated Output is produced by automated systems and may contain inferences about the content you provide. Sakhi does not use AI Output as the sole basis for making legal or similarly significant decisions about you. Model providers process data as our service providers or under the terms applicable to the selected service. Their data location and retention practices may differ.</p>
        <p>We use content to deliver and secure your request and to improve Sakhi’s product experience. We do not sell your personal data. We do not authorise providers to use your content for their independent advertising.</p>
      </LegalSection>

      <LegalSection id="integrations" title="6. Connected apps and MCP servers">
        <p>When you connect a third-party app, Sakhi may exchange your instruction, relevant chat context, tool parameters and returned data with that app. Composio assists with supported app connections and credential handling. The connected app may also process data as an independent controller or data fiduciary under its own terms.</p>
        <p>A user-configured Model Context Protocol (“MCP”) server is a destination selected and configured by the user. The server operator may receive prompts, files, identifiers, tool inputs and other context needed for the action. MCP configuration may itself contain sensitive authentication headers. Add only servers you trust, grant the minimum permissions needed and remove connections you no longer use.</p>
      </LegalSection>

      <LegalSection id="sharing" title="7. How we disclose personal data">
        <p>We disclose personal data only as reasonably necessary in the following circumstances:</p>
        <ul>
          <li><strong>Service providers:</strong> to vendors that host, secure, analyse, support or process the Services on our behalf.</li>
          <li><strong>At your direction:</strong> to AI providers, Connected Services, MCP servers, recipients of shared links or other destinations you choose.</li>
          <li><strong>Legal and safety:</strong> where reasonably necessary to comply with law or lawful process; protect rights, safety and security; investigate fraud or abuse; or enforce agreements.</li>
          <li><strong>Corporate transactions:</strong> in connection with financing, reorganisation, merger, acquisition or sale of all or part of our business, subject to appropriate confidentiality and notice obligations.</li>
          <li><strong>With consent:</strong> for another purpose that we clearly explain and you authorise.</li>
        </ul>
        <p>We do not sell personal data or share it with data brokers.</p>
      </LegalSection>

      <LegalSection id="providers" title="8. Service providers and subprocessors">
        <p>The following categories and providers support material parts of Sakhi. A provider receives only the data reasonably required for its function. Providers may change as the Services evolve; we will update this Policy when a change materially affects processing.</p>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Provider or category</th><th>Purpose</th><th>Data commonly involved</th></tr></thead>
            <tbody>
              <tr><td>Google Firebase</td><td>Authentication, database, file storage and product analytics</td><td>Account, content, files, usage and technical data</td></tr>
              <tr><td>Vercel</td><td>Hosting, server functions, AI routing, analytics and approximate geolocation</td><td>Requests, prompts, technical and usage data</td></tr>
              <tr><td>OpenAI, Anthropic, Google, DeepSeek, Moonshot AI, MiniMax and xAI</td><td>AI model inference</td><td>Input, relevant context, files and tool results</td></tr>
              <tr><td>Composio</td><td>Connected-app authorisation and tool execution</td><td>Connection metadata, instructions, tool inputs and results</td></tr>
              <tr><td>Upstash</td><td>Scheduling and delivery of automation jobs</td><td>Automation identifiers, schedules and execution metadata</td></tr>
              <tr><td>Razorpay and payment networks</td><td>Checkout, mandates, subscriptions, payments, refunds and fraud prevention</td><td>Contact, transaction, payment and billing metadata</td></tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection id="public" title="9. Public and shared content">
        <p>Content is not public merely because you create it. If you use a sharing or publishing feature, the selected chat, prompt, Helper or other material—and potentially its title, your display name, author image or usage count—may become accessible to anyone with the link or through a public listing.</p>
        <p>Search engines, recipients and third parties may copy or retain public material. Remove personal and confidential information before publishing. Unpublishing prevents new access through our interface but may not remove copies held elsewhere.</p>
      </LegalSection>

      <LegalSection id="cookies" title="10. Cookies and analytics">
        <p>We use cookies and browser storage that are necessary for authentication, security, preferences, navigation and core service operation. We also use Firebase Analytics and Vercel Analytics to understand performance and feature usage. These technologies may process device, event and approximate network-location data.</p>
        <p>You can restrict cookies through browser or device settings. Blocking necessary storage may prevent sign-in or other parts of the Services from functioning. Where applicable law requires an additional choice for non-essential analytics, we will provide that choice.</p>
      </LegalSection>

      <LegalSection id="retention" title="11. Retention and deletion">
        <p>We retain personal data only for as long as reasonably necessary for the purposes described here, including to provide an active Account, maintain security, resolve disputes and meet legal, tax, accounting or regulatory duties.</p>
        <ul>
          <li>Account settings, chats, files, memories and integration data are generally retained while your Account or the relevant content remains active.</li>
          <li>Public content is retained until you unshare, unpublish or request removal, subject to copies made by others.</li>
          <li>Payment, invoice, tax, fraud and dispute records are retained for the period required by applicable law and legitimate recordkeeping needs.</li>
          <li>Security logs and backups are retained for limited operational cycles and deleted or overwritten in the ordinary course.</li>
        </ul>
        <p>Deletion from active systems may not be immediate in encrypted backups. We may retain limited data where necessary to comply with law, prevent fraud or abuse, enforce agreements, or establish or defend claims.</p>
      </LegalSection>

      <LegalSection id="transfers" title="12. International processing">
        <p>Sakhi and its providers may process personal data in India, the United States and other countries where the providers operate. Those countries may have data-protection laws different from those in your location. We use contractual, organisational and technical measures appropriate to the nature of the processing and comply with applicable restrictions on cross-border transfers.</p>
      </LegalSection>

      <LegalSection id="security" title="13. Information security">
        <p>We use reasonable administrative, technical and organisational safeguards designed to protect personal data, including access controls, encrypted transmission, provider security controls, authentication and monitoring. No online service can guarantee absolute security.</p>
        <p>You are responsible for securing your Account, devices, connected services and MCP credentials. If you believe your Account or data has been compromised, contact us promptly at <a href="mailto:support@trysakhi.com">support@trysakhi.com</a>.</p>
      </LegalSection>

      <LegalSection id="rights" title="14. Your rights and choices">
        <p>Subject to applicable law and reasonable identity verification, you may request:</p>
        <ul>
          <li>confirmation and a summary of personal data being processed;</li>
          <li>access to personal data and available information about processing or recipients;</li>
          <li>correction, completion or updating of inaccurate personal data;</li>
          <li>erasure of personal data that is no longer necessary or required to be retained;</li>
          <li>withdrawal of consent for future processing where consent is the applicable basis;</li>
          <li>redressal of a grievance; and</li>
          <li>nomination or any other right available under applicable data-protection law.</li>
        </ul>
        <p>Product controls may also let you edit memories, disconnect apps, remove MCP servers, delete chats, stop automations and disable public links. To exercise a right, email <a href="mailto:support@trysakhi.com">support@trysakhi.com</a> from the address associated with your Account and describe your request. We will respond within the period required by applicable law.</p>
      </LegalSection>

      <LegalSection id="children" title="15. Children">
        <p>The Services are intended only for persons aged <strong>18 years or older</strong>. We do not knowingly collect personal data from a child. If you believe a person under 18 has provided personal data, contact us so we can investigate and take appropriate action.</p>
      </LegalSection>

      <LegalSection id="changes" title="16. Changes to this Policy">
        <p>We may update this Policy to reflect changes in the Services, providers or applicable law. We will post the revised version with a new effective date and provide reasonable notice through the Services or by email where a change materially affects your rights or our processing.</p>
      </LegalSection>

      <LegalSection id="contact" title="17. Contact and grievances">
        <address>
          <strong>WestCoast Technologies LLP</strong><br />
          Attn: Grievance Officer<br />
          112 B, Parle Shopping, Monghibai Road, Vile Parle,<br />
          Vileeparle (East), Mumbai, Maharashtra – 400057, India<br />
          Email: <a href="mailto:support@trysakhi.com">support@trysakhi.com</a>
        </address>
        <p>Use the subject “Privacy Request” or “Grievance” and include enough information to identify your Account and concern. Do not send passwords, card numbers, PINs or OTPs. Further details appear on our <Link href="/legal/contact">Contact and Grievance page</Link>.</p>
      </LegalSection>
    </LegalDocument>
  );
}
