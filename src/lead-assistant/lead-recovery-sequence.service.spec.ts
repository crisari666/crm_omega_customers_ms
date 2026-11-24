import { BadRequestException } from '@nestjs/common';
import type { LeadRecoveryStepDto } from './dto/lead-recovery-step.dto';
import { LeadRecoverySequenceService } from './lead-recovery-sequence.service';
import type { LeadRecoveryStep } from './types/lead-recovery-step.type';

const buildStepDto = (overrides: Partial<LeadRecoveryStepDto> = {}): LeadRecoveryStepDto => ({
  label: 'Primer recordatorio',
  offsetHours: 2,
  enabled: true,
  template: {
    name: 'recordatorio',
    language: 'es',
    bodyText: 'Hola {{nombre}}',
    bindings: [{ variable: 'nombre', component: 'body', format: 'named', source: 'customer_first_name' }],
  },
  ...overrides,
});

const buildStoredStep = (id: string, sentCount: number, repliedCount: number): LeadRecoveryStep => ({
  id,
  label: 'Guardado',
  offsetHours: 2,
  enabled: true,
  template: { name: 'recordatorio', language: 'es', bodyText: 'Hola', bindings: [] },
  sentCount,
  repliedCount,
});

const buildService = (storedSteps: readonly LeadRecoveryStep[] = []) => {
  const findOneExec = jest.fn().mockResolvedValue({ steps: storedSteps });
  const mockModel = {
    findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: findOneExec }) }),
    findOneAndUpdate: jest.fn().mockImplementation((_filter, update) => ({
      lean: () => ({ exec: jest.fn().mockResolvedValue({ steps: update.$set.steps }) }),
    })),
    updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
  };
  return { service: new LeadRecoverySequenceService(mockModel as never), mockModel };
};

describe('LeadRecoverySequenceService.executeReplace', () => {
  it('assigns ids to new steps and keeps counters of existing ids', async () => {
    const { service } = buildService([buildStoredStep('keep-me', 7, 3)]);
    const actual = await service.executeReplace({
      steps: [buildStepDto({ id: 'keep-me', offsetHours: 2 }), buildStepDto({ offsetHours: 24 })],
    });
    expect(actual.steps[0]).toMatchObject({ id: 'keep-me', sentCount: 7, repliedCount: 3 });
    expect(actual.steps[1].id).toEqual(expect.any(String));
    expect(actual.steps[1].id.length).toBeGreaterThan(0);
    expect(actual.steps[1]).toMatchObject({ sentCount: 0, repliedCount: 0 });
  });

  it('rejects duplicate offsets with a Spanish message', async () => {
    const { service, mockModel } = buildService();
    const promise = service.executeReplace({ steps: [buildStepDto(), buildStepDto({ label: 'Otro' })] });
    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toThrow(/mismo tiempo de espera/);
    expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a template variable without binding with a Spanish message', async () => {
    const { service, mockModel } = buildService();
    const inputStep = buildStepDto({
      template: { name: 'recordatorio', language: 'es', bodyText: 'Hola {{nombre}} de {{negocio}}', bindings: [] },
    });
    const promise = service.executeReplace({ steps: [inputStep] });
    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toThrow(/variables sin asignar: nombre, negocio/);
    expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('accepts an empty sequence', async () => {
    const { service } = buildService([buildStoredStep('old', 1, 1)]);
    await expect(service.executeReplace({ steps: [] })).resolves.toEqual({ steps: [] });
  });
});

describe('LeadRecoverySequenceService step helpers', () => {
  it('findStep returns the step or null', async () => {
    const { service } = buildService([buildStoredStep('a', 0, 0)]);
    await expect(service.findStep('a')).resolves.toMatchObject({ id: 'a' });
    await expect(service.findStep('missing')).resolves.toBeNull();
  });

  it('increments sent and replied counters of the matching step', async () => {
    const { service, mockModel } = buildService();
    await service.executeIncrementSent('a');
    await service.executeIncrementReplied('a');
    expect(mockModel.updateOne).toHaveBeenNthCalledWith(
      1,
      { key: 'default', 'steps.id': 'a' },
      { $inc: { 'steps.$.sentCount': 1 } },
    );
    expect(mockModel.updateOne).toHaveBeenNthCalledWith(
      2,
      { key: 'default', 'steps.id': 'a' },
      { $inc: { 'steps.$.repliedCount': 1 } },
    );
  });
});
