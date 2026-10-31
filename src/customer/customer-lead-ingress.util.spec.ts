import { Types } from 'mongoose';
import { CustomerService } from './customer.service';

describe('CustomerService lead ingress tagging', () => {
  const customerId = new Types.ObjectId();

  function buildServiceWithModel(updateOne: jest.Mock): CustomerService {
    const service = Object.create(CustomerService.prototype) as CustomerService;
    (service as unknown as { customerModel: { updateOne: jest.Mock } }).customerModel = {
      updateOne,
    };
    return service;
  }

  it('tagLeadIngress appends source and sets lifecycle lead when not customer', async () => {
    const exec = jest.fn().mockResolvedValue({ acknowledged: true });
    const updateOne = jest.fn().mockReturnValue({ exec });
    const service = buildServiceWithModel(updateOne);
    await service.tagLeadIngress(customerId, 'whatsapp_inbound');
    expect(updateOne).toHaveBeenCalledTimes(2);
    expect(updateOne.mock.calls[0][1]).toEqual({
      $addToSet: { leadSources: 'whatsapp_inbound' },
    });
    expect(updateOne.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        lifecycleStatus: { $nin: ['customer'] },
      }),
    );
    expect(updateOne.mock.calls[1][1]).toEqual({ $set: { lifecycleStatus: 'lead' } });
  });

  it('tagLeadIngress no-ops for invalid id', async () => {
    const updateOne = jest.fn();
    const service = buildServiceWithModel(updateOne);
    await service.tagLeadIngress('not-an-id', 'meta_form');
    expect(updateOne).not.toHaveBeenCalled();
  });
});
