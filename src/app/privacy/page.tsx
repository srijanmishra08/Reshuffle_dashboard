import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy | ReShuffle OS",
  description: "What ReShuffle OS stores, how it uses Google sign-in and Gmail, and how to remove access.",
};

export const dynamic = "force-dynamic";

const updated = "19 November 2026";

export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 text-sm leading-6 text-slate-700">
      <h1 className="text-2xl font-semibold text-slate-900">ReShuffle OS: privacy policy</h1>
      <p className="mt-1 text-xs text-slate-500">Last updated {updated}</p>

      <p className="mt-6">
        ReShuffle OS is the private business dashboard used by the ReShuffle team and by the clients, partner agencies and
        freelancers the team invites. It is not open to the public. Access is limited to email addresses that an administrator
        has approved.
      </p>

      <h2 className="mt-8 text-base font-semibold text-slate-900">What we store</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your name, email address and profile picture from your Google account, when you sign in.</li>
        <li>Business records the team enters: clients, contacts, leads, projects, invoices, documents and notes.</li>
        <li>A log of actions taken in the dashboard, and of emails the dashboard sent.</li>
      </ul>

      <h2 className="mt-8 text-base font-semibold text-slate-900">Google sign-in</h2>
      <p className="mt-2">
        We use Google sign-in only to confirm who you are. We receive your name, email address and picture. We do not receive
        your Google password.
      </p>

      <h2 className="mt-8 text-base font-semibold text-slate-900">Gmail: sending only</h2>
      <p className="mt-2">
        An administrator can connect one company Gmail account so the dashboard can send emails such as follow-ups, sign-in
        invitations, links to scopes of work and a daily summary of due follow-ups. This uses the single Google permission
        &ldquo;Send email on your behalf&rdquo; (<code>gmail.send</code>).
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>The dashboard cannot read, search, change or delete any email in the connected mailbox.</li>
        <li>It sends a message only when a team member clicks send, or for the daily summary sent to team members.</li>
        <li>The access token Google gives us is stored encrypted and is used for nothing except sending those emails.</li>
        <li>
          The dashboard&apos;s use of information received from Google APIs follows the{" "}
          <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </li>
      </ul>

      <h2 className="mt-8 text-base font-semibold text-slate-900">How we use and share data</h2>
      <p className="mt-2">
        Data is used to run the business and its client work. We do not sell it, use it for advertising, or share it with
        third parties except the service providers that host and run the dashboard (database, file storage and web hosting).
      </p>

      <h2 className="mt-8 text-base font-semibold text-slate-900">Removing access and deleting data</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>An administrator can remove your sign-in at any time. Your access ends at once.</li>
        <li>An administrator can disconnect Gmail in Settings, which deletes the stored token.</li>
        <li>
          You can also revoke the permission yourself at{" "}
          <a className="underline" href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </li>
        <li>To ask for your data to be corrected or deleted, contact us below.</li>
      </ul>

      <h2 className="mt-8 text-base font-semibold text-slate-900">Contact</h2>
      <p className="mt-2">
        {contact ? (
          <>
            Write to <a className="underline" href={`mailto:${contact}`}>{contact}</a>.
          </>
        ) : (
          "Contact your ReShuffle administrator."
        )}
      </p>

      <p className="mt-10 text-xs">
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
