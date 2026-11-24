import { LEAD_FAQ_FALLBACK_MIN_SCORE } from '../constants/lead-assistant.constants';
import type { LeadResolvedFaq } from '../types/lead-resolved-faq.type';
import { pickBestLeadFaqMatch, scoreLeadFaqMatch } from './score-lead-faq-match.util';

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

  it('scores escrituras against escrituración above the fallback threshold', () => {
    const score = scoreLeadFaqMatch('¿Lo entregan con escrituras?', {
      question: '¿Cómo es la escrituración?',
      alternativePhrasings: ['Se entrega escricturado?'],
    });
    expect(score).toBeGreaterThanOrEqual(LEAD_FAQ_FALLBACK_MIN_SCORE);
  });
});

describe('pickBestLeadFaqMatch', () => {
  const legalFaq: LeadResolvedFaq = {
    id: 'faq-legal',
    question: '¿Cómo es la escrituración?',
    alternativePhrasings: ['Se entrega escricturado?'],
    answer: 'Se firma la escritura pública.',
    category: 'legal',
  };
  const priceFaq: LeadResolvedFaq = {
    id: 'faq-price',
    question: '¿Cuánto cuesta el lote?',
    alternativePhrasings: [],
    answer: 'Desde 85M',
    category: 'price',
  };

  it('returns the best FAQ above the min score', () => {
    const actual = pickBestLeadFaqMatch('¿Lo entregan con escrituras?', [priceFaq, legalFaq]);
    expect(actual).toMatchObject({ faq: { id: 'faq-legal' } });
    expect(actual?.score).toBeGreaterThanOrEqual(LEAD_FAQ_FALLBACK_MIN_SCORE);
  });

  it('returns undefined when nothing clears the threshold', () => {
    expect(pickBestLeadFaqMatch('hola', [legalFaq, priceFaq])).toBeUndefined();
  });
});
