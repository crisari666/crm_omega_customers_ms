import { join } from 'path';
import { DEFAULT_REQUIRED_HUMAN_AUDITS_PER_MONTH } from '../customer/call-audit/constants/call-audit.constant';

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
  customerDownPayment: {
    contractDirectory: string;
    feeEvidenceDirectory: string;
    maxFileBytes: number;
    allowedMimeTypes: readonly string[];
  };
  officeBackInternal: { baseUrl: string; apiKey: string };
  firebase: { adminCredentialsPath: string; agentWebAppBaseUrl: string };
  customersMetaIngest: { actorUserId: string };
  ventorAssignment: {
    timeZone: string;
    metaCampaignWindowHours: number;
    gatewayWindowHours: number;
    flowCompletedWindowDays: number;
  };
  deepseek: { apiKey: string; baseUrl: string };
  callAudit: {
    llmConfigPath: string;
    requiredHumanAuditsPerMonth: number;
  };
  whatsappMarketing: {
    phoneNumberId: string;
    defaultBatchSize: number;
    defaultBatchDelayMs: number;
  };
  metaCapi: {
    accessToken: string;
    datasetId: string;
    apiVersion: string;
    leadStepId: string;
    leadEventSource: string;
    enabled: boolean;
  };
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
  const downPaymentAllowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ] as const;
  const contractDirRaw = trimEnv(process.env.CUSTOMER_DOWN_PAYMENT_CONTRACT_DIR);
  const contractDirectory =
    contractDirRaw !== ''
      ? contractDirRaw
      : join(process.cwd(), 'uploads', 'customer-down-payment-contracts');
  const feeEvidenceDirRaw = trimEnv(
    process.env.CUSTOMER_DOWN_PAYMENT_FEE_EVIDENCE_DIR,
  );
  const feeEvidenceDirectory =
    feeEvidenceDirRaw !== ''
      ? feeEvidenceDirRaw
      : join(process.cwd(), 'uploads', 'customer-payment-fee-evidence');
  const maxDownPaymentFileBytesRaw = trimEnv(
    process.env.CUSTOMER_DOWN_PAYMENT_FILE_MAX_BYTES,
  );
  const parsedMaxDownPaymentFile = Number.parseInt(
    maxDownPaymentFileBytesRaw || '10485760',
    10,
  );
  const downPaymentMaxFileBytes =
    Number.isFinite(parsedMaxDownPaymentFile) && parsedMaxDownPaymentFile > 0
      ? parsedMaxDownPaymentFile
      : 10485760;
  const officeBase = process.env.CRM_BACKEND_URL
  const officeKey = trimEnv(process.env.OFFICE_BACK_INTERNAL_API_KEY);
  const metaActor = trimEnv(process.env.CUSTOMERS_META_INGEST_ACTOR_ID) || 'meta-gateway-ingest';
  const ventorTz = trimEnv(process.env.VENTOR_ASSIGNMENT_TZ) || 'America/Bogota';
  const metaWindowHoursRaw = Number.parseInt(
    trimEnv(process.env.VENTOR_ASSIGNMENT_META_CAMPAIGN_WINDOW_HOURS) || '24',
    10,
  );
  const metaCampaignWindowHours =
    Number.isFinite(metaWindowHoursRaw) && metaWindowHoursRaw > 0 ? metaWindowHoursRaw : 24;
  const flowWindowDaysRaw = Number.parseInt(
    trimEnv(process.env.VENTOR_ASSIGNMENT_FLOW_WINDOW_DAYS) || '28',
    10,
  );
  const flowCompletedWindowDays =
    Number.isFinite(flowWindowDaysRaw) && flowWindowDaysRaw > 0 ? flowWindowDaysRaw : 28;
  const gatewayWindowHoursRaw = Number.parseInt(
    trimEnv(process.env.VENTOR_ASSIGNMENT_GATEWAY_WINDOW_HOURS) || '0',
    10,
  );
  const gatewayWindowHours =
    Number.isFinite(gatewayWindowHoursRaw) && gatewayWindowHoursRaw > 0
      ? gatewayWindowHoursRaw
      : metaCampaignWindowHours;
  const requiredAuditsRaw = Number.parseInt(
    trimEnv(process.env.CALL_AUDIT_REQUIRED_PER_MONTH) ||
      String(DEFAULT_REQUIRED_HUMAN_AUDITS_PER_MONTH),
    10,
  );
  const requiredHumanAuditsPerMonth =
    Number.isFinite(requiredAuditsRaw) && requiredAuditsRaw > 0
      ? requiredAuditsRaw
      : DEFAULT_REQUIRED_HUMAN_AUDITS_PER_MONTH;
  const llmConfigPath =
    trimEnv(process.env.CALL_AUDIT_LLM_CONFIG_PATH) ||
    join(process.cwd(), 'config', 'call-audit-llm.config.json');
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
    customerDownPayment: {
      contractDirectory,
      feeEvidenceDirectory,
      maxFileBytes: downPaymentMaxFileBytes,
      allowedMimeTypes: downPaymentAllowedMimeTypes,
    },
    officeBackInternal: {
      baseUrl: officeBase,
      apiKey: officeKey,
    },
    firebase: {
      adminCredentialsPath: trimEnv(process.env.FIREBASE_ADMIN_CREDENTIALS),
      agentWebAppBaseUrl: trimEnv(process.env.AGENT_WEB_APP_BASE_URL),
    },
    customersMetaIngest: {
      actorUserId: metaActor,
    },
    ventorAssignment: {
      timeZone: ventorTz,
      metaCampaignWindowHours,
      gatewayWindowHours,
      flowCompletedWindowDays,
    },
    deepseek: {
      apiKey: trimEnv(process.env.DEEPSEEK_API_KEY),
      baseUrl: trimEnv(process.env.DEEPSEEK_BASE_URL) || 'https://api.deepseek.com',
    },
    callAudit: {
      llmConfigPath,
      requiredHumanAuditsPerMonth,
    },
    whatsappMarketing: {
      phoneNumberId: trimEnv(process.env.WHATSAPP_CLOUD_CUSTOMERS_PHONE_NUMBER_ID),
      defaultBatchSize: (() => {
        const raw = Number.parseInt(trimEnv(process.env.WHATSAPP_MARKETING_BATCH_SIZE) || '5', 10);
        return Number.isFinite(raw) && raw > 0 ? raw : 5;
      })(),
      defaultBatchDelayMs: (() => {
        const raw = Number.parseInt(trimEnv(process.env.WHATSAPP_MARKETING_DELAY_MS) || '200', 10);
        return Number.isFinite(raw) && raw >= 0 ? raw : 200;
      })(),
    },
    metaCapi: {
      accessToken: trimEnv(process.env.META_CAPI_ACCESS_TOKEN),
      datasetId: trimEnv(process.env.META_CAPI_DATASET_ID) || '7399429630115923',
      apiVersion: trimEnv(process.env.META_CAPI_API_VERSION) || 'v26.0',
      leadStepId:
        trimEnv(process.env.META_CAPI_LEAD_STEP_ID) || '69e64b5c04041548fb4dcadf',
      leadEventSource: trimEnv(process.env.META_CAPI_LEAD_EVENT_SOURCE) || 'Omega CRM',
      enabled: (() => {
        const raw = trimEnv(process.env.META_CAPI_ENABLED).toLowerCase();
        if (raw === 'false' || raw === '0' || raw === 'no') {
          return false;
        }
        return true;
      })(),
    },
  };
};
