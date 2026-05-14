import { memoryStorage } from 'multer';

const DEFAULT_MAX_BYTES = 5242880;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function parseMaxBytes(): number {
  const raw = (process.env.CUSTOMER_PAYMENT_EVIDENCE_MAX_BYTES ?? '').trim();
  if (raw === '') {
    return DEFAULT_MAX_BYTES;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

/**
 * Multer options for optional payment evidence image upload (memory storage).
 */
export function buildCustomerPaymentEvidenceMulterOptions() {
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
      cb(new Error('Evidence file must be JPEG, PNG, or WebP'), false);
    },
  };
}
