import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { WEBINAR_EVENT_TIMEZONE } from './utils/format-webinar-template-datetime.util';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar' as const;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const EXTENDED_PROPERTY_KEY = 'omegaWebinarEventId' as const;
/** Same relative SA path used by omega_office_back GoogleService for trainings. */
const TRAINING_SA_RELATIVE_PATH = 'secrets/ceiba_credential_pdf_sign.json' as const;

type ServiceAccountCredentials = {
  readonly clientEmail: string;
  readonly privateKey: string;
};

/**
 * Creates / updates Google Calendar events with Meet links for customer webinars.
 * Uses the same SA domain-wide delegation pattern as office_back trainings.
 */
@Injectable()
export class WebinarGoogleCalendarService {
  private readonly logger = new Logger(WebinarGoogleCalendarService.name);

  async executeCreateWebinarCalendarEvent(input: {
    readonly webinarEventId: string;
    readonly summary: string;
    readonly description: string;
    readonly startAt: Date;
  }): Promise<{ readonly eventId: string; readonly meetUrl: string }> {
    const calendar = this.getCalendarApi();
    const calendarId = this.resolveCalendarId();
    const endAt = new Date(input.startAt.getTime() + DEFAULT_DURATION_MS);
    const requestId = `webinar-${input.webinarEventId}`;
    const response = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      sendUpdates: 'none',
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: {
          dateTime: input.startAt.toISOString(),
          timeZone: WEBINAR_EVENT_TIMEZONE,
        },
        end: {
          dateTime: endAt.toISOString(),
          timeZone: WEBINAR_EVENT_TIMEZONE,
        },
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        extendedProperties: {
          private: {
            [EXTENDED_PROPERTY_KEY]: input.webinarEventId,
          },
        },
      },
    });
    const eventId = response.data.id;
    if (eventId == null || eventId.trim() === '') {
      throw new InternalServerErrorException(
        'Google Calendar did not return an event id for the webinar.',
      );
    }
    let meetUrl = this.extractMeetUrl(response.data);
    if (meetUrl == null) {
      const refreshed = await calendar.events.get({
        calendarId,
        eventId,
        fields: 'hangoutLink,conferenceData',
      });
      meetUrl = this.extractMeetUrl(refreshed.data);
    }
    if (meetUrl == null || meetUrl.trim() === '') {
      throw new InternalServerErrorException(
        'Google Calendar event was created without a Meet URL.',
      );
    }
    this.logger.log(
      `Created webinar calendar eventId=${eventId} webinarEventId=${input.webinarEventId}`,
    );
    return { eventId, meetUrl };
  }

  async executePatchWebinarCalendarEvent(input: {
    readonly eventId: string;
    readonly summary: string;
    readonly description: string;
    readonly startAt: Date;
  }): Promise<string | null> {
    const calendar = this.getCalendarApi();
    const calendarId = this.resolveCalendarId();
    const endAt = new Date(input.startAt.getTime() + DEFAULT_DURATION_MS);
    const existing = await calendar.events.get({
      calendarId,
      eventId: input.eventId,
      fields: 'conferenceData,hangoutLink',
    });
    const hasMeet =
      this.extractMeetUrl(existing.data) != null ||
      (existing.data.conferenceData?.entryPoints?.length ?? 0) > 0;
    const response = await calendar.events.patch({
      calendarId,
      eventId: input.eventId,
      conferenceDataVersion: hasMeet ? undefined : 1,
      sendUpdates: 'none',
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: {
          dateTime: input.startAt.toISOString(),
          timeZone: WEBINAR_EVENT_TIMEZONE,
        },
        end: {
          dateTime: endAt.toISOString(),
          timeZone: WEBINAR_EVENT_TIMEZONE,
        },
        ...(hasMeet
          ? {}
          : {
              conferenceData: {
                createRequest: {
                  requestId: `webinar-patch-${input.eventId}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' as const },
                },
              },
            }),
      },
    });
    return this.extractMeetUrl(response.data);
  }

  /**
   * Deletes a Google Calendar event. Ignores 404 (already removed).
   */
  async executeDeleteWebinarCalendarEvent(eventId: string): Promise<void> {
    const calendar = this.getCalendarApi();
    const calendarId = this.resolveCalendarId();
    try {
      await calendar.events.delete({
        calendarId,
        eventId,
        sendUpdates: 'none',
      });
      this.logger.log(`Deleted webinar calendar eventId=${eventId}`);
    } catch (error: unknown) {
      const status =
        error != null &&
        typeof error === 'object' &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'number'
          ? (error as { code: number }).code
          : error != null &&
              typeof error === 'object' &&
              'response' in error &&
              typeof (error as { response?: { status?: unknown } }).response?.status ===
                'number'
            ? (error as { response: { status: number } }).response.status
            : undefined;
      if (status === 404 || status === 410) {
        this.logger.warn(`Calendar event ${eventId} already missing (${status})`);
        return;
      }
      throw error;
    }
  }

  private extractMeetUrl(data: {
    readonly hangoutLink?: string | null;
    readonly conferenceData?: {
      readonly entryPoints?: ReadonlyArray<{
        readonly entryPointType?: string | null;
        readonly uri?: string | null;
      }> | null;
    } | null;
  }): string | null {
    const hangout = data.hangoutLink?.trim();
    if (hangout != null && hangout.length > 0) {
      return hangout;
    }
    const entryPoints = data.conferenceData?.entryPoints ?? [];
    for (const entry of entryPoints) {
      if (entry.entryPointType === 'video' && entry.uri != null && entry.uri.trim() !== '') {
        return entry.uri.trim();
      }
    }
    return null;
  }

  private resolveCalendarId(): string {
    const webinarCalendar = process.env.GOOGLE_WEBINAR_CALENDAR_ID?.trim();
    if (webinarCalendar != null && webinarCalendar.length > 0) {
      return webinarCalendar;
    }
    const trainingCalendar = process.env.GOOGLE_TRAINING_CALENDAR_ID?.trim();
    if (trainingCalendar != null && trainingCalendar.length > 0) {
      return trainingCalendar;
    }
    return 'primary';
  }

  private resolveImpersonateSubject(): string {
    const subject =
      process.env.GOOGLE_CALENDAR_IMPERSONATE_SUBJECT?.trim() ||
      process.env.GOOGLE_MEET_IMPERSONATE_SUBJECT?.trim() ||
      'admin@laceiba.group';
    return subject;
  }

  private getServiceAccountCredentials(): ServiceAccountCredentials {
    const envClientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
    const envPrivateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (envClientEmail && envPrivateKey) {
      return { clientEmail: envClientEmail, privateKey: envPrivateKey };
    }
    const keyPath = this.resolveServiceAccountKeyPath();
    if (keyPath == null) {
      throw new InternalServerErrorException(
        'Google Calendar SA credentials missing. Set GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY, GOOGLE_APPLICATION_CREDENTIALS, or place secrets/ceiba_credential_pdf_sign.json (same as trainings).',
      );
    }
    const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) {
      throw new InternalServerErrorException(
        'Invalid Google credentials file for webinar calendar.',
      );
    }
    this.logger.log(`Using Google Calendar SA credentials from ${keyPath}`);
    return {
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  }

  /**
   * Resolves SA JSON in the same order as trainings (office_back GoogleService),
   * then common local monorepo sibling path.
   */
  private resolveServiceAccountKeyPath(): string | null {
    const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (fromEnv != null && fromEnv.length > 0 && fs.existsSync(fromEnv)) {
      return fromEnv;
    }
    const candidates = [
      path.join(process.cwd(), TRAINING_SA_RELATIVE_PATH),
      path.join(process.cwd(), '..', 'omega_office_back', TRAINING_SA_RELATIVE_PATH),
      path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'omega_office_back',
        TRAINING_SA_RELATIVE_PATH,
      ),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private getCalendarApi(): ReturnType<typeof google.calendar> {
    const credentials = this.getServiceAccountCredentials();
    const auth = new google.auth.JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      scopes: [CALENDAR_SCOPE],
      subject: this.resolveImpersonateSubject(),
    });
    return google.calendar({ version: 'v3', auth });
  }
}
