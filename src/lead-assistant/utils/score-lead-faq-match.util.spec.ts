import { scoreLeadFaqMatch } from './score-lead-faq-match.util';

describe('scoreLeadFaqMatch', () => {
  it('returns 0 for empty customer text', () => {
    expect(scoreLeadFaqMatch('  ', { question: '¿Hay servicios públicos?' })).toBe(0);
  });

  it('scores a containment match higher than token overlap', () => {
    const faq = {
      question: '¿El proyecto se entrega con servicios públicos?',
      alternativePhrasings: ['servicios públicos'],
    };
    const containment = scoreLeadFaqMatch('tienen servicios públicos?', faq);
    const weak = scoreLeadFaqMatch('me hablan del proyecto en general', faq);
    expect(containment).toBeGreaterThan(weak);
    expect(containment).toBeGreaterThan(0);
  });
});
