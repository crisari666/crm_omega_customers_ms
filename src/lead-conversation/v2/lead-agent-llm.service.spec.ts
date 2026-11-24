import { LeadAgentLlmService } from './lead-agent-llm.service';

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } })),
}));

const validation = { allowedProjectIds: new Set(['p1']), allowedFaqIds: new Set(['f1']) };
const inputMessages = [{ role: 'system' as const, content: 'sys' }];

const completion = (content: string, model = 'deepseek-chat') => ({
  model,
  choices: [{ message: { content }, finish_reason: 'stop' }],
});

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

  it('calls the model with JSON format and without thinking, and returns the validated turn', async () => {
    mockCreate.mockResolvedValue(completion(JSON.stringify({ replies: ['Hola'], projectId: 'p1' })));
    const actualTurn = await buildService().executeTurn(inputMessages, validation);
    expect(actualTurn).toMatchObject({ replies: ['Hola'], projectId: 'p1', action: 'continue' });
    const [body, options] = mockCreate.mock.calls[0];
    expect(body).toMatchObject({
      model: 'deepseek-chat',
      temperature: 0.6,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });
    expect(body).not.toHaveProperty('thinking');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('retries with json_object, a reminder system message, and lower temperature after empty content', async () => {
    mockCreate
      .mockResolvedValueOnce(completion('          \n\n     ', 'deepseek-flash'))
      .mockResolvedValueOnce(completion('{"replies":["Hola"]}', 'deepseek-flash'));
    const actualTurn = await buildService().executeTurn(inputMessages, validation);
    expect(actualTurn?.replies).toEqual(['Hola']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      response_format: { type: 'json_object' },
      temperature: 0.6,
    });
    expect(mockCreate.mock.calls[1][0]).toMatchObject({
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    const retryMessages = mockCreate.mock.calls[1][0].messages as Array<{ role: string; content: string }>;
    expect(retryMessages[retryMessages.length - 1]).toEqual({
      role: 'system',
      content: 'Recuerda: responde SOLO con el objeto JSON del contrato. Sin texto plano ni markdown.',
    });
  });

  it('salvages fenced JSON before parsing', async () => {
    mockCreate.mockResolvedValue(completion('```json\n{"replies":["Hola"]}\n```'));
    const actualTurn = await buildService().executeTurn(inputMessages, validation);
    expect(actualTurn?.replies).toEqual(['Hola']);
  });

  it('uses reasoning_content when message content is empty', async () => {
    mockCreate.mockResolvedValue({
      model: 'deepseek-flash',
      choices: [{ message: { content: '', reasoning_content: '{"replies":["Desde reasoning"]}' }, finish_reason: 'stop' }],
    });
    const actualTurn = await buildService().executeTurn(inputMessages, validation);
    expect(actualTurn?.replies).toEqual(['Desde reasoning']);
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
