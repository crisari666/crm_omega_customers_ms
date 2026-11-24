import { ConflictException } from '@nestjs/common';
import { MetaLeadFormsService } from './meta-lead-forms.service';

const GUARD_MESSAGE = 'Configura la plantilla de bienvenida del asistente antes de activar el flujo V2';

const buildRow = (flowStrategy: string) => ({
  _id: 'f1',
  formId: 'meta-1',
  formName: 'Form',
  flowStrategy,
  enabled: true,
  notes: '',
});

const buildService = (options: { hasWelcomeTemplate: boolean; existingStrategy?: string }) => {
  const mockFormModel = {
    findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue(null) }) }),
    findById: jest.fn().mockReturnValue({
      select: () => ({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({ flowStrategy: options.existingStrategy ?? 'immediate_assign' }),
        }),
      }),
    }),
    create: jest.fn().mockImplementation((data: { flowStrategy: string }) =>
      Promise.resolve({ toObject: () => buildRow(data.flowStrategy) }),
    ),
    findByIdAndUpdate: jest.fn().mockImplementation((_id: string, update: { $set: { flowStrategy?: string } }) => ({
      lean: () => ({
        exec: jest.fn().mockResolvedValue(buildRow(update.$set.flowStrategy ?? options.existingStrategy ?? 'immediate_assign')),
      }),
    })),
  };
  const mockSettingsService = {
    executeHasWelcomeTemplate: jest.fn().mockResolvedValue(options.hasWelcomeTemplate),
  };
  const service = new MetaLeadFormsService(
    mockFormModel as never,
    {} as never,
    {} as never,
    {} as never,
    mockSettingsService as never,
  );
  return { service, mockFormModel };
};

describe('MetaLeadFormsService V2 welcome template guard', () => {
  it('rejects creating a V2 form without a welcome template', async () => {
    const { service, mockFormModel } = buildService({ hasWelcomeTemplate: false });
    const promise = service.executeCreate({ formId: 'meta-1', formName: 'Form', flowStrategy: 'lead_conversation_v2' });
    await expect(promise).rejects.toThrow(ConflictException);
    await expect(promise).rejects.toThrow(GUARD_MESSAGE);
    expect(mockFormModel.create).not.toHaveBeenCalled();
  });

  it('allows creating a V2 form when the welcome template exists', async () => {
    const { service } = buildService({ hasWelcomeTemplate: true });
    await expect(
      service.executeCreate({ formId: 'meta-1', formName: 'Form', flowStrategy: 'lead_conversation_v2' }),
    ).resolves.toMatchObject({ flowStrategy: 'lead_conversation_v2' });
  });

  it('does not check the template for V1 forms', async () => {
    const { service } = buildService({ hasWelcomeTemplate: false });
    await expect(
      service.executeCreate({ formId: 'meta-1', formName: 'Form', flowStrategy: 'lead_conversation' }),
    ).resolves.toMatchObject({ flowStrategy: 'lead_conversation' });
  });

  it('rejects switching a form to V2 without a welcome template', async () => {
    const { service, mockFormModel } = buildService({ hasWelcomeTemplate: false });
    await expect(service.executeUpdate('f1', { flowStrategy: 'lead_conversation_v2' })).rejects.toThrow(GUARD_MESSAGE);
    expect(mockFormModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('uses the stored strategy when the update does not change it', async () => {
    const { service } = buildService({ hasWelcomeTemplate: false, existingStrategy: 'lead_conversation_v2' });
    await expect(service.executeUpdate('f1', { notes: 'x' })).rejects.toThrow(ConflictException);
  });

  it('allows non-V2 updates without a welcome template', async () => {
    const { service } = buildService({ hasWelcomeTemplate: false, existingStrategy: 'lead_conversation' });
    await expect(service.executeUpdate('f1', { notes: 'x' })).resolves.toMatchObject({ id: 'f1' });
  });
});
