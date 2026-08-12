import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

type AssignmentKind = 'assigned' | 'reassigned' | 'unassigned';
type OnLandAssignmentKind = 'assigned' | 'reassigned' | 'cleared';

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
        const tokens = tokensByUserId[userId] ?? [];
        if (tokens.length === 0) {
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
        for (const token of tokens) {
          sends.push(
            this.sendToToken({
              token,
              userId,
              title: copy.title,
              body: copy.body,
              customerId: params.customerId,
              kind,
              dataType: 'customer_assignment',
              route: `/clients/${params.customerId}`,
              extraData: { assignmentKind: kind },
            }),
          );
        }
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

  /**
   * Notifies related agents when a down payment (cierre) is created.
   * Never throws — payment create must not fail for push errors.
   */
  async executeNotifyDownPaymentCreated(params: {
    readonly customerId: string;
    readonly lotNumber: string;
    readonly projectName: string;
    readonly customerName: string;
    readonly recipientUserIds: readonly string[];
  }): Promise<void> {
    try {
      const recipientIds = [
        ...new Set(
          params.recipientUserIds
            .map((id) => id.trim())
            .filter((id) => id !== ''),
        ),
      ];
      if (recipientIds.length === 0) {
        return;
      }
      const tokensByUserId = await this.fetchFcmTokens(recipientIds);
      const customerLabel =
        params.customerName.trim() !== ''
          ? params.customerName.trim()
          : 'Un cliente';
      const projectLabel =
        params.projectName.trim() !== ''
          ? params.projectName.trim()
          : 'el proyecto';
      const body = `${customerLabel} acaba de comprar el lote ${params.lotNumber} en ${projectLabel}. ¡Excelente trabajo!`;
      const sends: Array<Promise<void>> = [];
      for (const userId of recipientIds) {
        const tokens = tokensByUserId[userId] ?? [];
        if (tokens.length === 0) {
          this.logger.warn(
            `Down payment push skip: no FCM token userId=${userId} customerId=${params.customerId}`,
          );
          continue;
        }
        for (const token of tokens) {
          sends.push(
            this.sendToToken({
              token,
              userId,
              title: '🔥 ¡Nuevo cierre!',
              body,
              customerId: params.customerId,
              kind: 'assigned',
              dataType: 'down_payment_created',
              route: `/clients/${params.customerId}`,
              extraData: {
                lotNumber: params.lotNumber,
                projectName: projectLabel,
              },
            }),
          );
        }
      }
      await Promise.all(sends);
      this.logger.log(
        `Down payment push done customerId=${params.customerId} recipients=${recipientIds.join(',')}`,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Down payment push failed customerId=${params.customerId}: ${this.formatErrorDetails(err)}`,
      );
    }
  }

  /**
   * Notifies on-land agent (and previous agent on reassign/clear) when a visit is assigned.
   * Never throws — schedule assign must not fail for push errors.
   */
  async executeNotifyOnLandAgentAssigned(params: {
    readonly customerId: string;
    readonly scheduleEventId: string;
    readonly onLandAgentFrom?: string | null;
    readonly onLandAgentTo?: string | null;
    readonly customerDisplayName?: string;
  }): Promise<void> {
    try {
      const from =
        params.onLandAgentFrom != null && params.onLandAgentFrom.trim() !== ''
          ? params.onLandAgentFrom.trim()
          : undefined;
      const to =
        params.onLandAgentTo != null && params.onLandAgentTo.trim() !== ''
          ? params.onLandAgentTo.trim()
          : undefined;
      if (from === to) {
        return;
      }
      const kind: OnLandAssignmentKind =
        to == null ? 'cleared' : from == null ? 'assigned' : 'reassigned';
      const recipientIds = [
        ...new Set([from, to].filter((id): id is string => id != null)),
      ];
      if (recipientIds.length === 0) {
        return;
      }
      const tokensByUserId = await this.fetchFcmTokens(recipientIds);
      const displayName = (params.customerDisplayName ?? '').trim();
      const sends: Array<Promise<void>> = [];
      for (const userId of recipientIds) {
        const tokens = tokensByUserId[userId] ?? [];
        if (tokens.length === 0) {
          this.logger.warn(
            `On-land assign push skip: no FCM token userId=${userId} customerId=${params.customerId}`,
          );
          continue;
        }
        const isNewAgent = to != null && userId === to;
        const copy = this.buildOnLandNotificationCopy({
          kind,
          isNewAgent,
          customerDisplayName: displayName,
        });
        for (const token of tokens) {
          sends.push(
            this.sendToToken({
              token,
              userId,
              title: copy.title,
              body: copy.body,
              customerId: params.customerId,
              kind: kind === 'cleared' ? 'unassigned' : kind,
              dataType: 'on_land_visit_assigned',
              route: `/clients/${params.customerId}`,
              extraData: {
                scheduleEventId: params.scheduleEventId,
                onLandAssignmentKind: kind,
              },
            }),
          );
        }
      }
      await Promise.all(sends);
      this.logger.log(
        `On-land assign push done customerId=${params.customerId} scheduleEventId=${params.scheduleEventId} kind=${kind} recipients=${recipientIds.join(',')}`,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `On-land assign push failed customerId=${params.customerId}: ${this.formatErrorDetails(err)}`,
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

  private buildOnLandNotificationCopy(input: {
    readonly kind: OnLandAssignmentKind;
    readonly isNewAgent: boolean;
    readonly customerDisplayName: string;
  }): { readonly title: string; readonly body: string } {
    const who =
      input.customerDisplayName !== ''
        ? input.customerDisplayName
        : 'un cliente';
    if (input.isNewAgent) {
      return {
        title: 'Visita en terreno asignada',
        body: `Te asignaron la visita en terreno de ${who}. Ábrelo en Clientes.`,
      };
    }
    if (input.kind === 'cleared') {
      return {
        title: 'Visita en terreno liberada',
        body: `Ya no eres el agente en terreno de ${who}.`,
      };
    }
    return {
      title: 'Visita en terreno reasignada',
      body: `La visita en terreno de ${who} fue asignada a otro asesor.`,
    };
  }

  private async fetchFcmTokens(
    userIds: readonly string[],
  ): Promise<Record<string, string[]>> {
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
      tokens?: Record<string, string[] | string | null>;
    };
    return this.normalizeTokensByUserId(data.tokens ?? {});
  }

  private normalizeTokensByUserId(
    raw: Record<string, string[] | string | null>,
  ): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [userId, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        result[userId] = [
          ...new Set(
            value
              .map((token) => (token != null ? String(token).trim() : ''))
              .filter((token) => token !== ''),
          ),
        ];
        continue;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        result[userId] = [value.trim()];
        continue;
      }
      result[userId] = [];
    }
    return result;
  }

  private async sendToToken(input: {
    readonly token: string;
    readonly userId: string;
    readonly title: string;
    readonly body: string;
    readonly customerId: string;
    readonly kind: AssignmentKind;
    readonly dataType: string;
    readonly route: string;
    readonly extraData?: Record<string, string>;
  }): Promise<void> {
    if (!this.isFirebaseReady) {
      this.logger.warn(
        `Firebase Admin not ready; skip send userId=${input.userId} customerId=${input.customerId} fcmToken=${input.token}`,
      );
      return;
    }
    this.logger.log(
      `Push send type=${input.dataType} userId=${input.userId} customerId=${input.customerId} kind=${input.kind} fcmToken=${input.token}`,
    );
    const agentWebBase = (
      this.configService.get<string>('firebase.agentWebAppBaseUrl', '') ?? ''
    ).trim().replace(/\/$/, '');
    const webClickLink =
      agentWebBase !== '' ? `${agentWebBase}${input.route}` : undefined;
    try {
      await admin.messaging().send({
        token: input.token,
        notification: {
          title: input.title,
          body: input.body,
        },
        data: {
          type: input.dataType,
          route: input.route,
          customerId: input.customerId,
          ...(input.extraData ?? {}),
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
        ...(webClickLink != null
          ? {
              webpush: {
                fcmOptions: {
                  link: webClickLink,
                },
              },
            }
          : {}),
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Push send failed type=${input.dataType} userId=${input.userId} customerId=${input.customerId} fcmToken=${input.token} ${this.formatErrorDetails(err)}`,
      );
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
      console.log('credentialsPath', credentialsPath, 'admin.apps.length', admin.apps.length);
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
