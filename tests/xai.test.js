describe('Grok verification provider', () => {
  const oldEnv = process.env;
  const oldFetch = global.fetch;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...oldEnv, XAI_API_KEY: 'test-only-key', XAI_MODEL: 'grok-test', GEMINI_API_KEY: '' };
  });
  afterEach(() => { process.env = oldEnv; global.fetch = oldFetch; });

  test('uses xAI chat completions and keeps human approval mandatory', async () => {
    const output = { completeness: 90, quality: 80, originality: 70, timeliness: 60,
      evidence: { completeness: 'completed', quality: 'source', originality: 'link', timeliness: 'No evidence in delivery' }, reasoning: 'A recommendation' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) });
    const { verifyDelivery } = require('../src/services/ai');
    const result = await verifyDelivery('Create source files', 'completed source files https://github.com/example/repo');
    expect(result.mode).toBe('xai');
    expect(result.audit.model).toBe('grok-test');
    expect(result.scores.total).toBe(80);
    expect(result.needsHumanApproval).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.x.ai/v1/chat/completions');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).model).toBe('grok-test');
  });
  test('provider errors fall back and still require human approval', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    const result = await require('../src/services/ai').verifyDelivery('Create source files', 'completed source files https://github.com/example/repo');
    expect(result.mode).toBe('rubric-fallback');
    expect(result.needsHumanApproval).toBe(true);
  });
});
