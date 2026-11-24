import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  LEAD_AGENT_BRIEF_MAX_TOKENS,
  LEAD_AGENT_BRIEF_TEMPERATURE,
  LEAD_AGENT_LLM_ATTEMPTS,
  LEAD_AGENT_LLM_CONTENT_LOG_CHARS,
  LEAD_AGENT_LLM_MAX_TOKENS,
  LEAD_AGENT_LLM_TEMPERATURE,
} from './constants/lead-agent.constants';
import type { LeadAgentBriefInput } from './types/lead-agent-brief-input.type';
import type { LeadAgentChatMessage } from './types/lead-agent-chat-message.type';
import type { LeadAgentLlmTurn } from './types/lead-agent-llm-turn.type';
import type { LeadAgentTurnValidation } from './types/lead-agent-turn-validation.type';
import { parseLeadAgentLlmTurn } from './utils/parse-lead-agent-llm-turn.util';

const BRIEF_SYSTEM_PROMPT = [
  'Eres asistente comercial de una empresa de lotes.',
  'Redacta en español un resumen de máximo 3 frases para el asesor que llamará al cliente: qué busca, cómo piensa pagar, para cuándo y qué le preocupa.',
  'Usa solo los datos recibidos, no inventes nada y no uses markdown ni listas.',
].join(' ');

type LeadAgentCompletionParams = {
  readonly temperature: number;
  readonly maxTokens: number;
  readonly isJson: boolean;
};

/**
 * DeepSeek client of the V2 agent (OpenAI SDK, lazy cached client).
 * Both calls retry once and then give up with null, so the engine can fall back.
 */
@Injectable()
export class LeadAgentLlmService {
  private readonly logger = new Logger(LeadAgentLlmService.name);
  private client: OpenAI | null = null;
  private hasWarnedMissingApiKey = false;

  constructor(private readonly configService: ConfigService) {}

  /** One agent turn: validated JSON answer, or null after the retry failed (or without `DEEPSEEK_API_KEY`). */
  async executeTurn(
    messages: readonly LeadAgentChatMessage[],
    validation: LeadAgentTurnValidation,
  ): Promise<LeadAgentLlmTurn | null> {
    const params: LeadAgentCompletionParams = {
      temperature: LEAD_AGENT_LLM_TEMPERATURE,
      maxTokens: LEAD_AGENT_LLM_MAX_TOKENS,
      isJson: true,
    };
    for (let attempt = 1; attempt <= LEAD_AGENT_LLM_ATTEMPTS; attempt += 1) {
      const content = await this.requestCompletion(messages, params);
      if (content === null) {
        this.logger.warn(`Agent turn attempt ${attempt}/${LEAD_AGENT_LLM_ATTEMPTS} produced no valid answer`);
        continue;
      }
      const turn = parseLeadAgentLlmTurn(content, validation);
      if (turn !== null) return turn;
      this.logger.warn(
        `Agent turn attempt ${attempt}/${LEAD_AGENT_LLM_ATTEMPTS} produced no valid answer content=${this.truncateContent(content)}`,
      );
    }
    return null;
  }

  /** Short Spanish brief for the advisor who will call the lead, or null when the model fails. */
  async executeBrief(input: LeadAgentBriefInput): Promise<string | null> {
    const messages: LeadAgentChatMessage[] = [
      { role: 'system', content: BRIEF_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ];
    const params: LeadAgentCompletionParams = {
      temperature: LEAD_AGENT_BRIEF_TEMPERATURE,
      maxTokens: LEAD_AGENT_BRIEF_MAX_TOKENS,
      isJson: false,
    };
    for (let attempt = 1; attempt <= LEAD_AGENT_LLM_ATTEMPTS; attempt += 1) {
      const content = (await this.requestCompletion(messages, params))?.trim() ?? '';
      if (content.length > 0) return content;
    }
    return null;
  }

  private async requestCompletion(
    messages: readonly LeadAgentChatMessage[],
    params: LeadAgentCompletionParams,
  ): Promise<string | null> {
    const client = this.getClient();
    if (client === null) return null;
    const timeoutMs = this.configService.get<number>('leadAgent.llmTimeoutMs', 20000);
    try {
      const completion = await client.chat.completions.create(
        {
          model: this.configService.get<string>('leadAgent.llmModel', 'deepseek-chat'),
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          ...(params.isJson ? { response_format: { type: 'json_object' as const } } : {}),
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
        },
        { signal: AbortSignal.timeout(timeoutMs) },
      );
      return completion.choices[0]?.message?.content ?? null;
    } catch (err) {
      this.logger.warn(`Agent LLM request failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private getClient(): OpenAI | null {
    if (this.client !== null) return this.client;
    const apiKey = this.configService.get<string>('deepseek.apiKey', '').trim();
    if (apiKey === '') {
      if (!this.hasWarnedMissingApiKey) {
        this.hasWarnedMissingApiKey = true;
        this.logger.warn('Agent LLM disabled: DEEPSEEK_API_KEY is missing or empty');
      }
      return null;
    }
    const baseURL = this.configService.get<string>('deepseek.baseUrl', 'https://api.deepseek.com').trim();
    this.client = new OpenAI({ apiKey, baseURL });
    return this.client;
  }

  private truncateContent(content: string): string {
    const compact = content.replace(/\s+/g, ' ').trim();
    if (compact.length <= LEAD_AGENT_LLM_CONTENT_LOG_CHARS) return JSON.stringify(compact);
    return JSON.stringify(`${compact.slice(0, LEAD_AGENT_LLM_CONTENT_LOG_CHARS)}…`);
  }
}
