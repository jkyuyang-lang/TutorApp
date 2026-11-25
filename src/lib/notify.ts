const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Fire-and-forget notification call (server-side only).
 * Sends an internal POST to /api/notify to trigger email notifications.
 */
export function notify(type: string, payload: Record<string, unknown>) {
  const url = `${SITE_URL}/api/notify`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.NOTIFY_SECRET
        ? { "x-notify-secret": process.env.NOTIFY_SECRET }
        : {}),
    },
    body: JSON.stringify({ type, payload }),
  }).catch((err) => {
    console.error("[notify] Failed to send notification:", err);
  });
}
