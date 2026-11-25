import { buildAdminListFilter } from './build-admin-list-filter.util';

describe('buildAdminListFilter', () => {
  it('uses single assignedTo when set', () => {
    const filter = buildAdminListFilter({
      assignedTo: 'user-a',
      assignedToIn: ['user-b', 'user-c'],
      unassignedOnly: true,
    });
    expect(filter.assignedTo).toBe('user-a');
  });

  it('uses assignedToIn when assignedTo is absent', () => {
    const filter = buildAdminListFilter({
      assignedToIn: ['user-b', 'user-c'],
      unassignedOnly: true,
    });
    expect(filter.assignedTo).toEqual({ $in: ['user-b', 'user-c'] });
  });

  it('prefers assignedTo over assignedToIn and skips unassignedOnly', () => {
    const filter = buildAdminListFilter({
      assignedTo: ' user-a ',
      assignedToIn: ['user-b'],
    });
    expect(filter.assignedTo).toBe('user-a');
    expect(filter.$or).toBeUndefined();
  });

  it('applies unassignedOnly only when no assignee filters are set', () => {
    const filter = buildAdminListFilter({
      unassignedOnly: true,
    });
    expect(filter.$or).toEqual([
      { assignedTo: { $exists: false } },
      { assignedTo: null },
      { assignedTo: '' },
    ]);
  });

  it('filters by interestedProjects.projectId when projectId is set', () => {
    const filter = buildAdminListFilter({
      projectId: ' proj-abc ',
    });
    expect(filter['interestedProjects.projectId']).toBe('proj-abc');
  });

  it('ignores blank projectId', () => {
    const filter = buildAdminListFilter({
      projectId: '   ',
    });
    expect(filter['interestedProjects.projectId']).toBeUndefined();
  });
});
