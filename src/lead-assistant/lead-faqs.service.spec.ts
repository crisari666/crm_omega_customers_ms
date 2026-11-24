import { BadRequestException } from '@nestjs/common';
import { LeadFaqsService } from './lead-faqs.service';

const buildService = (existing: Record<string, unknown> | null = null) => {
  const mockModel = {
    create: jest.fn().mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve({ toObject: () => ({ _id: 'f1', timesUsed: 0, ...data }) }),
    ),
    findById: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue(existing) }) }),
    findByIdAndUpdate: jest.fn().mockImplementation((_id: string, update: { $set: Record<string, unknown> }) => ({
      lean: () => ({ exec: jest.fn().mockResolvedValue({ _id: 'f1', timesUsed: 0, ...existing, ...update.$set }) }),
    })),
  };
  return { service: new LeadFaqsService(mockModel as never), mockModel };
};

describe('LeadFaqsService', () => {
  it('rejects a FAQ without default nor project answers', async () => {
    const { service, mockModel } = buildService();
    await expect(service.executeCreate({ question: '¿Precio?', category: 'price', defaultAnswer: '  ' })).rejects.toThrow(
      BadRequestException,
    );
    expect(mockModel.create).not.toHaveBeenCalled();
  });

  it('creates a FAQ with only a project answer', async () => {
    const { service } = buildService();
    const actual = await service.executeCreate(
      {
        question: ' ¿Precio? ',
        category: 'price',
        projectAnswers: [{ projectId: 'p1', projectTitle: 'La Ceiba', answer: 'Desde $10M' }],
      },
      'office-1',
    );
    expect(actual).toMatchObject({ id: 'f1', question: '¿Precio?', enabled: true, createdByOfficeUserId: 'office-1' });
    expect(actual.defaultAnswer).toBeUndefined();
  });

  it('validates the merged result on update', async () => {
    const { service, mockModel } = buildService({
      question: 'Q',
      category: 'price',
      defaultAnswer: 'General',
      projectAnswers: [],
      enabled: true,
    });
    await expect(service.executeUpdate('f1', { defaultAnswer: '' })).rejects.toThrow(BadRequestException);
    expect(mockModel.findByIdAndUpdate).not.toHaveBeenCalled();
    await expect(service.executeUpdate('f1', { enabled: false })).resolves.toMatchObject({ enabled: false });
  });
});
