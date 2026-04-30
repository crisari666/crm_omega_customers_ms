import { validate } from 'class-validator';
import { StaffPerformanceBodyDto } from './staff-performance.body.dto';

describe('StaffPerformanceBodyDto', () => {
  it('accepts userIds and ISO date range', async () => {
    const dto = Object.assign(new StaffPerformanceBodyDto(), {
      userIds: ['507f1f77bcf86cd799439011'],
      assignedFrom: '2024-01-01T00:00:00.000Z',
      assignedTo: '2024-01-31T23:59:59.999Z',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects empty userIds', async () => {
    const dto = Object.assign(new StaffPerformanceBodyDto(), {
      userIds: [],
      assignedFrom: '2024-01-01',
      assignedTo: '2024-01-31',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid user id in array', async () => {
    const dto = Object.assign(new StaffPerformanceBodyDto(), {
      userIds: ['not-an-id'],
      assignedFrom: '2024-01-01',
      assignedTo: '2024-01-31',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
