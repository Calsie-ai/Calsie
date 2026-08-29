import { CALSIE_CONTACT_EMAIL } from "../../lib/contact";

export const GMAIL_PRIVACY_POLICY_VERSION = "2026-07-30";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export const GMAIL_PRIVACY_SUMMARY = [
  [
    "Calsie collects and uses account, resume, campaign, job and application information only to provide and protect the job-application service chosen by the user.",
    "When a user connects a Google account, Calsie may receive the user's email address, basic account details and the permission needed to send approved job-application emails from that account.",
    "Calsie only sends an application after the user has reviewed and approved it.",
  ].join(" "),
  [
    "Calsie does not read or search the user's inbox, access existing emails, view contacts, move or delete messages, sell personal information or use Google account data for advertising.",
    "Existing email content is not provided to artificial intelligence systems.",
    "Calsie may use the user's resume, selected job details and application information to prepare tailored application documents and messages.",
  ].join(" "),
  [
    "Calsie uses trusted service providers to help protect user accounts and information.",
    "Google provides secure account connection and authorisation, while Supabase provides protected sign-in, database and file-storage services.",
    "Calsie also uses secure hosting systems to operate the website.",
    "Personal information is shared with service providers only when necessary to operate, maintain and protect the service, and is not shared with advertisers, data brokers or information resellers.",
  ].join(" "),
  [
    "A separate or dedicated Google account created specifically for job applications is required before connecting Google to a Calsie campaign.",
    "This keeps employment activity separate from personal emails and sensitive records.",
    `A user may disconnect the Google account at any time through Google Account settings and may request access, correction or deletion of Calsie information by contacting ${CALSIE_CONTACT_EMAIL}.`,
  ].join(" "),
  "Calsie handles information received from Google in accordance with Google's user-data and privacy requirements. Last updated: 30 July 2026.",
] as const;

export const GMAIL_CONNECTION_CONSENT_TEXT =
  "I agree to the Calsie Privacy Policy and authorise Calsie to connect my Google account, sending job-application emails only after I approve them.";

export const GMAIL_DEDICATED_EMAIL_CONFIRMATION_TEXT =
  "I confirm I have created a separate or dedicated email account for my Calsie campaign.";
