import { Body, Controller, Logger, Post } from '@nestjs/common';
import { VentorScheduleService } from './ventor-schedule.service';

type PubSubPushBody = {
  readonly message?: {
    readonly data?: string;
    readonly attributes?: Record<string, string>;
  };
};

/**
 * Receives Cloud Pub/Sub push for Workspace Events Meet artifact notifications.
 * Route should be public (or verified by GCP) — no office JWT.
 */
@Controller('webhooks/google-meet-events')
export class VentorMeetArtifactsWebhookController {
  private readonly logger = new Logger(
    VentorMeetArtifactsWebhookController.name,
  );

  constructor(
    private readonly ventorScheduleService: VentorScheduleService,
  ) {}

  @Post()
  async handlePubSubPush(@Body() body: PubSubPushBody): Promise<{ ok: true }> {
    const attributes = body.message?.attributes ?? {};
    const eventType = attributes['ce-type']?.trim() || 'unknown';
    const spaceIdFromSubject = this.extractSpaceIdFromString(
      attributes['ce-subject'],
    );
    let spaceId = spaceIdFromSubject;
    let decodedPreview = '';
    const encoded = body.message?.data;
    if (!spaceId && encoded) {
      let decoded: string;
      try {
        decoded = Buffer.from(encoded, 'base64').toString('utf8');
        decodedPreview = decoded.slice(0, 400);
      } catch {
        this.logger.warn('Meet webhook invalid base64 data');
        return { ok: true };
      }
      try {
        spaceId = this.extractMeetSpaceIdFromPayload(
          JSON.parse(decoded) as unknown,
        );
      } catch {
        this.logger.warn('Meet webhook non-JSON payload');
        return { ok: true };
      }
    }
    if (!spaceId) {
      this.logger.warn(
        `Meet webhook could not resolve space id eventType=${eventType} subject=${
          attributes['ce-subject'] ?? ''
        } data=${decodedPreview || '(empty)'}`,
      );
      return { ok: true };
    }
    this.logger.log(
      `Meet webhook eventType=${eventType} space=${spaceId}`,
    );
    try {
      await this.ventorScheduleService.refreshMeetArtifactsBySpaceId(spaceId);
    } catch (err: unknown) {
      this.logger.error(
        `Meet webhook refresh failed space=${spaceId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return { ok: true };
  }

  private extractSpaceIdFromString(raw: string | undefined): string | null {
    if (!raw || raw.trim() === '') {
      return null;
    }
    const trimmed = raw.trim();
    const spacesMatch = trimmed.match(/spaces\/([a-zA-Z0-9_-]+)/);
    if (spacesMatch?.[1]) {
      return spacesMatch[1];
    }
    if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  private extractMeetSpaceIdFromPayload(payload: unknown): string | null {
    if (payload == null || typeof payload !== 'object') {
      return null;
    }
    const root = payload as Record<string, unknown>;
    const candidates: unknown[] = [
      root.space,
      root.spaceName,
      root.targetResource,
      (root.meetingSpace as Record<string, unknown> | undefined)?.name,
      (root.conferenceRecord as Record<string, unknown> | undefined)?.space,
    ];
    for (const raw of candidates) {
      if (typeof raw !== 'string') {
        continue;
      }
      const spaceId = this.extractSpaceIdFromString(raw);
      if (spaceId) {
        return spaceId;
      }
    }
    return null;
  }
}
