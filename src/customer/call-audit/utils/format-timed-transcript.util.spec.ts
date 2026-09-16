import {
  formatTimedTranscriptFromUtterances,
  formatUtteranceClock,
} from './format-timed-transcript.util';

describe('formatTimedTranscriptFromUtterances', () => {
  it('formats relative clocks from first utterance', () => {
    const actual = formatTimedTranscriptFromUtterances([
      { speaker: 'Agent', text: 'Hola', start: 1_000_000, end: 1_005_000 },
      { speaker: 'Customer', text: 'Buenas', start: 1_065_000 },
    ]);
    expect(actual).toBe(
      '[00:00] Agent: Hola\n[01:05] Customer: Buenas',
    );
  });

  it('omits clock when start is missing', () => {
    expect(
      formatTimedTranscriptFromUtterances([{ speaker: 'A', text: 'Hi' }]),
    ).toBe('A: Hi');
  });
});

describe('formatUtteranceClock', () => {
  it('pads minutes and seconds', () => {
    expect(formatUtteranceClock(65_000, 0)).toBe('01:05');
  });
});
