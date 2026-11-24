import { ProjectKnowledgeService } from './project-knowledge.service';

const ragProject = {
  _id: 'p1',
  title: ' Valle del Sol ',
  shortDescription: 'Lotes campestres',
  description: 'Descripción larga',
  location: 'Carmen de Apicalá',
  city: 'Carmen',
  state: 'Tolima',
  priceSell: 85000000,
  lotOptions: [
    { area: 400, price: 95000000 },
    { area: 300, price: 85000000 },
    { area: 'x', price: 1 },
  ],
  amenities: [{ _id: 'a1', title: 'Piscina' }],
  amenitiesGroups: [{ icon: 'water', title: 'Servicios', amenities: ['Agua', 'Luz'] }],
  plane: 'plane.pdf',
  brochure: 'brochure file.pdf',
  reelVideos: [],
  verticalVideos: ['vertical.mp4'],
  commissionPercentage: 7,
  commissionValue: 5950000,
  ventorName: 'Pedro',
  heldByUserId: 'u1',
};

const mockResponse = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

const buildService = (config: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    'leadConversation.ragUrl': 'http://rag/',
    'leadConversation.ragPublicUrl': 'https://rag.public/',
    'leadConversation.ragProjectsDistribution': '',
    ...config,
  };
  const mockConfig = { get: jest.fn().mockImplementation((key: string, fallback?: string) => values[key] ?? fallback) };
  const mockCatalog = {
    buildPlaneUrl: jest.fn().mockImplementation((project: { plane: string }) =>
      values['leadConversation.ragPublicUrl'] === ''
        ? 'https://mock/plane.pdf'
        : project.plane
          ? `https://rag.public/rag/uploads/projects/${project.plane}`
          : undefined,
    ),
  };
  return new ProjectKnowledgeService(mockConfig as never, mockCatalog as never);
};

describe('ProjectKnowledgeService', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    mockFetch = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/lots/public')) {
        return mockResponse({ summary: { lot: { available: 12, sold: 38, hold: 1, locked: 0, total: 51 } } }) as never;
      }
      return mockResponse([ragProject]) as never;
    });
  });

  afterEach(() => mockFetch.mockRestore());

  it('maps a project without commission, ventor or holder data', async () => {
    const actualProjects = await buildService().executeGetAll();
    expect(actualProjects).toHaveLength(1);
    expect(actualProjects[0]).toEqual({
      id: 'p1',
      title: 'Valle del Sol',
      shortDescription: 'Lotes campestres',
      description: 'Descripción larga',
      location: 'Carmen de Apicalá',
      city: 'Carmen',
      state: 'Tolima',
      priceSell: 85000000,
      lotOptions: [
        { area: 400, price: 95000000 },
        { area: 300, price: 85000000 },
      ],
      financing: {
        separation: 0,
        installments: 36,
        minMonthlyPayment: 2_362_000,
        plans: [
          { area: 300, price: 85_000_000, monthlyPayment: 2_362_000 },
          { area: 400, price: 95_000_000, monthlyPayment: 2_639_000 },
        ],
      },
      amenitiesGroups: [{ title: 'Servicios', items: ['Agua', 'Luz'] }],
      planeUrl: 'https://rag.public/rag/uploads/projects/plane.pdf',
      brochureUrl: 'https://rag.public/rag/uploads/projects/brochure%20file.pdf',
      videoUrl: 'https://rag.public/rag/uploads/projects/vertical.mp4',
    });
    expect(JSON.stringify(actualProjects)).not.toMatch(/commission|ventorName|heldByUserId/);
  });

  it('falls back to the flat amenities list when there are no groups', async () => {
    mockFetch.mockImplementation(async () => mockResponse([{ ...ragProject, amenitiesGroups: [] }]) as never);
    const actualProjects = await buildService().executeGetAll();
    expect(actualProjects[0].amenitiesGroups).toEqual([{ title: 'Amenidades', items: ['Piscina'] }]);
  });

  it('uses the first reel video before the vertical videos', async () => {
    mockFetch.mockImplementation(async () => mockResponse([{ ...ragProject, reelVideos: ['reel.mp4'] }]) as never);
    const actualProjects = await buildService().executeGetAll();
    expect(actualProjects[0].videoUrl).toBe('https://rag.public/rag/uploads/projects/reel.mp4');
  });

  it('only offers the sample plan without a public rag url', async () => {
    const actualProjects = await buildService({ 'leadConversation.ragPublicUrl': '' }).executeGetAll();
    expect(actualProjects[0].planeUrl).toBe('https://mock/plane.pdf');
    expect(actualProjects[0].videoUrl).toBeUndefined();
    expect(actualProjects[0].brochureUrl).toBeUndefined();
  });

  it('applies the distribution filter to the projects url', async () => {
    await buildService({ 'leadConversation.ragProjectsDistribution': 'external' }).executeGetAll();
    expect(mockFetch).toHaveBeenCalledWith('http://rag/rag/projects?enable=true&distribution=external');
  });

  it('caches the projects and the lot counts', async () => {
    const service = buildService();
    const first = await service.executeGetById('p1');
    await service.executeGetById('p1');
    expect(first?.lotCounts).toEqual({ available: 12, sold: 38, total: 51 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith('http://rag/rag/projects/p1/lots/public');
  });

  it('returns the project without lot counts when the lots endpoint fails', async () => {
    mockFetch.mockImplementation(async (input) =>
      (String(input).includes('/lots/public') ? mockResponse({}, false) : mockResponse([ragProject])) as never,
    );
    const actualProject = await buildService().executeGetById('p1');
    expect(actualProject?.title).toBe('Valle del Sol');
    expect(actualProject).not.toHaveProperty('lotCounts');
  });

  it('returns undefined for an unknown project and an empty list when rag is down', async () => {
    const service = buildService();
    expect(await service.executeGetById('ghost')).toBeUndefined();
    mockFetch.mockRejectedValue(new Error('down'));
    expect(await buildService().executeGetAll()).toEqual([]);
  });

  it('summarizes the catalog with the lowest lot price', async () => {
    const actualSummary = await buildService().executeGetCatalogSummary();
    expect(actualSummary).toEqual([{ id: 'p1', title: 'Valle del Sol', location: 'Carmen de Apicalá', priceFrom: 85000000 }]);
  });
});
