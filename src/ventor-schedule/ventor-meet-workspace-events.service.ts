import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import {
  MEET_AUDIT_EVENT_TYPES,
  MEET_AUDIT_MEETINGS_READONLY_SCOPE,
  MEET_AUDIT_MEETINGS_SPACE_CREATED_SCOPE,
  MEET_AUDIT_PUBSUB_TOPIC,
  MEET_AUDIT_SUBJECT_EMAIL,
  MEET_AUDIT_SUBSCRIPTION_TTL_MS,
} from './google-meet-audit.constants';
import { loadMeetAuditServiceAccountCredentials } from './load-meet-audit-credentials.util';
import { resolveMeetSpaceResourceName } from './resolve-meet-space-name.util';

export type CreateMeetSpaceSubscriptionResult = {
  readonly subscriptionName: string;
  readonly expireTime: Date;
  /** Canonical Meet REST space id (not the Calendar meeting code). */
  readonly meetSpaceId: string;
};

/**
 * Creates Workspace Events subscriptions for Meet transcript/recording files.
 * Impersonates the Meet organizer (signed-in ventor) when available.
 */
@Injectable()
export class VentorMeetWorkspaceEventsService {
  private readonly logger = new Logger(VentorMeetWorkspaceEventsService.name);

  async executeCreateMeetSpaceSubscription(
    meetSpaceId: string,
    organizerEmail?: string,
  ): Promise<CreateMeetSpaceSubscriptionResult> {
    const subject =
      organizerEmail?.trim().toLowerCase() || MEET_AUDIT_SUBJECT_EMAIL;
    const credentials = loadMeetAuditServiceAccountCredentials();
    const auth = new google.auth.JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      scopes: [
        MEET_AUDIT_MEETINGS_READONLY_SCOPE,
        MEET_AUDIT_MEETINGS_SPACE_CREATED_SCOPE,
      ],
      subject,
    });
    const accessToken = await auth.getAccessToken();
    const token =
      typeof accessToken === 'string'
        ? accessToken
        : accessToken?.token ?? undefined;
    if (!token) {
      throw new Error('Could not obtain Workspace Events access token');
    }
    const resolved = await resolveMeetSpaceResourceName({
      meetingCodeOrSpaceId: meetSpaceId,
      accessToken: token,
    });
    const expireTime = new Date(Date.now() + MEET_AUDIT_SUBSCRIPTION_TTL_MS);
    const body = {
      targetResource: `//meet.googleapis.com/${resolved.resourceName}`,
      eventTypes: [...MEET_AUDIT_EVENT_TYPES],
      notificationEndpoint: {
        pubsubTopic: MEET_AUDIT_PUBSUB_TOPIC,
      },
      ttl: `${Math.floor(MEET_AUDIT_SUBSCRIPTION_TTL_MS / 1000)}s`,
    };
    const response = await fetch(
      'https://workspaceevents.googleapis.com/v1/subscriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(
        `Workspace Events subscribe failed ${response.status}: ${detail}`,
      );
      throw new Error(
        detail
          ? `Workspace Events subscribe failed: ${detail}`
          : `Workspace Events subscribe failed (${response.status})`,
      );
    }
    const data = (await response.json()) as {
      name?: string;
      expireTime?: string;
    };
    const subscriptionName = data.name?.trim();
    if (!subscriptionName) {
      throw new Error('Workspace Events did not return a subscription name');
    }
    const parsedExpire = data.expireTime
      ? new Date(data.expireTime)
      : expireTime;
    this.logger.log(
      `Subscribed Meet space=${resolved.spaceId} as=${subject} subscription=${subscriptionName}`,
    );
    return {
      subscriptionName,
      expireTime: parsedExpire,
      meetSpaceId: resolved.spaceId,
    };
  }
}
