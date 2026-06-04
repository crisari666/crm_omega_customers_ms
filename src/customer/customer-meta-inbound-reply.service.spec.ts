import { CustomerMetaInboundReplyService } from './customer-meta-inbound-reply.service';
import { VENTOR_ASSIGNMENT_CUSTOMER_MESSAGE_TEMPLATE } from './constants/ventor-assignment-message.constant';
import type { CustomerDocument } from './schemas/customer.schema';
import type { VentorAssignmentCandidate } from './types/ventor-assignment-candidate.type';

describe('CustomerMetaInboundReplyService', () => {
  const ventor: VentorAssignmentCandidate = {
    id: 'ventor-1',
    name: 'Ana',
    lastName: 'López',
    phone: '3001234567',
    phoneJob: '',
  };

  const createService = () => {
    const ventorAssignment = {
      executeFindVentorById: jest.fn(),
    };
    const potentialCustomersOutbound = {
      executeEmitPotentialCustomersEvent: jest.fn().mockResolvedValue(undefined),
    };
    const conversationsService = {
      executeUpsertFromMetaIngress: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CustomerMetaInboundReplyService(
      ventorAssignment as never,
      potentialCustomersOutbound as never,
      conversationsService as never,
    );
    return {
      service,
      ventorAssignment,
      potentialCustomersOutbound,
      conversationsService,
    };
  };

  const baseCustomer = {
    _id: '507f1f77bcf86cd799439011',
    assignedTo: 'ventor-1',
    whatsappPotentialCustomerStatus: 'ready_for_llm',
  } as unknown as CustomerDocument;

  const baseMsg = {
    from: '573001234567',
    id: 'wamid.inbound-1',
    timestamp: '1700000000',
    type: 'text',
    text: { body: 'Hola' },
  };

  it('skips when funnel status is not ready_for_llm', async () => {
    const { service, potentialCustomersOutbound } = createService();
    const customer = {
      ...baseCustomer,
      whatsappPotentialCustomerStatus: 'pending_flow',
    } as unknown as CustomerDocument;
    const sent = await service.executeTrySendAssignedVentorContactReply({
      customer,
      normalizedWaId: '573001234567',
      phoneNumberId: 'phone-1',
      contactName: 'Test',
      msg: baseMsg,
    });
    expect(sent).toBe(false);
    expect(potentialCustomersOutbound.executeEmitPotentialCustomersEvent).not.toHaveBeenCalled();
  });

  it('skips when assignedTo is empty', async () => {
    const { service, potentialCustomersOutbound } = createService();
    const customer = { ...baseCustomer, assignedTo: '' } as unknown as CustomerDocument;
    const sent = await service.executeTrySendAssignedVentorContactReply({
      customer,
      normalizedWaId: '573001234567',
      phoneNumberId: 'phone-1',
      contactName: 'Test',
      msg: baseMsg,
    });
    expect(sent).toBe(false);
    expect(potentialCustomersOutbound.executeEmitPotentialCustomersEvent).not.toHaveBeenCalled();
  });

  it('skips when inbound body is empty', async () => {
    const { service, potentialCustomersOutbound } = createService();
    const sent = await service.executeTrySendAssignedVentorContactReply({
      customer: baseCustomer,
      normalizedWaId: '573001234567',
      phoneNumberId: 'phone-1',
      contactName: 'Test',
      msg: { ...baseMsg, type: 'text', text: { body: '   ' } },
    });
    expect(sent).toBe(false);
    expect(potentialCustomersOutbound.executeEmitPotentialCustomersEvent).not.toHaveBeenCalled();
  });

  it('emits ventor contact text and persists outbound conversation when ventor is found', async () => {
    const { service, ventorAssignment, potentialCustomersOutbound, conversationsService } =
      createService();
    ventorAssignment.executeFindVentorById.mockResolvedValue(ventor);
    const expectedBody = VENTOR_ASSIGNMENT_CUSTOMER_MESSAGE_TEMPLATE.replace(
      '[user_name]',
      'Ana López',
    ).replace('[user_phone]', '3001234567');
    const sent = await service.executeTrySendAssignedVentorContactReply({
      customer: baseCustomer,
      normalizedWaId: '573001234567',
      phoneNumberId: 'phone-1',
      contactName: 'Test User',
      msg: baseMsg,
    });
    expect(sent).toBe(true);
    expect(ventorAssignment.executeFindVentorById).toHaveBeenCalledWith('ventor-1');
    expect(potentialCustomersOutbound.executeEmitPotentialCustomersEvent).toHaveBeenCalledWith({
      type: 'potential_customers',
      payload: {
        action: 'send.potential_customer_text',
        waId: '573001234567',
        phoneNumberId: 'phone-1',
        customerId: '507f1f77bcf86cd799439011',
        body: expectedBody,
      },
    });
    expect(conversationsService.executeUpsertFromMetaIngress).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'cloud:phone-1:573001234567',
        message: expect.objectContaining({
          fromMe: true,
          body: expectedBody,
          messageId: 'crm-inbound-reply:wamid.inbound-1',
        }),
      }),
    );
  });

  it('skips emit when ventor is not found', async () => {
    const { service, ventorAssignment, potentialCustomersOutbound } = createService();
    ventorAssignment.executeFindVentorById.mockResolvedValue(null);
    const sent = await service.executeTrySendAssignedVentorContactReply({
      customer: baseCustomer,
      normalizedWaId: '573001234567',
      phoneNumberId: 'phone-1',
      contactName: 'Test',
      msg: baseMsg,
    });
    expect(sent).toBe(false);
    expect(potentialCustomersOutbound.executeEmitPotentialCustomersEvent).not.toHaveBeenCalled();
  });
});
