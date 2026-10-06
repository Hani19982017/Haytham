export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Smart Academic Advisor - Enterprise University API',
    description: 'AI-Based Academic Guidance & Credit-Hour Advising System conforming to Ibn Al-Haitham bylaws.',
    version: '2.4.0',
    contact: {
      name: 'Faculty of Computers & Artificial Intelligence - Academic Affairs',
      email: 'academic-affairs@university.edu',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'University Academic Core API Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide signed JWT access token in the Authorization header.',
      },
    },
    schemas: {
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'student@example.com' },
          password: { type: 'string', format: 'password', example: 'password123' },
        },
      },
      StudentProfile: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          studentCode: { type: 'string', example: '20230142' },
          nameAr: { type: 'string', example: 'عمر فاروق عبد الرحمن' },
          nameEn: { type: 'string', example: 'Omar Farouk' },
          cumulativeGpa: { type: 'number', format: 'float', example: 1.78 },
          completedCredits: { type: 'integer', example: 58 },
          warningCount: { type: 'integer', example: 2 },
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
  paths: {
    '/auth/login': {
      post: {
        summary: 'Authenticate user with University credentials',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: { description: 'Authentication successful with JWT tokens' },
          401: { description: 'Invalid credentials or suspended account' },
        },
      },
    },
    '/students/{id}': {
      get: {
        summary: 'Retrieve detailed student academic profile and bylaws evaluation',
        tags: ['Students'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Student profile' },
          403: { description: 'Forbidden: IDOR protection prevented access' },
          404: { description: 'Student not found' },
        },
      },
    },
    '/students/{id}/recommendations': {
      get: {
        summary: 'Generate explainable, rules-verified AI course recommendations',
        tags: ['AI Recommendations'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'List of ranked, legally verified course recommendations' },
        },
      },
    },
    '/students/{id}/register': {
      post: {
        summary: 'Validate and register courses through Academic Rules Engine',
        tags: ['Registration'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Registration confirmed' },
          422: { description: 'Registration rejected due to academic bylaw violations' },
        },
      },
    },
  },
};
