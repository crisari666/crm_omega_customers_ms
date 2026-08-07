import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

type AssignmentKind = 'assigned' | 'reassigned' | 'unassigned';

/**
 * Sends FCM pushes when a customer's assignee changes (tokens from office_back).
 */
@Injectable()
export class CustomerAssignmentPushService {
  private readonly logger = new Logger(CustomerAssignmentPushService.name);
  private isFirebaseReady = false;

  constructor(private readonly configService: ConfigService) {
    this.initializeFirebase();
  }

  /**
   * Notifies new and previous assignees. Never throws — assignment must not fail for push errors.
   */
  async executeNotifyAssignmentChange(params: {
    readonly customerId: string;
    readonly assignedFrom?: string;
    readonly assignedTo?: string;
  }): Promise<void> {
    try {
      const from =
        params.assignedFrom !== undefined && params.assignedFrom.trim() !== ''
          ? params.assignedFrom.trim()
          : undefined;
      const to =
        params.assignedTo !== undefined && params.assignedTo.trim() !== ''
          ? params.assignedTo.trim()
          : undefined;
      if (from === to) {
        return;
      }
      const kind = this.resolveAssignmentKind(from, to);
      const recipientIds = [...new Set([from, to].filter((id): id is string => id != null))];
      if (recipientIds.length === 0) {
        return;
      }
      const tokensByUserId = await this.fetchFcmTokens(recipientIds);
      const sends: Array<Promise<void>> = [];
      for (const userId of recipientIds) {
        const token = tokensByUserId[userId];
        if (token == null || token.trim() === '') {
          this.logger.warn(
            `Assignment push skip: no FCM token userId=${userId} customerId=${params.customerId}`,
          );
          continue;
        }
        const isNewAssignee = to != null && userId === to;
        const copy = this.buildNotificationCopy({
          kind,
          isNewAssignee,
        });
        sends.push(
          this.sendToToken({
            token,
            userId,
            title: copy.title,
            body: copy.body,
            customerId: params.customerId,
            kind,
          }),
        );
      }
      await Promise.all(sends);
      this.logger.log(
        `Assignment push done customerId=${params.customerId} kind=${kind} recipients=${recipientIds.join(',')}`,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Assignment push failed customerId=${params.customerId}: ${this.formatErrorDetails(err)}`,
      );
    }
  }

  private resolveAssignmentKind(
    from: string | undefined,
    to: string | undefined,
  ): AssignmentKind {
    if (to == null) {
      return 'unassigned';
    }
    if (from == null) {
      return 'assigned';
    }
    return 'reassigned';
  }

  private buildNotificationCopy(input: {
    readonly kind: AssignmentKind;
    readonly isNewAssignee: boolean;
  }): { readonly title: string; readonly body: string } {
    if (input.isNewAssignee) {
      return {
        title: 'Nuevo cliente asignado',
        body: 'Se te asignó un cliente. Ábrelo en Clientes.',
      };
    }
    if (input.kind === 'unassigned') {
      return {
        title: 'Cliente desasignado',
        body: 'Un cliente ya no está asignado a ti.',
      };
    }
    return {
      title: 'Cliente reasignado',
      body: 'Un cliente fue reasignado a otro asesor.',
    };
  }

  private async fetchFcmTokens(
    userIds: readonly string[],
  ): Promise<Record<string, string | null>> {
    const baseUrl = (
      this.configService.get<string>('officeBackInternal.baseUrl', '') ?? ''
    ).trim();
    const apiKey = (
      this.configService.get<string>('officeBackInternal.apiKey', '') ?? ''
    ).trim();
    if (baseUrl === '' || apiKey === '') {
      this.logger.warn('officeBackInternal missing; skip FCM token fetch');
      return {};
    }
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = `${normalizedBase}internal/users/fcm-tokens`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': apiKey,
      },
      body: JSON.stringify({ userIds }),
    });
    if (!response.ok) {
      this.logger.warn(`FCM token fetch HTTP ${response.status}`);
      return {};
    }
    const data = (await response.json()) as {
      tokens?: Record<string, string | null>;
    };
    return data.tokens ?? {};
  }

  private async sendToToken(input: {
    readonly token: string;
    readonly userId: string;
    readonly title: string;
    readonly body: string;
    readonly customerId: string;
    readonly kind: AssignmentKind;
  }): Promise<void> {
    if (!this.isFirebaseReady) {
      this.logger.warn(
        `Firebase Admin not ready; skip send userId=${input.userId} customerId=${input.customerId} fcmToken=${input.token}`,
      );
      return;
    }
    this.logger.log(
      `Assignment push send userId=${input.userId} customerId=${input.customerId} kind=${input.kind} fcmToken=${input.token}`,
    );
    try {
      await admin.messaging().send({
        token: input.token,
        notification: {
          title: input.title,
          body: input.body,
        },
        data: {
          type: 'customer_assignment',
          route: '/clients',
          customerId: input.customerId,
          assignmentKind: input.kind,
        },
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Assignment push send failed userId=${input.userId} customerId=${input.customerId} fcmToken=${input.token} ${this.formatErrorDetails(err)}`,
      );
      throw err;
    }
  }

  private formatErrorDetails(err: unknown): string {
    if (!(err instanceof Error)) {
      return `error=${String(err)}`;
    }
    const parts: string[] = [`error=${err.message}`];
    if ('code' in err && typeof (err as { code: unknown }).code === 'string') {
      parts.push(`code=${(err as { code: string }).code}`);
    }
    if (
      'errorInfo' in err &&
      (err as { errorInfo: unknown }).errorInfo != null
    ) {
      try {
        parts.push(
          `errorInfo=${JSON.stringify((err as { errorInfo: unknown }).errorInfo)}`,
        );
      } catch {
        parts.push('errorInfo=[unserializable]');
      }
    }
    if (err.stack != null && err.stack.trim() !== '') {
      parts.push(`stack=${err.stack}`);
    }
    return parts.join(' ');
  }

  private initializeFirebase(): void {
    const credentialsPath = (
      this.configService.get<string>('firebase.adminCredentialsPath', '') ?? ''
    ).trim();
    if (credentialsPath === '') {
      this.logger.warn(
        'FIREBASE_ADMIN_CREDENTIALS unset; assignment pushes disabled',
      );
      return;
    }
    try {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(credentialsPath),
        });
      }
      this.isFirebaseReady = true;
      this.logger.log(`Firebase Admin ready from ${credentialsPath}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Firebase Admin init failed: ${message}`);
      this.isFirebaseReady = false;
    }
  }
}
