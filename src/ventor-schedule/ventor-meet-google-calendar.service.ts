import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { google } from 'googleapis';
import {
  MEET_AUDIT_CALENDAR_SCOPE,
  MEET_AUDIT_DEFAULT_DURATION_MS,
  MEET_AUDIT_MEETINGS_READONLY_SCOPE,
  MEET_AUDIT_SUBJECT_EMAIL,
  MEET_AUDIT_TIME_ZONE,
} from './google-meet-audit.constants';
import { loadMeetAuditServiceAccountCredentials } from './load-meet-audit-credentials.util';
import { resolveMeetSpaceResourceName } from './resolve-meet-space-name.util';

export type CreateVentorAuditMeetInput = {
  readonly summary: string;
  readonly description?: string;
  readonly startAt: Date;
  /** Signed-in ventor Google email — becomes Calendar event organizer/creator. */
  readonly ventorEmail: string;
  readonly customerEmail: string;
  readonly scheduleEventId: string;
};

export type CreateVentorAuditMeetResult = {
  readonly eventId: string;
  readonly meetUrl: string;
  readonly meetSpaceId: string;
  readonly organizerEmail: string;
};

/**
 * Creates Calendar events + Meet on the signed-in ventor's calendar via SA DWD.
 * Auditoría is invited as attendee for audit visibility.
 */
@Injectable()
export class VentorMeetGoogleCalendarService {
  private static readonly AUDIT_INVITE_RETRY_MS = 2000;
  private static readonly AUDIT_INVITE_MAX_ATTEMPTS = 4;
  private readonly logger = new Logger(VentorMeetGoogleCalendarService.name);

  async executeCreateVentorAuditMeet(
    input: CreateVentorAuditMeetInput,
  ): Promise<CreateVentorAuditMeetResult> {
    const organizerEmail = input.ventorEmail.trim().toLowerCase();
    if (!organizerEmail) {
      throw new InternalServerErrorException(
        'ventorEmail is required to create the Meet as the signed-in user.',
      );
    }
    const calendar = this.getCalendarApi(organizerEmail);
    const endAt = new Date(
      input.startAt.getTime() + MEET_AUDIT_DEFAULT_DURATION_MS,
    );
    const requestId = `ventor-virtual-${input.scheduleEventId}`;
    const attendees = this.buildUniqueAttendees([
      input.customerEmail,
      MEET_AUDIT_SUBJECT_EMAIL,
    ], organizerEmail);
    const response = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        summary: input.summary,
        description: input.description ?? '',
        start: {
          // Wall-clock from stored UTC fields (user-picked time), not ...Z + Bogota
          // which would shift 4:15pm → 11:15am.
          dateTime: this.formatWallClockDateTime(input.startAt),
          timeZone: MEET_AUDIT_TIME_ZONE,
        },
        end: {
          dateTime: this.formatWallClockDateTime(endAt),
          timeZone: MEET_AUDIT_TIME_ZONE,
        },
        attendees: attendees.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        extendedProperties: {
          private: {
            ventorScheduleEventId: input.scheduleEventId,
          },
        },
      },
    });
    console.log(JSON.stringify(response, null, 2));
    const eventId = response.data.id?.trim();
    if (!eventId) {
      throw new InternalServerErrorException(
        'Google Calendar did not return an event id for the virtual visit.',
      );
    }
    
    const iCalUID = response.data.iCalUID?.trim() || '';
    let meetUrl = this.extractMeetUrl(response.data);
    let meetSpaceId = this.extractMeetSpaceId(response.data);
    if (!meetUrl || !meetSpaceId) {
      const refreshed = await calendar.events.get({
        calendarId: 'primary',
        eventId,
        fields: 'hangoutLink,conferenceData',
      });
      meetUrl = meetUrl ?? this.extractMeetUrl(refreshed.data);
      meetSpaceId = meetSpaceId ?? this.extractMeetSpaceId(refreshed.data);
    }
    if (!meetUrl) {
      throw new InternalServerErrorException(
        'Google Calendar event was created without a Meet URL.',
      );
    }
    if (!meetSpaceId) {
      throw new InternalServerErrorException(
        'Google Calendar event was created without a Meet space id.',
      );
    }
    const canonicalSpaceId = await this.resolveCanonicalMeetSpaceId(
      meetSpaceId,
      organizerEmail,
    );
    this.logger.log(
      `Created ventor Meet eventId=${eventId} organizer=${organizerEmail} scheduleEventId=${input.scheduleEventId} spaceId=${canonicalSpaceId}`,
    );
    await this.executeAcceptAuditInvite({ eventId, iCalUID });
    return {
      eventId,
      meetUrl,
      meetSpaceId: canonicalSpaceId,
      organizerEmail,
    };
  }

  /**
   * Accepts the audit mailbox invite so Meet/Drive grant recording and transcript access.
   * Runs after events.insert. Finds records@ copy via iCalUID (organizer eventId often 404s).
   * Failures are logged only — Meet create still succeeds.
   */
  private async executeAcceptAuditInvite(input: {
    readonly eventId: string;
    readonly iCalUID: string;
  }): Promise<void> {
    const maxAttempts = VentorMeetGoogleCalendarService.AUDIT_INVITE_MAX_ATTEMPTS;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.patchAuditInviteAccepted(input);
        return;
      } catch (err: unknown) {
        const isLast = attempt >= maxAttempts;
        const canRetry = this.isCalendarNotFoundError(err) && !isLast;
        if (!canRetry) {
          this.logger.warn(
            `Auto-accept audit invite failed eventId=${input.eventId} iCalUID=${input.iCalUID} attempt=${attempt}: ${this.formatErrorMessage(err)}`,
          );
          return;
        }
        this.logger.warn(
          `Audit invite not yet on ${MEET_AUDIT_SUBJECT_EMAIL} calendar eventId=${input.eventId} attempt=${attempt}; retrying`,
        );
        await this.delayMs(VentorMeetGoogleCalendarService.AUDIT_INVITE_RETRY_MS);
      }
    }
  }

  private async patchAuditInviteAccepted(input: {
    readonly eventId: string;
    readonly iCalUID: string;
  }): Promise<void> {
    const calendar = this.getCalendarApi(MEET_AUDIT_SUBJECT_EMAIL);
    const attendeeEventId = await this.resolveAuditCalendarEventId(
      calendar,
      input,
    );
    const existing = await calendar.events.get({
      calendarId: 'primary',
      eventId: attendeeEventId,
    });
    const auditEmail = MEET_AUDIT_SUBJECT_EMAIL.toLowerCase();
    const currentAttendees = existing.data.attendees ?? [];
    const attendees = currentAttendees.map((attendee) => {
      const email = attendee.email?.trim().toLowerCase() ?? '';
      if (email === auditEmail) {
        return { ...attendee, responseStatus: 'accepted' as const };
      }
      return attendee;
    });
    const hasAudit = attendees.some(
      (attendee) => attendee.email?.trim().toLowerCase() === auditEmail,
    );
    if (!hasAudit) {
      attendees.push({
        email: MEET_AUDIT_SUBJECT_EMAIL,
        responseStatus: 'accepted',
      });
    }
    const patched = await calendar.events.patch({
      calendarId: 'primary',
      eventId: attendeeEventId,
      sendUpdates: 'none',
      requestBody: { attendees },
    });
    const agreedStatus =
      patched.data.attendees?.find(
        (attendee) => attendee.email?.trim().toLowerCase() === auditEmail,
      )?.responseStatus ?? 'accepted';
    this.logger.log(
      `Meet invite auto-agree success email=${MEET_AUDIT_SUBJECT_EMAIL} organizerEventId=${input.eventId} auditEventId=${attendeeEventId} responseStatus=${agreedStatus}`,
    );
  }

  /**
   * Invitee calendar copies are found by iCalUID; direct get(organizerEventId) often 404s.
   */
  private async resolveAuditCalendarEventId(
    calendar: ReturnType<typeof google.calendar>,
    input: { readonly eventId: string; readonly iCalUID: string },
  ): Promise<string> {
    if (input.iCalUID) {
      const listed = await calendar.events.list({
        calendarId: 'primary',
        iCalUID: input.iCalUID,
        maxResults: 5,
        singleEvents: true,
        showDeleted: false,
      });
      const match = listed.data.items?.find((item) => item.id?.trim());
      const listedId = match?.id?.trim();
      if (listedId) {
        return listedId;
      }
    }
    try {
      const direct = await calendar.events.get({
        calendarId: 'primary',
        eventId: input.eventId,
        fields: 'id',
      });
      const directId = direct.data.id?.trim();
      if (directId) {
        return directId;
      }
    } catch (err: unknown) {
      if (!this.isCalendarNotFoundError(err)) {
        throw err;
      }
    }
    const notFound = new Error(
      `Not Found: invite not on ${MEET_AUDIT_SUBJECT_EMAIL} calendar yet`,
    ) as Error & { code: number };
    notFound.code = 404;
    throw notFound;
  }

  private isCalendarNotFoundError(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }
    const withCode = err as {
      code?: number | string;
      response?: { status?: number };
      message?: string;
    };
    if (withCode.code === 404 || withCode.response?.status === 404) {
      return true;
    }
    return (
      typeof withCode.code === 'string' && withCode.code === '404'
    ) || (withCode.message?.includes('Not Found') ?? false);
  }

  private formatErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }

  private delayMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Formats schedule wall-clock for Calendar API (no Z/offset).
   * `scheduledAt` stores the UI time via Date.UTC; use UTC getters as that clock.
   */
  private formatWallClockDateTime(at: Date): string {
    const year = at.getUTCFullYear();
    const month = String(at.getUTCMonth() + 1).padStart(2, '0');
    const day = String(at.getUTCDate()).padStart(2, '0');
    const hour = String(at.getUTCHours()).padStart(2, '0');
    const minute = String(at.getUTCMinutes()).padStart(2, '0');
    const second = String(at.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }

  /**
   * Calendar conferenceId is a meeting code; Workspace Events needs Meet REST space id.
   */
  private async resolveCanonicalMeetSpaceId(
    meetingCode: string,
    subjectEmail: string,
  ): Promise<string> {
    const credentials = loadMeetAuditServiceAccountCredentials();
    const auth = new google.auth.JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      scopes: [MEET_AUDIT_MEETINGS_READONLY_SCOPE],
      subject: subjectEmail,
    });
    const accessToken = await auth.getAccessToken();
    const token =
      typeof accessToken === 'string'
        ? accessToken
        : accessToken?.token ?? undefined;
    if (!token) {
      throw new InternalServerErrorException(
        'Could not obtain Meet API access token to resolve space id.',
      );
    }
    const resolved = await resolveMeetSpaceResourceName({
      meetingCodeOrSpaceId: meetingCode,
      accessToken: token,
    });
    return resolved.spaceId;
  }

  private buildUniqueAttendees(
    emails: readonly string[],
    organizerEmail: string,
  ): string[] {
    const organizer = organizerEmail.trim().toLowerCase();
    const seen = new Set<string>(organizer ? [organizer] : []);
    const out: string[] = [];
    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      if (!email || seen.has(email)) {
        continue;
      }
      seen.add(email);
      out.push(email);
    }
    return out;
  }

  private extractMeetUrl(data: {
    hangoutLink?: string | null;
    conferenceData?: {
      entryPoints?: Array<{ entryPointType?: string; uri?: string | null }>;
    };
  }): string | null {
    const hangout = data.hangoutLink?.trim();
    if (hangout) {
      return hangout;
    }
    for (const entry of data.conferenceData?.entryPoints ?? []) {
      const uri = entry.uri?.trim();
      if (
        uri &&
        (entry.entryPointType === 'video' || uri.includes('meet.google.com'))
      ) {
        return uri;
      }
    }
    return null;
  }

  private extractMeetSpaceId(data: {
    conferenceData?: { conferenceId?: string | null };
  }): string | null {
    const conferenceId = data.conferenceData?.conferenceId?.trim();
    return conferenceId && conferenceId.length > 0 ? conferenceId : null;
  }

  private getCalendarApi(
    subjectEmail: string,
  ): ReturnType<typeof google.calendar> {
    const credentials = loadMeetAuditServiceAccountCredentials();
    const auth = new google.auth.JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      scopes: [MEET_AUDIT_CALENDAR_SCOPE],
      subject: subjectEmail,
    });
    return google.calendar({ version: 'v3', auth });
  }
}
