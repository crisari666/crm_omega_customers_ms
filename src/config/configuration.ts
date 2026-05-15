import { join } from 'path';

function trimEnv(value: string | undefined): string {
  return (value ?? '').trim();
}

/**
 * Align with crm_whatsapp_ms `whatsapp-web.module` client: use RABBITMQ_URL, else build from RABBIT_MQ_*.
 * Host defaults to localhost when unset (same as crm_whatsapp_ms ClientsModule), so RPC consumers start in local dev.
 * Set RABBITMQ_DISABLE=true to skip microservice transport (HTTP-only).
 */
export function resolveRabbitMqUrl(): string {
  if (trimEnv(process.env.RABBITMQ_DISABLE).toLowerCase() === 'true') {
    return '';
  }
  const directUrl = trimEnv(process.env.RABBITMQ_URL);
  if (directUrl !== '') {
    return directUrl;
  }
  const rabbitMqUser = trimEnv(process.env.RABBIT_MQ_USER) || 'guest';
  const rabbitMqPass = trimEnv(process.env.RABBIT_MQ_PASS) || 'guest';
  const rabbitMqHost = trimEnv(process.env.RABBIT_MQ_HOST) || 'localhost';
  const rabbitMqPort = trimEnv(process.env.RABBIT_MQ_PORT) || '5672';
  return `amqp://${encodeURIComponent(rabbitMqUser)}:${encodeURIComponent(rabbitMqPass)}@${rabbitMqHost}:${rabbitMqPort}`;
}

function buildMongoUri(): string {
  const user = trimEnv(process.env.DATABASE_USER);
  const password = trimEnv(process.env.DATABASE_PASS);
  const host = trimEnv(process.env.DATABASE_HOST) || 'localhost';
  const port = trimEnv(process.env.DATABASE_PORT) || '27017';
  const name = trimEnv(process.env.DATABASE_NAME);
  const hasCredentials = user.length > 0 && password.length > 0;
  if (hasCredentials) {
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
  }
  return `mongodb://${host}:${port}/${name}`;
}

export default (): {
  database: { uri: string };
  rabbitmq: {
    url: string;
    voiceExchange: string;
    voiceQueue: string;
    /** Nest traffic from crm_whatsapp_ms (RPC + WhatsApp events); separate from voice queue when possible. */
    integrationQueue: string;
    prefetch: number;
  };
  customerPaymentEvidence: {
    directory: string;
    maxFileBytes: number;
    allowedMimeTypes: readonly string[];
  };
  officeBackInternal: { baseUrl: string; apiKey: string };
  customersMetaIngest: { actorUserId: string };
  ventorAssignment: { timeZone: string };
} => {
  const prefetchRaw: string = trimEnv(process.env.RABBITMQ_PREFETCH);
  const parsedPrefetch: number = Number.parseInt(prefetchRaw || '10', 10);
  const prefetch: number = Number.isFinite(parsedPrefetch) && parsedPrefetch > 0 ? parsedPrefetch : 10;
  const evidenceDirRaw = trimEnv(process.env.CUSTOMER_PAYMENT_EVIDENCE_DIR);
  const evidenceDirectory =
    evidenceDirRaw !== '' ? evidenceDirRaw : join(process.cwd(), 'uploads', 'customer-payment-evidence');
  const maxEvidenceBytesRaw = trimEnv(process.env.CUSTOMER_PAYMENT_EVIDENCE_MAX_BYTES);
  const parsedMaxEvidence = Number.parseInt(maxEvidenceBytesRaw || '5242880', 10);
  const maxFileBytes =
    Number.isFinite(parsedMaxEvidence) && parsedMaxEvidence > 0 ? parsedMaxEvidence : 5242880;
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
  const officeBase = process.env.CRM_BACKEND_URL
  const officeKey = trimEnv(process.env.OFFICE_BACK_INTERNAL_API_KEY);
  const metaActor = trimEnv(process.env.CUSTOMERS_META_INGEST_ACTOR_ID) || 'meta-gateway-ingest';
  const ventorTz = trimEnv(process.env.VENTOR_ASSIGNMENT_TZ) || 'America/Bogota';
  return {
    database: {
      uri: buildMongoUri(),
    },
    rabbitmq: {
      url: resolveRabbitMqUrl(),
      voiceExchange: trimEnv(process.env.RABBITMQ_VOICE_EXCHANGE) || 'omega.voice',
      voiceQueue: trimEnv(process.env.RABBITMQ_VOICE_QUEUE) || 'crm.customers.voice_call_logs',
      integrationQueue:
        trimEnv(process.env.RABBIT_QUEUE_CUSTOMERS_MS) || 'crm.customers.whatsapp_integration',
      prefetch,
    },
    customerPaymentEvidence: {
      directory: evidenceDirectory,
      maxFileBytes,
      allowedMimeTypes,
    },
    officeBackInternal: {
      baseUrl: officeBase,
      apiKey: officeKey,
    },
    customersMetaIngest: {
      actorUserId: metaActor,
    },
    ventorAssignment: {
      timeZone: ventorTz,
    },
  };
};
