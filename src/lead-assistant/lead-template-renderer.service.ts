import { Injectable } from '@nestjs/common';
import type { LeadTemplateBinding } from '../lead-conversation/types/lead-template-binding.type';
import type { LeadTemplateRef } from '../lead-conversation/types/lead-template-ref.type';
import {
  LEAD_TEMPLATE_DEFAULT_FIRST_NAME,
  LEAD_TEMPLATE_EMPTY_VALUE,
} from './constants/lead-assistant.constants';
import type { LeadTemplateRenderContext } from './types/lead-template-render-context.type';
import type { LeadTemplateRenderResult } from './types/lead-template-render-result.type';

const TEMPLATE_COMPONENTS = ['header', 'body'] as const;
const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

const sortBindings = (bindings: readonly LeadTemplateBinding[]): LeadTemplateBinding[] =>
  [...bindings].sort((first, second) =>
    first.format === 'positional' && second.format === 'positional'
      ? Number(first.variable) - Number(second.variable)
      : 0,
  );

/**
 * Builds Graph `template.components` and the rendered body text from a template reference.
 */
@Injectable()
export class LeadTemplateRendererService {
  /** One component per component with bindings; values are never empty (`-` fallback). */
  executeRender(template: LeadTemplateRef, context: LeadTemplateRenderContext): LeadTemplateRenderResult {
    const templateComponents = TEMPLATE_COMPONENTS.flatMap((component) => {
      const bindings = sortBindings(template.bindings.filter((binding) => binding.component === component));
      return bindings.length === 0 ? [] : [this.buildComponent(component, bindings, context)];
    });
    return { templateComponents, renderedBody: this.renderBody(template, context) };
  }

  private buildComponent(
    component: 'header' | 'body',
    bindings: readonly LeadTemplateBinding[],
    context: LeadTemplateRenderContext,
  ): Record<string, unknown> {
    return {
      type: component,
      parameters: bindings.map((binding) => ({
        type: 'text',
        text: this.resolveValue(binding, context),
        ...(binding.format === 'named' ? { parameter_name: binding.variable } : {}),
      })),
    };
  }

  private renderBody(template: LeadTemplateRef, context: LeadTemplateRenderContext): string {
    const values = new Map(
      template.bindings
        .filter((binding) => binding.component === 'body')
        .map((binding) => [binding.variable, this.resolveValue(binding, context)] as const),
    );
    return template.bodyText.replace(PLACEHOLDER_PATTERN, (match, variable: string) => values.get(variable) ?? match);
  }

  private resolveValue(binding: LeadTemplateBinding, context: LeadTemplateRenderContext): string {
    const raw = this.resolveRawValue(binding, context);
    const value = raw.replace(/\s+/g, ' ').trim();
    return value.length > 0 ? value : LEAD_TEMPLATE_EMPTY_VALUE;
  }

  private resolveRawValue(binding: LeadTemplateBinding, context: LeadTemplateRenderContext): string {
    switch (binding.source) {
      case 'customer_first_name':
        return (context.firstName ?? '').trim() || LEAD_TEMPLATE_DEFAULT_FIRST_NAME;
      case 'assistant_name':
        return context.assistantName;
      case 'business_name':
        return context.businessName;
      case 'project_title':
        return (context.projectTitle ?? '').trim() || context.businessName;
      case 'static':
        return binding.staticValue ?? '';
    }
  }
}
