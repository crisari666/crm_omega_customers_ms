import { memoryStorage } from 'multer';

const DEFAULT_MAX_BYTES = 10485760;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function parseMaxBytes(): number {
  const raw = (process.env.CUSTOMER_DOWN_PAYMENT_FILE_MAX_BYTES ?? '').trim();
  if (raw === '') {
    return DEFAULT_MAX_BYTES;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

/**
 * Multer options for down-payment contract and fee evidence (images + PDF).
 */
export function buildCustomerDownPaymentFileMulterOptions() {
  return {
    storage: memoryStorage(),
    limits: { fileSize: parseMaxBytes() },
    fileFilter: (
      _req: Express.Request,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ): void => {
      if (ALLOWED_MIME.has(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error('File must be JPEG, PNG, WebP, or PDF'), false);
    },
  };
}

export const CUSTOMER_DOWN_PAYMENT_ALLOWED_MIME = ALLOWED_MIME;
