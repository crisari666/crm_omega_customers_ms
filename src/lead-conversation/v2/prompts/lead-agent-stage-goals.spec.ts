import { resolveLeadAgentStageGoal } from './lead-agent-stage-goals';

describe('resolveLeadAgentStageGoal', () => {
  it('asks the LLM to greet and confirm the known project in opening when hasProject is true', () => {
    const goal = resolveLeadAgentStageGoal('opening', true);
    expect(goal).toContain('saluda tú');
    expect(goal).toContain('confirma');
    expect(goal).toContain('no ofrezcas llamada');
  });

  it('does not ask project in text and relies on the WhatsApp selector when hasProject is false', () => {
    const goal = resolveLeadAgentStageGoal('opening', false);
    expect(goal).toContain('No escribas la pregunta de proyecto en el texto');
    expect(goal).toContain('selector de WhatsApp');
    expect(goal).toContain('no preguntes cómo va el día');
    expect(goal).not.toContain('nombra las opciones');
  });

  it('soft-hints suggestedProject without promising an auto project selector', () => {
    const goal = resolveLeadAgentStageGoal('opening', false, true);
    expect(goal).toContain('suggestedProject');
    expect(goal).toContain('offer_projects');
    expect(goal).toContain('NO asumas que llega un selector');
    expect(goal).toContain('no saludes ni confirmes el proyecto');
  });

  it('does not put the motivation or capture questions in text in discovery', () => {
    const goal = resolveLeadAgentStageGoal('discovery', true);
    expect(goal).toContain('Ya hay proyecto');
    expect(goal).toContain('needsMotivation');
    expect(goal).toContain('no escribas la pregunta de motivación');
    expect(goal).toContain('paymentMethod');
    expect(goal).toContain('selector de lotes');
    expect(goal).toContain('offer_call_slots');
  });

  it('gates bridge call offer on canOfferCall when the customer wants to advance', () => {
    const goal = resolveLeadAgentStageGoal('bridge', true);
    expect(goal).toContain('canOfferCall');
    expect(goal).toContain('offer_call_slots');
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
