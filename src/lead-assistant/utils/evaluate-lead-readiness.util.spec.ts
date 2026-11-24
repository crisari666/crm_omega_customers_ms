import type { LeadAssistantSettingsView } from '../types/lead-assistant-settings-view.type';
import type { LeadReadinessSnapshot } from '../types/lead-readiness-snapshot.type';
import type { LeadReadinessKey, LeadReadinessStatus } from '../types/lead-readiness-item.type';
import type { LeadRecoveryStep } from '../types/lead-recovery-step.type';
import { evaluateLeadReadiness } from './evaluate-lead-readiness.util';

const welcomeTemplate = { name: 'welcome', language: 'es', bodyText: 'Hola', bindings: [] };

const buildSettings = (overrides: Partial<LeadAssistantSettingsView> = {}): LeadAssistantSettingsView => ({
  assistantName: 'Verónica',
  businessName: 'La Ceiba',
  greeting: 'Hola {{customerName}}',
  pricePolicy: 'entry_ticket_first',
  defaultInboundFlow: 'v1',
  enabled: true,
  replyDebounceSeconds: 4,
  welcomeTemplate,
  ...overrides,
});

const buildStep = (overrides: Partial<LeadRecoveryStep> = {}): LeadRecoveryStep => ({
  id: 's1',
  label: 'Paso 1',
  offsetHours: 2,
  enabled: true,
  template: { name: 'followup', language: 'es', bodyText: 'Hola', bindings: [] },
  sentCount: 0,
  repliedCount: 0,
  ...overrides,
});

const buildSnapshot = (overrides: Partial<LeadReadinessSnapshot> = {}): LeadReadinessSnapshot => ({
  configuredPhoneNumberId: '123',
  rpcPhoneNumberId: '123',
  approvedTemplateKeys: new Set(['welcome::es', 'followup::es']),
  settings: buildSettings(),
  enabledFaqCount: 3,
  enabledFaqCategories: new Set(['price', 'financing', 'legal']),
  steps: [buildStep()],
  hasEnabledV2Form: true,
  ...overrides,
});

const statusOf = (snapshot: LeadReadinessSnapshot, key: LeadReadinessKey): LeadReadinessStatus =>
  evaluateLeadReadiness(snapshot).items.find((item) => item.key === key)!.status;

describe('evaluateLeadReadiness', () => {
  it('is all ready for a fully configured assistant', () => {
    const actual = evaluateLeadReadiness(buildSnapshot());
    expect(actual.items.map((item) => item.key)).toEqual([
      'connection',
      'identity',
      'knowledge',
      'recovery',
      'activation',
    ]);
    expect(actual.readyCount).toBe(5);
    expect(actual.total).toBe(5);
  });

  describe('connection', () => {
    it('is missing when the templates RPC failed', () => {
      expect(statusOf(buildSnapshot({ templatesError: 'timeout' }), 'connection')).toBe('missing');
    });

    it('is missing when the configured phone number id is empty', () => {
      expect(statusOf(buildSnapshot({ configuredPhoneNumberId: '' }), 'connection')).toBe('missing');
    });

    it('needs attention when the RPC phone number id differs', () => {
      expect(statusOf(buildSnapshot({ rpcPhoneNumberId: '999' }), 'connection')).toBe('attention');
    });

    it('is ready when the RPC does not report a phone number id', () => {
      expect(statusOf(buildSnapshot({ rpcPhoneNumberId: undefined }), 'connection')).toBe('ready');
    });
  });

  describe('identity', () => {
    it.each([
      ['assistantName', { assistantName: ' ' }],
      ['businessName', { businessName: '' }],
      ['greeting', { greeting: '' }],
      ['welcomeTemplate', { welcomeTemplate: undefined }],
    ])('is missing without %s', (_field, inputOverrides) => {
      expect(statusOf(buildSnapshot({ settings: buildSettings(inputOverrides) }), 'identity')).toBe('missing');
    });

    it('needs attention when the welcome template is not approved', () => {
      expect(statusOf(buildSnapshot({ approvedTemplateKeys: new Set(['followup::es']) }), 'identity')).toBe(
        'attention',
      );
    });
  });

  describe('knowledge', () => {
    it('is missing without enabled FAQs', () => {
      expect(
        statusOf(buildSnapshot({ enabledFaqCount: 0, enabledFaqCategories: new Set() }), 'knowledge'),
      ).toBe('missing');
    });

    it.each(['price', 'financing', 'legal'] as const)('needs attention without an enabled %s FAQ', (category) => {
      const inputCategories = new Set(['price', 'financing', 'legal', 'other'] as const);
      inputCategories.delete(category);
      expect(statusOf(buildSnapshot({ enabledFaqCategories: inputCategories }), 'knowledge')).toBe('attention');
    });
  });

  describe('recovery', () => {
    it('needs attention without enabled steps', () => {
      expect(statusOf(buildSnapshot({ steps: [] }), 'recovery')).toBe('attention');
      expect(statusOf(buildSnapshot({ steps: [buildStep({ enabled: false })] }), 'recovery')).toBe('attention');
    });

    it('needs attention when an enabled step template is not approved', () => {
      const inputStep = buildStep({ template: { name: 'other', language: 'es', bodyText: 'x', bindings: [] } });
      expect(statusOf(buildSnapshot({ steps: [inputStep] }), 'recovery')).toBe('attention');
    });
  });

  describe('activation', () => {
    it('needs attention when the assistant is disabled', () => {
      expect(statusOf(buildSnapshot({ settings: buildSettings({ enabled: false }) }), 'activation')).toBe(
        'attention',
      );
    });

    it('needs attention without an enabled V2 form', () => {
      expect(statusOf(buildSnapshot({ hasEnabledV2Form: false }), 'activation')).toBe('attention');
    });
  });
});
