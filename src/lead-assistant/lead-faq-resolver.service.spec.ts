import { Types } from 'mongoose';
import { LeadFaqResolverService } from './lead-faq-resolver.service';

type InputFaqRow = {
  readonly _id: Types.ObjectId;
  readonly question: string;
  readonly category: string;
  readonly defaultAnswer?: string;
  readonly alternativePhrasings?: readonly string[];
  readonly projectAnswers: readonly { projectId: string; projectTitle: string; answer: string }[];
  readonly timesUsed: number;
};

const buildRow = (overrides: Partial<InputFaqRow>): InputFaqRow => ({
  _id: new Types.ObjectId(),
  question: 'Pregunta',
  category: 'price',
  projectAnswers: [],
  timesUsed: 0,
  ...overrides,
});

const buildService = (rows: readonly InputFaqRow[]) => {
  const mockModel = {
    find: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue(rows) }) }),
    updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
  };
  return { service: new LeadFaqResolverService(mockModel as never), mockModel };
};

describe('LeadFaqResolverService.executeResolve', () => {
  it('uses the project answer over the default answer', async () => {
    const inputRow = buildRow({
      defaultAnswer: 'General',
      projectAnswers: [{ projectId: 'p1', projectTitle: 'La Ceiba', answer: 'Solo para La Ceiba' }],
    });
    const { service } = buildService([inputRow]);
    const actualFaqs = await service.executeResolve({ projectId: 'p1' });
    expect(actualFaqs).toEqual([
      {
        id: String(inputRow._id),
        question: 'Pregunta',
        answer: 'Solo para La Ceiba',
        category: 'price',
        alternativePhrasings: [],
      },
    ]);
  });

  it('falls back to the default answer when the project has no answer', async () => {
    const { service } = buildService([
      buildRow({
        defaultAnswer: 'General',
        projectAnswers: [{ projectId: 'p2', projectTitle: 'Otro', answer: 'Otro proyecto' }],
      }),
    ]);
    const actualFaqs = await service.executeResolve({ projectId: 'p1' });
    expect(actualFaqs.map((faq) => faq.answer)).toEqual(['General']);
  });

  it('uses the default answer when no project is given', async () => {
    const { service } = buildService([
      buildRow({
        defaultAnswer: 'General',
        projectAnswers: [{ projectId: 'p1', projectTitle: 'La Ceiba', answer: 'Específica' }],
      }),
    ]);
    const actualFaqs = await service.executeResolve();
    expect(actualFaqs.map((faq) => faq.answer)).toEqual(['General']);
  });

  it('skips FAQs that have neither a project nor a default answer', async () => {
    const { service } = buildService([
      buildRow({ question: 'Sin respuesta', projectAnswers: [{ projectId: 'p2', projectTitle: 'X', answer: 'Y' }] }),
      buildRow({ question: 'Con respuesta', defaultAnswer: 'Sí' }),
    ]);
    const actualFaqs = await service.executeResolve({ projectId: 'p1' });
    expect(actualFaqs.map((faq) => faq.question)).toEqual(['Con respuesta']);
  });

  it('orders by timesUsed desc and caps the result at 60 when there is no customer text', async () => {
    const inputRows = Array.from({ length: 65 }, (_unused, index) =>
      buildRow({ question: `Q${index}`, defaultAnswer: 'A', timesUsed: index }),
    );
    const { service } = buildService(inputRows);
    const actualFaqs = await service.executeResolve();
    expect(actualFaqs).toHaveLength(60);
    expect(actualFaqs[0].question).toBe('Q64');
    expect(actualFaqs[59].question).toBe('Q5');
  });

  it('ranks a phrasing match above a higher timesUsed FAQ', async () => {
    const popular = buildRow({
      question: '¿Cuál es el precio?',
      defaultAnswer: 'Desde 85M',
      timesUsed: 100,
    });
    const matched = buildRow({
      question: '¿El proyecto se entrega con vías pavimentadas?',
      alternativePhrasings: ['vías pavimentadas', 'calles pavimentadas'],
      defaultAnswer: 'Sí, con vías pavimentadas',
      timesUsed: 1,
    });
    const { service } = buildService([popular, matched]);
    const actualFaqs = await service.executeResolve({
      customerText: 'Hola, me confirman si tienen calles pavimentadas?',
    });
    expect(actualFaqs[0].question).toBe(matched.question);
    expect(actualFaqs[0].alternativePhrasings).toEqual(['vías pavimentadas', 'calles pavimentadas']);
    expect(actualFaqs[1].question).toBe(popular.question);
  });

  it('still caps at 60 when ranking by customer text', async () => {
    const inputRows = Array.from({ length: 65 }, (_unused, index) =>
      buildRow({ question: `Q${index}`, defaultAnswer: 'A', timesUsed: index }),
    );
    const { service } = buildService(inputRows);
    const actualFaqs = await service.executeResolve({ customerText: 'hola' });
    expect(actualFaqs).toHaveLength(60);
  });
});

describe('LeadFaqResolverService.executeMarkUsed', () => {
  it('increments usage for valid ids only', async () => {
    const { service, mockModel } = buildService([]);
    const inputId = new Types.ObjectId().toHexString();
    await service.executeMarkUsed([inputId, 'not-an-id']);
    expect(mockModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [inputId] } },
      { $inc: { timesUsed: 1 }, $set: { lastUsedAt: expect.any(Date) } },
    );
  });

  it('does nothing without ids', async () => {
    const { service, mockModel } = buildService([]);
    await service.executeMarkUsed([]);
    expect(mockModel.updateMany).not.toHaveBeenCalled();
  });
});
