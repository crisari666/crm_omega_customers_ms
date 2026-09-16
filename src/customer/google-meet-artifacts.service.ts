import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { extractGoogleMeetingCode } from './utils/google-meet-call-log.util';
import {
  MEET_AUDIT_MEETINGS_READONLY_SCOPE,
  MEET_AUDIT_SA_RELATIVE_PATH,
  MEET_AUDIT_SUBJECT_EMAIL,
} from '../ventor-schedule/google-meet-audit.constants';
import { formatTimedTranscriptFromUtterances } from './call-audit/utils/format-timed-transcript.util';
import { parseMeetDriveTranscriptDocument } from './call-audit/utils/parse-meet-drive-transcript.util';

const MEET_AUDIT_DRIVE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/drive.readonly' as const;

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
  recordingDriveFileId?: string;
  transcriptDriveDocId?: string;
};

type ServiceAccountCredentials = {
  clientEmail: string;
  privateKey: string;
};

@Injectable()
export class GoogleMeetArtifactsService {
  private readonly logger = new Logger(GoogleMeetArtifactsService.name);

  private getServiceAccountCredentials(): ServiceAccountCredentials {
    const keyPath = path.join(process.cwd(), MEET_AUDIT_SA_RELATIVE_PATH);
    if (fs.existsSync(keyPath)) {
      const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as {
        client_email?: string;
        private_key?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        };
      }
    }
    const envClientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
    const envPrivateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (envClientEmail && envPrivateKey) {
      return { clientEmail: envClientEmail, privateKey: envPrivateKey };
    }
    const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (!envPath || !fs.existsSync(envPath)) {
      throw new InternalServerErrorException(
        `Google Meet SA credentials missing. Place ${MEET_AUDIT_SA_RELATIVE_PATH} at repo root.`,
      );
    }
    const parsed = JSON.parse(fs.readFileSync(envPath, 'utf8')) as {
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
      scopes: [MEET_AUDIT_MEETINGS_READONLY_SCOPE, MEET_AUDIT_DRIVE_READONLY_SCOPE],
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
    return this.fetchArtifactsByMeetUrl(args);
  }

  /**
   * Fetches conference record, transcript entries, and Drive destinations for
   * recording / transcript document (for quality comparison).
   */
  async fetchArtifactsByMeetUrl(args: {
    readonly googleMeetUrl: string;
    readonly organizerEmail: string;
  }): Promise<GoogleMeetTranscriptFetchResult> {
    const meetingCode = extractGoogleMeetingCode(args.googleMeetUrl);
    if (!meetingCode) {
      throw new BadRequestException('Could not parse Google Meet meeting code');
    }
    const subject =
      args.organizerEmail.trim() || MEET_AUDIT_SUBJECT_EMAIL;
    const accessToken = await this.getAccessToken(subject);
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
    const recordingDriveFileId = await this.fetchRecordingDriveFileId(
      conference.name,
      accessToken,
    );
    const transcriptMeta = await this.fetchTranscriptArtifacts(
      conference.name,
      accessToken,
    );
    return {
      ...base,
      ...(recordingDriveFileId ? { recordingDriveFileId } : {}),
      ...transcriptMeta,
    };
  }

  private async fetchRecordingDriveFileId(
    conferenceRecordName: string,
    accessToken: string,
  ): Promise<string | undefined> {
    try {
      const url = `https://meet.googleapis.com/v2/${conferenceRecordName}/recordings`;
      const res = await this.meetGet<{
        recordings?: Array<{
          state?: string;
          driveDestination?: { file?: string; exportUri?: string };
        }>;
      }>(url, accessToken);
      const ready =
        res.recordings?.find((r) => r.state === 'FILE_GENERATED') ??
        res.recordings?.[0];
      const fileId = ready?.driveDestination?.file?.trim();
      return fileId || undefined;
    } catch (err: unknown) {
      this.logger.warn(
        `Meet recordings unavailable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return undefined;
    }
  }

  private async fetchTranscriptArtifacts(
    conferenceRecordName: string,
    accessToken: string,
  ): Promise<Partial<GoogleMeetTranscriptFetchResult>> {
    try {
      const transcriptsUrl = `https://meet.googleapis.com/v2/${conferenceRecordName}/transcripts`;
      const transcripts = await this.meetGet<{
        transcripts?: Array<{
          name?: string;
          state?: string;
          docsDestination?: { document?: string; exportUri?: string };
        }>;
      }>(transcriptsUrl, accessToken);
      const generated =
        transcripts.transcripts?.find((t) => t.state === 'FILE_GENERATED') ??
        transcripts.transcripts?.[0];
      if (!generated?.name) {
        return {};
      }
      const transcriptDriveDocId =
        generated.docsDestination?.document?.trim() || undefined;
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
        .filter((u): u is NonNullable<typeof u> => u != null);
      if (utterances.length === 0 && transcriptDriveDocId) {
        const fromDoc = await this.fetchTranscriptFromDriveDoc(
          transcriptDriveDocId,
          accessToken,
        );
        if (fromDoc !== null) {
          return {
            ...fromDoc,
            transcriptDriveDocId,
          };
        }
        return { transcriptDriveDocId };
      }
      if (utterances.length === 0) {
        return transcriptDriveDocId ? { transcriptDriveDocId } : {};
      }
      const transcript = formatTimedTranscriptFromUtterances(utterances);
      return {
        transcript,
        text: transcript,
        utterances,
        ...(transcriptDriveDocId ? { transcriptDriveDocId } : {}),
      };
    } catch (err: unknown) {
      this.logger.warn(
        `Meet transcript entries unavailable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {};
    }
  }

  private async fetchTranscriptFromDriveDoc(
    transcriptDriveDocId: string,
    accessToken: string,
  ): Promise<Partial<GoogleMeetTranscriptFetchResult> | null> {
    try {
      const fileId = transcriptDriveDocId
        .replace(/^.*\//, '')
        .trim();
      if (fileId === '') {
        return null;
      }
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
      const response = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.warn(
          `Drive transcript export failed (${response.status}): ${detail}`,
        );
        return null;
      }
      const rawText = await response.text();
      const utterances = parseMeetDriveTranscriptDocument(rawText);
      if (utterances.length === 0) {
        const trimmed = rawText.trim();
        if (trimmed === '') {
          return null;
        }
        return { transcript: trimmed, text: trimmed };
      }
      const transcript = formatTimedTranscriptFromUtterances(utterances);
      return { transcript, text: transcript, utterances };
    } catch (err: unknown) {
      this.logger.warn(
        `Drive transcript parse failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
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
