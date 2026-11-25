export { CARRIER_OPTIONS } from "./carriers";

function formatE164(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^1/, "");
  if (digits.length !== 10) throw new Error(`Invalid US phone: ${phone}`);
  return `+1${digits}`;
}

/**
 * Send an SMS via Twilio.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER env vars.
 *
 * Falls back to email-to-SMS carrier gateway via nodemailer if Twilio is not configured.
 */
export async function sendSMS({
  phone,
  message,
  carrier,
}: {
  phone: string;
  message: string;
  carrier?: string;
}): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  // Primary: Twilio
  if (accountSid && authToken && fromNumber) {
    const twilio = await import("twilio");
    const client = twilio.default(accountSid, authToken);
    await client.messages.create({
      body: message,
      from: fromNumber,
      to: formatE164(phone),
    });
    return true;
  }

  // Fallback: email-to-SMS carrier gateway (requires carrier selection)
  if (!carrier) return false;

  const CARRIER_GATEWAYS: Record<string, string> = {
    att: "txt.att.net",
    tmobile: "tmomail.net",
    verizon: "vtext.com",
    sprint: "messaging.sprintpcs.com",
    boost: "sms.myboostmobile.com",
    cricket: "sms.cricketwireless.net",
    metro: "mymetropcs.com",
    uscellular: "email.uscc.net",
    mint: "tmomail.net",
    visible: "vtext.com",
    fi: "msg.fi.google.com",
    xfinity: "vtext.com",
  };

  const gateway = CARRIER_GATEWAYS[carrier];
  if (!gateway) return false;

  const digits = phone.replace(/\D/g, "").replace(/^1/, "");
  if (digits.length !== 10) return false;

  const to = `${digits}@${gateway}`;
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "noreply@tutorapp.com",
    to,
    subject: "",
    text: message,
  });

  return true;
}
