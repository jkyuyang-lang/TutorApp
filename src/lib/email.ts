import nodemailer from "nodemailer";

// Use Resend when RESEND_API_KEY is set, otherwise fall back to SMTP (Gmail)
const useResend = !!process.env.RESEND_API_KEY;

const DEFAULT_FROM = process.env.EMAIL_FROM ?? "TutorApp <notifications@tutorapp.com>";
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN ?? "tutorapp.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// SMTP transport (Gmail or any SMTP provider)
let smtpTransport: ReturnType<typeof nodemailer.createTransport> | null = null;
if (!useResend && process.env.SMTP_USER && process.env.SMTP_PASS) {
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Build a per-tutor from address.
 * Only used when a custom domain is configured (Resend mode).
 * In Gmail/SMTP mode, all emails come from the SMTP_USER address.
 */
export function tutorFromAddress(emailAlias: string | null, tutorName: string) {
  if (!useResend || !emailAlias) return DEFAULT_FROM;
  return `${tutorName} <${emailAlias}@${EMAIL_DOMAIN}>`;
}

export async function sendEmail({ to, subject, html, from }: SendEmailOptions) {
  // In SMTP/Gmail mode, ignore custom `from` — Gmail only sends from the authenticated account
  if (useResend) {
    return sendViaResend({ to, subject, html, from });
  }
  if (smtpTransport) {
    return sendViaSmtp({ to, subject, html });
  }

  console.warn("[email] No email provider configured, skipping:", subject);
  return null;
}

async function sendViaResend({ to, subject, html, from }: SendEmailOptions) {
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: from ?? DEFAULT_FROM,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[email] Resend failed:", err);
    return null;
  }
}

async function sendViaSmtp({ to, subject, html }: SendEmailOptions) {
  if (!smtpTransport) return null;

  try {
    const info = await smtpTransport.sendMail({
      from: DEFAULT_FROM,
      to,
      subject,
      html,
    });
    return { id: info.messageId };
  } catch (err) {
    console.error("[email] SMTP failed:", err);
    return null;
  }
}

// --- Email templates ---

function baseLayout(content: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      ${content}
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
      <p style="color: #888; font-size: 12px;">
        You're receiving this because you have an account on <a href="${SITE_URL}" style="color: #888;">TutorApp</a>.
      </p>
    </div>
  `;
}

export function lessonBookedEmail(opts: {
  recipientName: string;
  otherPartyName: string;
  subject: string;
  date: string;
  time: string;
  lessonId: string;
  isForTutor: boolean;
}) {
  const heading = opts.isForTutor ? "New Lesson Booked" : "Lesson Confirmed";
  const body = opts.isForTutor
    ? `<strong>${opts.otherPartyName}</strong> booked a <strong>${opts.subject}</strong> lesson with you.`
    : `Your <strong>${opts.subject}</strong> lesson with <strong>${opts.otherPartyName}</strong> has been confirmed.`;

  return {
    subject: `${heading}: ${opts.subject} on ${opts.date}`,
    html: baseLayout(`
      <h2 style="color: #111; margin: 0 0 16px;">${heading}</h2>
      <p style="color: #333; font-size: 15px; line-height: 1.5;">${body}</p>
      <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0; color: #333;"><strong>Date:</strong> ${opts.date}</p>
        <p style="margin: 4px 0; color: #333;"><strong>Time:</strong> ${opts.time}</p>
        <p style="margin: 4px 0; color: #333;"><strong>Subject:</strong> ${opts.subject}</p>
      </div>
      <a href="${SITE_URL}/lessons/${opts.lessonId}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">View Lesson</a>
    `),
  };
}

export function lessonCanceledEmail(opts: {
  recipientName: string;
  canceledByName: string;
  subject: string;
  date: string;
  time: string;
  reason?: string;
  isLateCancel: boolean;
}) {
  const heading = opts.isLateCancel ? "Lesson Canceled (Late)" : "Lesson Canceled";

  return {
    subject: `${heading}: ${opts.subject} on ${opts.date}`,
    html: baseLayout(`
      <h2 style="color: #111; margin: 0 0 16px;">${heading}</h2>
      <p style="color: #333; font-size: 15px; line-height: 1.5;">
        <strong>${opts.canceledByName}</strong> canceled the <strong>${opts.subject}</strong> lesson.
      </p>
      <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0; color: #333;"><strong>Date:</strong> ${opts.date}</p>
        <p style="margin: 4px 0; color: #333;"><strong>Time:</strong> ${opts.time}</p>
        ${opts.reason ? `<p style="margin: 4px 0; color: #333;"><strong>Reason:</strong> ${opts.reason}</p>` : ""}
      </div>
      <a href="${SITE_URL}/lessons" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">View Lessons</a>
    `),
  };
}

export function lessonChangedEmail(opts: {
  recipientName: string;
  changedByName: string;
  subject: string;
  date: string;
  time: string;
  changeDescription: string;
  lessonId: string;
}) {
  return {
    subject: `Lesson Updated: ${opts.subject} on ${opts.date}`,
    html: baseLayout(`
      <h2 style="color: #111; margin: 0 0 16px;">Lesson Updated</h2>
      <p style="color: #333; font-size: 15px; line-height: 1.5;">
        <strong>${opts.changedByName}</strong> updated the <strong>${opts.subject}</strong> lesson.
      </p>
      <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0; color: #333;"><strong>Date:</strong> ${opts.date}</p>
        <p style="margin: 4px 0; color: #333;"><strong>Time:</strong> ${opts.time}</p>
        <p style="margin: 4px 0; color: #333;"><strong>Change:</strong> ${opts.changeDescription}</p>
      </div>
      <a href="${SITE_URL}/lessons/${opts.lessonId}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">View Lesson</a>
    `),
  };
}

export function tutorApplicationReceivedEmail(opts: {
  firstName: string;
}) {
  return {
    subject: "We received your tutor application!",
    html: baseLayout(`
      <h2 style="color: #111; margin: 0 0 16px;">Application Received</h2>
      <p style="color: #333; font-size: 15px; line-height: 1.5;">
        Hi ${opts.firstName}, thanks for your interest in joining our tutoring team!
      </p>
      <p style="color: #333; font-size: 15px; line-height: 1.5;">
        We've received your application and will review it shortly. Someone from our team will be in touch soon.
      </p>
      <p style="color: #888; font-size: 14px; margin-top: 24px;">
        If you have any questions in the meantime, feel free to reply to this email.
      </p>
    `),
  };
}

export function tutorApplicationStatusEmail(opts: {
  firstName: string;
  status: "approved" | "needs_more_info" | "denied";
  inviteToken?: string;
}) {
  const setupUrl = opts.inviteToken ? `${SITE_URL}/tutor-setup/${opts.inviteToken}` : null;

  const statusMessages = {
    approved: {
      heading: "You're Approved — Welcome to the Team!",
      body: `Great news, ${opts.firstName}! Your tutor application has been approved. Click the button below to set up your password and create your tutor profile. You'll be able to set your rates, availability, subjects, and more.`,
      cta: setupUrl
        ? `<a href="${setupUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 600; margin-top: 8px;">Set Up Your Profile</a>`
        : "",
    },
    needs_more_info: {
      heading: "Additional Information Needed",
      body: `Hi ${opts.firstName}, thank you for your application. We'd like to learn a bit more before making a decision. Someone from our team will reach out shortly with details on what we need.`,
      cta: "",
    },
    denied: {
      heading: "Application Update",
      body: `Hi ${opts.firstName}, thank you for your interest in tutoring with us. After careful review, we're unable to move forward with your application at this time. We encourage you to apply again in the future.`,
      cta: "",
    },
  };

  const { heading, body, cta } = statusMessages[opts.status];

  return {
    subject: heading,
    html: baseLayout(`
      <h2 style="color: #111; margin: 0 0 16px;">${heading}</h2>
      <p style="color: #333; font-size: 15px; line-height: 1.5;">${body}</p>
      ${cta}
    `),
  };
}

export function newMessageEmail(opts: {
  recipientName: string;
  senderName: string;
  preview: string;
  conversationId: string;
}) {
  const truncated = opts.preview.length > 150 ? opts.preview.slice(0, 150) + "..." : opts.preview;

  return {
    subject: `New message from ${opts.senderName}`,
    html: baseLayout(`
      <h2 style="color: #111; margin: 0 0 16px;">New Message</h2>
      <p style="color: #333; font-size: 15px; line-height: 1.5;">
        <strong>${opts.senderName}</strong> sent you a message:
      </p>
      <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${truncated}</p>
      </div>
      <a href="${SITE_URL}/messages/${opts.conversationId}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">Reply</a>
    `),
  };
}
