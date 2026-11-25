import { google } from "googleapis";
import type { CalendarProvider, CalendarEvent, CalendarTokens } from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/calendar/google/callback`
  );
}

/** Generate the Google OAuth consent URL */
export function getGoogleAuthUrl(tutorId: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: tutorId,
  });
}

/** Exchange authorization code for tokens */
export async function exchangeCodeForTokens(
  code: string
): Promise<CalendarTokens> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token!,
    expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1000,
  };
}

/** Build a provider instance from stored tokens, refreshing if needed */
export async function createGoogleCalendarProvider(
  tokens: CalendarTokens,
  calendarId: string = "primary",
  onTokenRefresh?: (newTokens: CalendarTokens) => Promise<void>
): Promise<CalendarProvider> {
  const client = getOAuth2Client();
  client.setCredentials(tokens);

  // Auto-refresh: listen for new tokens
  client.on("tokens", async (newTokens) => {
    const updated: CalendarTokens = {
      access_token: newTokens.access_token ?? tokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expiry_date: newTokens.expiry_date ?? Date.now() + 3600 * 1000,
    };
    if (onTokenRefresh) {
      await onTokenRefresh(updated);
    }
  });

  const calendar = google.calendar({ version: "v3", auth: client });

  return {
    name: "google",

    async createEvent(event: CalendarEvent): Promise<{ eventId: string; meetLink?: string }> {
      const requestBody: Record<string, unknown> = {
        summary: event.title,
        description: event.description,
        start: {
          dateTime: event.startTime.toISOString(),
          timeZone: event.timeZone,
        },
        end: {
          dateTime: event.endTime.toISOString(),
          timeZone: event.timeZone,
        },
        attendees: event.attendees?.map((email) => ({ email })),
      };

      if (event.generateMeetLink) {
        requestBody.conferenceData = {
          createRequest: {
            requestId: `tutorapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      } else if (event.meetingLink) {
        requestBody.location = event.meetingLink;
      }

      const res = await calendar.events.insert({
        calendarId,
        conferenceDataVersion: event.generateMeetLink ? 1 : undefined,
        requestBody,
      });

      const meetLink = res.data.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === "video"
      )?.uri;

      return { eventId: res.data.id!, meetLink: meetLink ?? undefined };
    },

    async updateEvent(
      externalId: string,
      event: Partial<CalendarEvent>
    ): Promise<void> {
      const patch: Record<string, unknown> = {};
      if (event.title) patch.summary = event.title;
      if (event.description !== undefined)
        patch.description = event.description;
      if (event.startTime) {
        patch.start = {
          dateTime: event.startTime.toISOString(),
          timeZone: event.timeZone,
        };
      }
      if (event.endTime) {
        patch.end = {
          dateTime: event.endTime.toISOString(),
          timeZone: event.timeZone,
        };
      }
      if (event.meetingLink !== undefined) patch.location = event.meetingLink;
      if (event.attendees) {
        patch.attendees = event.attendees.map((email) => ({ email }));
      }

      await calendar.events.patch({
        calendarId,
        eventId: externalId,
        requestBody: patch,
      });
    },

    async deleteEvent(externalId: string): Promise<void> {
      await calendar.events.delete({
        calendarId,
        eventId: externalId,
      });
    },

    async getBusyTimes(
      start: Date,
      end: Date,
      timeZone: string
    ): Promise<Array<{ start: Date; end: Date }>> {
      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          timeZone,
          items: [{ id: calendarId }],
        },
      });

      const busy = res.data.calendars?.[calendarId]?.busy ?? [];
      return busy.map((b) => ({
        start: new Date(b.start!),
        end: new Date(b.end!),
      }));
    },
  };
}
