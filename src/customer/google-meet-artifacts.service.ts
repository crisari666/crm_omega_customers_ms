import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import { extractGoogleMeetingCode } from './utils/google-meet-call-log.util';

export type GoogleMeetTranscriptFetchResult = {
  attendance: 'attended' | 'no_answer';
  conferenceRecordName?: string;
  durationSeconds?: number;
  endedAt?: string;
  transcript?: string;
  text?: string;
  utterances?: Array<{
    speaker?: string;
    text: string;
    start?: number;
    end?: number;
  }>;
};

type ServiceAccountCredentials = {
  clientEmail: string;
  privateKey: string;
};

const MEET_READONLY_SCOPE =
  'https://www.googleapis.com/auth/meetings.space.readonly' as const;

@Injectable()
export class GoogleMeetArtifactsService {
  private readonly logger = new Logger(GoogleMeetArtifactsService.name);

  private getServiceAccountCredentials(): ServiceAccountCredentials {
    const envClientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
    const envPrivateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (envClientEmail && envPrivateKey) {
      return { clientEmail: envClientEmail, privateKey: envPrivateKey };
    }
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (!keyPath || !fs.existsSync(keyPath)) {
      throw new InternalServerErrorException(
        'Google Meet SA credentials missing. Set GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS.',
      );
    }
    const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) {
      throw new InternalServerErrorException(
        'Invalid Google credentials file for Meet transcript fetch.',
      );
    }
    return {
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  }

  private async getAccessToken(subjectEmail: string): Promise<string> {
    const credentials = this.getServiceAccountCredentials();
    const auth = new google.auth.JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      scopes: [MEET_READONLY_SCOPE],
      subject: subjectEmail,
    });
    const tokenResponse = await auth.getAccessToken();
    const token =
      typeof tokenResponse === 'string'
        ? tokenResponse
        : tokenResponse?.token ?? undefined;
    if (!token) {
      throw new InternalServerErrorException(
        'Could not obtain Google Meet access token via service account.',
      );
    }
    return token;
  }

  private async meetGet<T>(url: string, accessToken: string): Promise<T> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(`Meet API ${response.status}: ${detail}`);
      throw new BadRequestException(
        detail
          ? `Google Meet API error: ${detail}`
          : `Google Meet API error (${response.status})`,
      );
    }
    return (await response.json()) as T;
  }

  /**
   * Fetches conference attendance + transcript entries using domain-wide delegation.
   */
  async fetchTranscriptByMeetUrl(args: {
    readonly googleMeetUrl: string;
    readonly organizerEmail: string;
  }): Promise<GoogleMeetTranscriptFetchResult> {
    const meetingCode = extractGoogleMeetingCode(args.googleMeetUrl);
    if (!meetingCode) {
      throw new BadRequestException('Could not parse Google Meet meeting code');
    }
    const accessToken = await this.getAccessToken(args.organizerEmail.trim());
    const filter = encodeURIComponent(`space.meeting_code="${meetingCode}"`);
    const listUrl = `https://meet.googleapis.com/v2/conferenceRecords?filter=${filter}`;
    const list = await this.meetGet<{
      conferenceRecords?: Array<{
        name?: string;
        startTime?: string;
        endTime?: string;
      }>;
    }>(listUrl, accessToken);
    const conference = list.conferenceRecords?.[0];
    if (!conference?.name) {
      return { attendance: 'no_answer' };
    }
    const durationSeconds = this.durationSecondsBetween(
      conference.startTime,
      conference.endTime,
    );
    const base: GoogleMeetTranscriptFetchResult = {
      attendance: 'attended',
      conferenceRecordName: conference.name,
      durationSeconds,
      endedAt: conference.endTime,
    };
    try {
      const transcriptsUrl = `https://meet.googleapis.com/v2/${conference.name}/transcripts`;
      const transcripts = await this.meetGet<{
        transcripts?: Array<{ name?: string; state?: string }>;
      }>(transcriptsUrl, accessToken);
      const generated =
        transcripts.transcripts?.find((t) => t.state === 'FILE_GENERATED') ??
        transcripts.transcripts?.[0];
      if (!generated?.name) {
        return base;
      }
      const entriesUrl = `https://meet.googleapis.com/v2/${generated.name}/entries`;
      const entriesRes = await this.meetGet<{
        transcriptEntries?: Array<{
          participant?: string;
          text?: string;
          startTime?: string;
          endTime?: string;
        }>;
      }>(entriesUrl, accessToken);
      const utterances = (entriesRes.transcriptEntries ?? [])
        .map((e) => {
          const text = e.text?.trim() ?? '';
          if (!text) {
            return null;
          }
          return {
            speaker: e.participant,
            text,
            start: e.startTime ? Date.parse(e.startTime) : undefined,
            end: e.endTime ? Date.parse(e.endTime) : undefined,
          };
        })
        .filter(
          (u): u is NonNullable<typeof u> => u != null,
        );
      if (utterances.length === 0) {
        return base;
      }
      const transcript = utterances
        .map((u) => (u.speaker ? `${u.speaker}: ${u.text}` : u.text))
        .join('\n');
      return {
        ...base,
        transcript,
        text: transcript,
        utterances,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `Meet transcript entries unavailable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return base;
    }
  }

  private durationSecondsBetween(
    startIso?: string,
    endIso?: string,
  ): number | undefined {
    if (!startIso || !endIso) {
      return undefined;
    }
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      return undefined;
    }
    return Math.round((endMs - startMs) / 1000);
  }
}
