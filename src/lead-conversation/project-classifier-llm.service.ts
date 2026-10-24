import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { LeadProject } from './types/lead-project.type';

const CLASSIFIER_SYSTEM_PROMPT = [
  'You classify the first WhatsApp message of a real-estate lead.',
  'Given a list of projects (id + title) decide which single project the customer asks about.',
  'Answer ONLY JSON: {"projectId": "<id>"} or {"projectId": null} when no project is clearly mentioned.',
  'Never invent ids. Typos and partial names are acceptable matches.',
].join(' ');

/**
 * DeepSeek fallback that maps a free-text message to one of the cached project ids.
 * Returns null when `DEEPSEEK_API_KEY` is missing or the model is unsure.
 */
@Injectable()
export class ProjectClassifierLlmService {
  private readonly logger = new Logger(ProjectClassifierLlmService.name);
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  async classifyProjectId(text: string, projects: readonly LeadProject[]): Promise<string | null> {
    const client = this.getClient();
    if (client === null || projects.length === 0 || text.trim() === '') return null;
    try {
      const completion = await client.chat.completions.create({
        model: this.configService.get<string>('leadConversation.llmModel', 'deepseek-chat'),
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
          { role: 'user', content: this.buildUserPrompt(text, projects) },
        ],
      });
      return this.parseProjectId(completion.choices[0]?.message?.content ?? '', projects);
    } catch (err) {
      this.logger.warn(`Project classification failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private buildUserPrompt(text: string, projects: readonly LeadProject[]): string {
    const catalog = projects.map((project) => ({ id: project.id, title: project.title }));
    return `Projects: ${JSON.stringify(catalog)}\nMessage: """${text.slice(0, 500)}"""`;
  }

  private parseProjectId(content: string, projects: readonly LeadProject[]): string | null {
    try {
      const parsed = JSON.parse(content) as { projectId?: unknown };
      const projectId = typeof parsed.projectId === 'string' ? parsed.projectId : null;
      return projectId !== null && projects.some((project) => project.id === projectId) ? projectId : null;
    } catch {
      return null;
    }
  }

  private getClient(): OpenAI | null {
    if (this.client !== null) return this.client;
    const apiKey = this.configService.get<string>('deepseek.apiKey', '').trim();
    if (apiKey === '') return null;
    const baseURL = this.configService.get<string>('deepseek.baseUrl', 'https://api.deepseek.com').trim();
    this.client = new OpenAI({ apiKey, baseURL });
    return this.client;
  }
}
