/**
 * Calendar provider abstraction.
 * Allows swapping Google Calendar for Outlook, iCal, etc.
 */

export interface CalendarEvent {
  id?: string;
  externalId?: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
  meetingLink?: string;
  generateMeetLink?: boolean;
  attendees?: string[];
}

export interface CalendarProvider {
  name: string;

  /** Create an event and return { eventId, meetLink? } */
  createEvent(event: CalendarEvent): Promise<{ eventId: string; meetLink?: string }>;

  /** Update an existing event by external ID */
  updateEvent(externalId: string, event: Partial<CalendarEvent>): Promise<void>;

  /** Delete an event by external ID */
  deleteEvent(externalId: string): Promise<void>;

  /** Get busy times in a date range (for conflict checking) */
  getBusyTimes(
    start: Date,
    end: Date,
    timeZone: string
  ): Promise<Array<{ start: Date; end: Date }>>;
}

export interface CalendarTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

export type CalendarProviderType = "google" | "outlook" | "none";
