import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LeadCustomerService } from './lead-customer.service';

describe('LeadCustomerService', () => {
  const mockCustomerModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    updateOne: jest.fn(),
  };
  const mockMetaLeadCampaignModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  };
  const mockCustomerService = {
    tagLeadIngress: jest.fn(),
    createCustomer: jest.fn(),
  };
  let service: LeadCustomerService;

  const buildCampaignFindOneChain = (value: unknown) => {
    const chain: {
      sort: jest.Mock;
      select: jest.Mock;
      lean: jest.Mock;
      exec: jest.Mock;
    } = {
      sort: jest.fn(),
      select: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue(value),
    };
    chain.sort.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    return chain;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCustomerModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    });
    mockCustomerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    mockMetaLeadCampaignModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      }),
    });
    mockMetaLeadCampaignModel.findOne.mockReturnValue(buildCampaignFindOneChain(null));
    mockMetaLeadCampaignModel.updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
    service = new LeadCustomerService(
      mockCustomerModel as never,
      mockMetaLeadCampaignModel as never,
      mockCustomerService as never,
    );
  });

  it('links an existing phone match and enriches empty WhatsApp identity fields', async () => {
    const customerId = new Types.ObjectId();
    const campaignId = new Types.ObjectId();
    const customer = {
      _id: customerId,
      name: 'Andres',
      lastName: 'Palomino',
      phone: '573182620113',
      email: '',
      whatsappUsername: '',
      metaWhatsappUserId: '',
      metaCtwaClid: '',
      whatsapp: '',
      assignedTo: 'ventor-meta',
      save: jest.fn().mockResolvedValue(undefined),
      $locals: {} as Record<string, unknown>,
    };
    mockCustomerModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([customer]) }),
    });
    mockMetaLeadCampaignModel.findOne.mockReturnValue(buildCampaignFindOneChain({ _id: campaignId }));
    const actual = await service.findOrCreateByWaId({
      waId: '573182620113',
      profileName: 'Andres Palomino',
      actorUserId: 'bot',
      email: 'andresfelipe.lugo@outlook.com',
      whatsappUsername: 'Pipepalo28',
      metaWhatsappUserId: 'CO.4513634245617612',
      ctwaClid: 'clid-1',
    });
    expect(actual).toBe(customer);
    expect(customer.email).toBe('andresfelipe.lugo@outlook.com');
    expect(customer.whatsappUsername).toBe('Pipepalo28');
    expect(customer.metaWhatsappUserId).toBe('CO.4513634245617612');
    expect(customer.metaCtwaClid).toBe('clid-1');
    expect(customer.assignedTo).toBe('ventor-meta');
    expect(mockCustomerService.createCustomer).not.toHaveBeenCalled();
    expect(mockCustomerService.tagLeadIngress).toHaveBeenCalledWith(customerId, 'whatsapp_lead_conversation');
    expect(mockMetaLeadCampaignModel.updateOne).toHaveBeenCalledWith(
      { _id: campaignId },
      { $set: { whatsappUsername: 'Pipepalo28', metaWhatsappUserId: 'CO.4513634245617612' } },
    );
  });

  it('falls back to email match when phone has no customer', async () => {
    const customerId = new Types.ObjectId();
    const customer = {
      _id: customerId,
      name: 'Contacto',
      lastName: '',
      phone: '573000000000',
      email: 'andresfelipe.lugo@outlook.com',
      whatsappUsername: '',
      metaWhatsappUserId: '',
      metaCtwaClid: '',
      whatsapp: '',
      assignedTo: 'ventor-meta',
      save: jest.fn().mockResolvedValue(undefined),
      $locals: {} as Record<string, unknown>,
    };
    mockCustomerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(customer) });
    const actual = await service.findOrCreateByWaId({
      waId: '573182620113',
      profileName: 'Andres Palomino',
      actorUserId: 'bot',
      email: 'andresfelipe.lugo@outlook.com',
    });
    expect(actual).toBe(customer);
    expect(customer.name).toBe('Andres');
    expect(customer.lastName).toBe('Palomino');
    expect(mockCustomerService.createCustomer).not.toHaveBeenCalled();
  });

  it('does not overwrite assignedTo when booking assigns a pool ventor', async () => {
    const customerId = new Types.ObjectId();
    const customer = {
      _id: customerId,
      assignedTo: 'ventor-meta',
      save: jest.fn(),
      $locals: {} as Record<string, unknown>,
    };
    mockCustomerModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(customer) });
    await service.assignToVentor(customerId, 'pool-user');
    expect(customer.save).not.toHaveBeenCalled();
    expect(customer.assignedTo).toBe('ventor-meta');
  });

  it('keeps immediate_assign Meta ventor when bot tries to reassign', async () => {
    const customerId = new Types.ObjectId();
    const customer = {
      _id: customerId,
      assignedTo: 'ventor-meta',
      save: jest.fn(),
      $locals: {} as Record<string, unknown>,
    };
    mockCustomerModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(customer) });
    mockMetaLeadCampaignModel.findOne.mockReturnValue(
      buildCampaignFindOneChain({ _id: new Types.ObjectId() }),
    );
    await service.assignToVentor(customerId, 'pool-user');
    expect(mockMetaLeadCampaignModel.findOne).toHaveBeenCalledWith({
      customerId,
      flowStrategy: 'immediate_assign',
    });
    expect(customer.save).not.toHaveBeenCalled();
    expect(customer.assignedTo).toBe('ventor-meta');
  });

  it('overwrites assignedTo when admin requests overwrite', async () => {
    const customerId = new Types.ObjectId();
    const customer = {
      _id: customerId,
      assignedTo: 'ventor-meta',
      save: jest.fn().mockResolvedValue(undefined),
      $locals: {} as Record<string, unknown>,
    };
    mockCustomerModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(customer) });
    await service.assignToVentor(customerId, 'admin-user', 'admin1', { overwrite: true });
    expect(customer.assignedTo).toBe('admin-user');
    expect(customer.save).toHaveBeenCalled();
  });

  it('creates a customer when no unify match exists', async () => {
    const created = { _id: new Types.ObjectId() };
    mockCustomerService.createCustomer.mockResolvedValue(created);
    const actual = await service.findOrCreateByWaId({
      waId: '573182620113',
      profileName: 'Andres Palomino',
      actorUserId: 'bot',
      whatsappUsername: 'Pipepalo28',
      metaWhatsappUserId: 'CO.1',
    });
    expect(actual).toBe(created);
    expect(mockCustomerService.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '573182620113',
        whatsappUsername: 'Pipepalo28',
        metaWhatsappUserId: 'CO.1',
        leadSources: ['whatsapp_lead_conversation'],
      }),
      'bot',
    );
  });

  it('retries phone lookup after create conflict', async () => {
    const customerId = new Types.ObjectId();
    const customer = {
      _id: customerId,
      name: 'Andres',
      lastName: '',
      email: '',
      whatsappUsername: '',
      metaWhatsappUserId: '',
      metaCtwaClid: '',
      whatsapp: '573182620113',
      assignedTo: '',
      save: jest.fn().mockResolvedValue(undefined),
      $locals: {} as Record<string, unknown>,
    };
    mockCustomerService.createCustomer.mockRejectedValue(new ConflictException('dup'));
    mockCustomerModel.find
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      })
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([customer]) }),
      });
    const actual = await service.findOrCreateByWaId({
      waId: '573182620113',
      profileName: 'Andres',
      actorUserId: 'bot',
    });
    expect(actual).toBe(customer);
  });
});
