import {
  parseMeetClockToMs,
  parseMeetDriveTranscriptDocument,
} from './parse-meet-drive-transcript.util';

describe('parseMeetDriveTranscriptDocument', () => {
  it('parses speaker / timestamp / text blocks', () => {
    const raw = `
Juan Perez
0:01
Hola, buenos días

Maria Lopez
0:15
Hola, ¿cómo está?
`;
    const actual = parseMeetDriveTranscriptDocument(raw);
    expect(actual).toEqual([
      { speaker: 'Juan Perez', text: 'Hola, buenos días', start: 1000 },
      { speaker: 'Maria Lopez', text: 'Hola, ¿cómo está?', start: 15000 },
    ]);
  });

  it('parses speaker with inline timestamp', () => {
    const actual = parseMeetDriveTranscriptDocument(
      'Ana Gomez 1:02\nListo, agendamos',
    );
    expect(actual[0]).toEqual({
      speaker: 'Ana Gomez',
      text: 'Listo, agendamos',
      start: 62000,
    });
  });
});

describe('parseMeetClockToMs', () => {
  it('parses mm:ss', () => {
    expect(parseMeetClockToMs('1:05')).toBe(65000);
  });
});
