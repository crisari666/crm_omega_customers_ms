import { NotFoundException } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { ASSIGNMENT_CHANGE_LOGGED_KEY } from './customer-audit.service';

describe('CustomerService.assignCustomerAssignee', () => {
  it('stamps assignedDate when assignee is set', async () => {
    const before = Date.now();
    const customer = {
      assignedTo: undefined as string | undefined,
      assignedDate: undefined as string | undefined,
      $locals: {} as Record<string, unknown>,
      save: jest.fn().mockImplementation(async function save(this: {
        assignedTo?: string;
        assignedDate?: string;
        $locals: Record<string, unknown>;
      }) {
        return this;
      }),
    };
    const customerModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(customer),
      }),
    };
    const customerAuditService = {
      recordCustomerAssignmentChange: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CustomerService(
      {} as never,
      customerModel as never,
      {} as never,
      {} as never,
      {} as never,
      customerAuditService as never,
      {} as never,
    );
    const saved = await service.assignCustomerAssignee(
      'aaaaaaaaaaaaaaaaaaaaaaaa',
      { assignedTo: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
      'cccccccccccccccccccccccc',
    );
    expect(saved.assignedTo).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(typeof saved.assignedDate).toBe('string');
    expect(new Date(saved.assignedDate as string).getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(customer.$locals[ASSIGNMENT_CHANGE_LOGGED_KEY]).toBe(true);
    expect(customerAuditService.recordCustomerAssignmentChange).toHaveBeenCalled();
  });

  it('throws when customer is missing', async () => {
    const customerModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    };
    const service = new CustomerService(
      {} as never,
      customerModel as never,
      {} as never,
      {} as never,
      {} as never,
      { recordCustomerAssignmentChange: jest.fn() } as never,
      {} as never,
    );
    await expect(
      service.assignCustomerAssignee(
        'aaaaaaaaaaaaaaaaaaaaaaaa',
        { assignedTo: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
        'cccccccccccccccccccccccc',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
