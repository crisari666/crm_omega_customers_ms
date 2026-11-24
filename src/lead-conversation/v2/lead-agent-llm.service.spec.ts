import { LeadAgentLlmService } from './lead-agent-llm.service';

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } })),
}));

const validation = { allowedProjectIds: new Set(['p1']), allowedFaqIds: new Set(['f1']) };
const inputMessages = [{ role: 'system', content: 'sys' }] as const;

const completion = (content: string) => ({ choices: [{ message: { content } }] });

const buildService = (apiKey = 'key') => {
  const values: Record<string, unknown> = {
    'deepseek.apiKey': apiKey,
    'deepseek.baseUrl': 'https://api.deepseek.com',
    'leadAgent.llmModel': 'deepseek-chat',
    'leadAgent.llmTimeoutMs': 5000,
  };
  const mockConfig = { get: jest.fn().mockImplementation((key: string, fallback?: unknown) => values[key] ?? fallback) };
  return new LeadAgentLlmService(mockConfig as never);
};

describe('LeadAgentLlmService', () => {
  beforeEach(() => mockCreate.mockReset());

  it('calls the model with the agent parameters and returns the validated turn', async () => {
    mockCreate.mockResolvedValue(completion(JSON.stringify({ replies: ['Hola'], projectId: 'p1' })));
    const actualTurn = await buildService().executeTurn(inputMessages, validation);
    expect(actualTurn).toMatchObject({ replies: ['Hola'], projectId: 'p1', action: 'continue' });
    const [body, options] = mockCreate.mock.calls[0];
    expect(body).toMatchObject({
      model: 'deepseek-chat',
      temperature: 0.6,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('retries once on an error and then succeeds', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(completion('{"replies":["Hola"]}'));
    const actualTurn = await buildService().executeTurn(inputMessages, validation);
    expect(actualTurn?.replies).toEqual(['Hola']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('retries once on invalid JSON and then returns null', async () => {
    mockCreate.mockResolvedValue(completion('not json'));
    const actualTurn = await buildService().executeTurn(inputMessages, validation);
    expect(actualTurn).toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('returns null without calling the model when there is no API key', async () => {
    const actualTurn = await buildService('').executeTurn(inputMessages, validation);
    expect(actualTurn).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('writes the advisor brief as plain text and retries on failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(completion('  Inversionista, paga de contado.  '));
    const actualBrief = await buildService().executeBrief({ profile: { motivation: 'invest' }, projectTitle: 'Valle del Sol' });
    expect(actualBrief).toBe('Inversionista, paga de contado.');
    expect(mockCreate.mock.calls[1][0]).toMatchObject({ temperature: 0.3, max_tokens: 250 });
    expect(mockCreate.mock.calls[1][0]).not.toHaveProperty('response_format');
  });

  it('returns a null brief when the model keeps failing', async () => {
    mockCreate.mockRejectedValue(new Error('boom'));
    const actualBrief = await buildService().executeBrief({ profile: {} });
    expect(actualBrief).toBeNull();
  });
});
