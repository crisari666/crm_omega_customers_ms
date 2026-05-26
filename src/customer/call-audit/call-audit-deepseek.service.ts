import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CallAuditLlmConfigService } from './call-audit-llm-config.service';
import type { CallAuditLlmConfig } from './config/call-audit-llm.config';
import type { CallAuditLlmAnalysisResult } from './types/customer-call-audit.type';
import { parseCallAuditLlmResponse } from './utils/parse-call-audit-llm-response.util';

export type AnalyzeCallTranscriptInput = {
  transcript: string;
  agentExternalRef: string;
  callMetadata: string;
};

@Injectable()
export class CallAuditDeepSeekService {
  private readonly logger = new Logger(CallAuditDeepSeekService.name);
  private openaiClient: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly callAuditLlmConfigService: CallAuditLlmConfigService,
  ) {}

  private getClient(): OpenAI {
    if (this.openaiClient !== null) {
      return this.openaiClient;
    }
    const apiKey = this.configService.get<string>('deepseek.apiKey', '');
    if (apiKey.trim() === '') {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }
    const baseURL = this.configService.get<string>(
      'deepseek.baseUrl',
      'https://api.deepseek.com',
    );
    this.openaiClient = new OpenAI({
      apiKey: apiKey.trim(),
      baseURL: baseURL.trim(),
    });
    return this.openaiClient;
  }

  private validateAnalyzeInput(input: AnalyzeCallTranscriptInput): void {
    if (input.transcript.trim() === '') {
      throw new BadRequestException('transcript is required for AI call audit');
    }
    if (input.agentExternalRef.trim() === '') {
      throw new BadRequestException('agentExternalRef is required for AI call audit');
    }
  }

  /** Replaces `{{transcript}}`, `{{indicatorKeys}}`, etc. in config.prompts.userTemplate. */
  private buildUserMessage(
    config: CallAuditLlmConfig,
    input: AnalyzeCallTranscriptInput,
  ): string {
    const indicatorKeys = config.indicators.map((indicator) => `"${indicator.key}"`).join(', ');
    return config.prompts.userTemplate
      .replaceAll('{{callMetadata}}', input.callMetadata.trim())
      .replaceAll('{{agentExternalRef}}', input.agentExternalRef.trim())
      .replaceAll('{{transcript}}', input.transcript.trim())
      .replaceAll('{{indicatorKeys}}', indicatorKeys)
      .replaceAll('{{interestMin}}', String(config.interestScore.min))
      .replaceAll('{{interestMax}}', String(config.interestScore.max));
  }

  async analyzeTranscript(
    input: AnalyzeCallTranscriptInput,
  ): Promise<{ analysis: CallAuditLlmAnalysisResult; model: string }> {
    this.validateAnalyzeInput(input);
    const config = this.callAuditLlmConfigService.getConfig();
    const client = this.getClient();
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: config.prompts.system },
        { role: 'user', content: this.buildUserMessage(config, input) },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      response_format: { type: 'json_object' },
    });
    const choice = completion.choices[0];
    const content = choice?.message?.content ?? '';
    if (choice?.finish_reason === 'length') {
      this.logger.warn(
        `LLM response truncated (finish_reason=length, max_tokens=${config.maxTokens})`,
      );
    }
    if (content.trim() === '') {
      throw new Error('Empty LLM response');
    }
    try {
      const analysis = parseCallAuditLlmResponse(content, config);
      return { analysis, model: config.model };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to parse LLM JSON: ${message}`);
      throw err;
    }
  }
}
