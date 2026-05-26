import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import {
  CALL_AUDIT_LLM_CONFIG,
  type CallAuditLlmConfig,
} from './config/call-audit-llm.config';
import type { CallAuditConfigPublicDto } from './types/customer-call-audit.type';
import { assertCallAuditLlmConfig } from './utils/assert-call-audit-llm-config.util';

@Injectable()
export class CallAuditLlmConfigService {
  private cachedConfig: CallAuditLlmConfig | null = null;

  constructor(private readonly configService: ConfigService) {}

  getConfig(): CallAuditLlmConfig {
    if (this.cachedConfig !== null) {
      return this.cachedConfig;
    }
    const path = this.configService.get<string>('callAudit.llmConfigPath', '');
    this.cachedConfig = this.loadConfig(path);
    return this.cachedConfig;
  }

  /**
   * Loads {@link CallAuditLlmConfig} from JSON when the file exists (full document, validated).
   * Uses embedded TS defaults only when no config file path / file is missing (e.g. local tests).
   */
  private loadConfig(path: string): CallAuditLlmConfig {
    if (path === '' || !fs.existsSync(path)) {
      return CALL_AUDIT_LLM_CONFIG;
    }
    const raw: unknown = JSON.parse(fs.readFileSync(path, 'utf8'));
    return assertCallAuditLlmConfig(raw);
  }

  getPublicConfig(): CallAuditConfigPublicDto {
    const config = this.getConfig();
    const required = this.configService.get<number>(
      'callAudit.requiredHumanAuditsPerMonth',
      3,
    );
    return {
      configVersion: config.version,
      indicators: config.indicators,
      interestScore: config.interestScore,
      requiredHumanAuditsPerMonth: required,
    };
  }
}
