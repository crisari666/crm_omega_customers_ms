import { Types } from 'mongoose';
import { resolveNextDeliveryStatus } from './utils/resolve-next-delivery-status.util';
import { LeadConversationMessageLogService } from './lead-conversation-message-log.service';

describe('resolveNextDeliveryStatus', () => {
  it.each([
    [undefined, 'sent', 'sent'],
    ['sent', 'delivered', 'delivered'],
    ['delivered', 'read', 'read'],
    ['sent', 'read', 'read'],
    ['read', 'delivered', null],
    ['delivered', 'sent', null],
    ['read', 'read', null],
    ['sent', 'failed', 'failed'],
    ['failed', 'delivered', null],
    ['failed', 'failed', null],
    ['sent', 'deleted', null],
  ])('current=%s incoming=%s -> %s', (inputCurrent, inputIncoming, expected) => {
    expect(resolveNextDeliveryStatus(inputCurrent, inputIncoming)).toBe(expected);
  });
});

describe('LeadConversationMessageLogService.applyDeliveryStatus', () => {
  const messageId = new Types.ObjectId();
  const buildService = (current: { deliveryStatus?: string } | null) => {
    const exec = jest.fn().mockResolvedValue(current === null ? null : { _id: messageId, ...current });
    const mockModel = {
      findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => ({ exec }) }) }),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    const service = new LeadConversationMessageLogService(mockModel as never);
    return { service, mockModel };
  };

  it('advances sent to delivered', async () => {
    const { service, mockModel } = buildService({ deliveryStatus: 'sent' });
    await service.applyDeliveryStatus({ wamid: 'w1', status: 'delivered' });
    expect(mockModel.updateOne).toHaveBeenCalledWith({ _id: messageId }, { $set: { deliveryStatus: 'delivered' } });
  });

  it('does not downgrade read to delivered', async () => {
    const { service, mockModel } = buildService({ deliveryStatus: 'read' });
    await service.applyDeliveryStatus({ wamid: 'w1', status: 'delivered' });
    expect(mockModel.updateOne).not.toHaveBeenCalled();
  });

  it('marks failed with delivered=false and error code', async () => {
    const { service, mockModel } = buildService({ deliveryStatus: 'sent' });
    await service.applyDeliveryStatus({ wamid: 'w1', status: 'failed', errorCode: 131047 });
    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { _id: messageId },
      { $set: { deliveryStatus: 'failed', delivered: false, errorCode: 131047 } },
    );
  });

  it('keeps failed final', async () => {
    const { service, mockModel } = buildService({ deliveryStatus: 'failed' });
    await service.applyDeliveryStatus({ wamid: 'w1', status: 'read' });
    expect(mockModel.updateOne).not.toHaveBeenCalled();
  });

  it('ignores unknown wamid', async () => {
    const { service, mockModel } = buildService(null);
    await service.applyDeliveryStatus({ wamid: 'missing', status: 'sent' });
    expect(mockModel.updateOne).not.toHaveBeenCalled();
  });
});
