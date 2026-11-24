import { resolveLeadAgentStageGoal } from './lead-agent-stage-goals';

describe('resolveLeadAgentStageGoal', () => {
  it('asks to confirm the known project in opening when hasProject is true', () => {
    const goal = resolveLeadAgentStageGoal('opening', true);
    expect(goal).toContain('confirma');
    expect(goal).toContain('no ofrezcas llamada');
  });

  it('asks briefly and relies on the WhatsApp selector when hasProject is false', () => {
    const goal = resolveLeadAgentStageGoal('opening', false);
    expect(goal).toContain('selector de WhatsApp');
    expect(goal).not.toContain('nombra las opciones');
  });

  it('soft-hints suggestedProject without enumerating the catalog', () => {
    const goal = resolveLeadAgentStageGoal('opening', false, true);
    expect(goal).toContain('suggestedProject');
    expect(goal).toContain('needsProject');
    expect(goal).toContain('selector de WhatsApp');
  });

  it('does not put the motivation question in text and relies on WhatsApp buttons in discovery', () => {
    const goal = resolveLeadAgentStageGoal('discovery', true);
    expect(goal).toContain('Ya hay proyecto');
    expect(goal).toContain('needsMotivation');
    expect(goal).toContain('no escribas la pregunta de motivación');
    expect(goal).toContain('botones de WhatsApp');
    expect(goal).toContain('offer_call_slots');
  });

  it('gates bridge call offer on canOfferCall without pushy list wording', () => {
    const goal = resolveLeadAgentStageGoal('bridge', true);
    expect(goal).toContain('canOfferCall');
    expect(goal).toContain('sin presión');
    expect(goal).toContain('No digas "elige de la lista"');
  });

  it('asks booking to answer FAQ doubts warmly without pushing the slot list', () => {
    const goal = resolveLeadAgentStageGoal('booking', true);
    expect(goal).toContain('calidez');
    expect(goal).toContain('continue');
    expect(goal).toContain('solo elige una opción de la lista');
    expect(goal).not.toContain('recuérdale elegir una opción de la lista');
  });
});
