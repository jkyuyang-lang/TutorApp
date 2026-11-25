import { google } from "googleapis";
import { createServiceClient } from "@/lib/supabase/admin";

interface MeetingResult {
  link: string;
  platform: "google_meet" | "zoom";
}

/**
 * Get enabled meeting platforms from app_settings.
 */
export async function getEnabledPlatforms(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "meeting_platforms")
    .single();
  return (data?.value as string[]) ?? [];
}

/**
 * Create a Google Meet link using the admin's connected Google account.
 */
async function createGoogleMeetLink(options: {
  title: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
  attendeeEmails?: string[];
}): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: creds } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "google_meet_credentials")
    .single();

  if (!creds?.value) return null;

  const tokens = creds.value as {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    email: string;
  };

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/meetings/google/callback`
  );
  client.setCredentials(tokens);

  // Auto-refresh tokens
  client.on("tokens", async (newTokens) => {
    const updated = {
      ...tokens,
      access_token: newTokens.access_token ?? tokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expiry_date: newTokens.expiry_date ?? Date.now() + 3600 * 1000,
    };
    await supabase.from("app_settings").update({
      value: updated,
    }).eq("key", "google_meet_credentials");
  });

  const calendar = google.calendar({ version: "v3", auth: client });

  const res = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: options.title,
      start: {
        dateTime: options.startTime.toISOString(),
        timeZone: options.timeZone,
      },
      end: {
        dateTime: options.endTime.toISOString(),
        timeZone: options.timeZone,
      },
      attendees: options.attendeeEmails?.map((email) => ({ email })),
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      conferenceData: {
        createRequest: {
          requestId: `tutorapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const meetLink = res.data.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === "video"
  )?.uri;

  return meetLink ?? null;
}

/**
 * Generate a meeting link for a lesson based on the tutor's platform preference.
 * Falls back to whichever platform the admin has enabled.
 */
export async function generateMeetingLink(options: {
  tutorId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
  attendeeEmails?: string[];
}): Promise<MeetingResult | null> {
  const supabase = createServiceClient();

  // Get enabled platforms
  const enabledPlatforms = await getEnabledPlatforms();
  if (enabledPlatforms.length === 0) return null;

  // Get tutor's preferred platform
  const { data: tutor } = await supabase
    .from("tutors")
    .select("meeting_platform, meeting_link")
    .eq("id", options.tutorId)
    .single();

  // Determine which platform to use
  let platform = tutor?.meeting_platform;
  if (!platform || !enabledPlatforms.includes(platform)) {
    // Fall back to the first (or only) enabled platform
    platform = enabledPlatforms[0];
  }

  if (platform === "google_meet") {
    try {
      const meetLink = await createGoogleMeetLink({
        title: options.title,
        startTime: options.startTime,
        endTime: options.endTime,
        timeZone: options.timeZone,
        attendeeEmails: options.attendeeEmails,
      });
      if (meetLink) {
        return { link: meetLink, platform: "google_meet" };
      }
    } catch (err) {
      console.error("Failed to create Google Meet link:", err);
    }
  }

  if (platform === "zoom") {
    // Try auto-creating a unique Zoom meeting via Server-to-Server OAuth
    try {
      const zoomLink = await createZoomMeeting({
        title: options.title,
        startTime: options.startTime,
        endTime: options.endTime,
        timeZone: options.timeZone,
      });
      if (zoomLink) {
        return { link: zoomLink, platform: "zoom" };
      }
    } catch (err) {
      console.error("Failed to create Zoom meeting:", err);
    }

    // Fall back to static links
    if (tutor?.meeting_link) {
      return { link: tutor.meeting_link, platform: "zoom" };
    }
    const { data: zoomSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "zoom_meeting_link")
      .single();
    if (zoomSetting?.value) {
      return { link: zoomSetting.value as string, platform: "zoom" };
    }
  }

  return null;
}

/**
 * Get a Zoom Server-to-Server OAuth access token.
 */
async function getZoomAccessToken(): Promise<string | null> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) return null;

  const res = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: accountId,
    }),
  });

  if (!res.ok) {
    console.error("Zoom token error:", await res.text());
    return null;
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Create a Zoom meeting using Server-to-Server OAuth.
 */
async function createZoomMeeting(options: {
  title: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
}): Promise<string | null> {
  const token = await getZoomAccessToken();
  if (!token) return null;

  const durationMinutes = Math.round(
    (options.endTime.getTime() - options.startTime.getTime()) / 60000
  );

  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      topic: options.title,
      type: 2, // scheduled meeting
      start_time: options.startTime.toISOString(),
      duration: durationMinutes,
      timezone: options.timeZone,
      settings: {
        join_before_host: true,
        waiting_room: false,
        auto_recording: "none",
        mute_upon_entry: true,
      },
    }),
  });

  if (!res.ok) {
    console.error("Zoom meeting creation error:", await res.text());
    return null;
  }

  const data = await res.json();
  return data.join_url ?? null;
}
