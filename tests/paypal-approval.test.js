process.env.NODE_ENV = 'test';
process.env.STORE_PATH = '/tmp/trustsettle-paypal-approval-test.json';
const request = require('supertest');
const app = require('../src/app')();
const db = require('../src/db');
const paypal = require('../src/services/paypal');

describe('PayPal authorization state', () => {
  beforeEach(() => { db.reset(); jest.restoreAllMocks(); });
  afterAll(() => jest.restoreAllMocks());
  async function setup() {
    jest.spyOn(paypal, 'createAuthorizeOrder').mockResolvedValue({ mode: 'sandbox', orderId: 'ORDER123', authorizationId: null, status: 'PAYER_ACTION_REQUIRED', approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123' });
    const create = await request(app).post('/api/jobs').send({ title: 'Test buyer approval', brief: 'Create editable design source files', budget: 1 }).expect(201);
    const id = create.body.job.id;
    const fund = await request(app).post(`/api/jobs/${id}/fund`).expect(200);
    return { id, fund };
  }
  test('pending buyer approval never records a hold or permits delivery', async () => {
    const { id, fund } = await setup();
    expect(fund.body.job.status).toBe('AWAITING_PAYPAL_APPROVAL');
    expect(fund.body.job.heldCents).toBe(0);
    expect(fund.body.job.authorizationId).toBeNull();
    const ledger = await request(app).get('/api/ledger').expect(200);
    expect(ledger.body.ledger).toHaveLength(0);
    await request(app).post(`/api/jobs/${id}/deliver`).send({ delivery: 'https://example.com/source' }).expect(409);
    await request(app).get(`/api/paypal/return?jobId=${id}&token=WRONG`).expect(400);
  });
  test('confirmed matching authorization records hold once and permits delivery', async () => {
    const { id } = await setup();
    const authorize = jest.spyOn(paypal, 'authorizeApprovedOrder').mockResolvedValue({ mode: 'sandbox', orderId: 'ORDER123', authorizationId: 'AUTH123', status: 'CREATED' });
    await request(app).get(`/api/paypal/return?jobId=${id}&token=ORDER123`).expect(302);
    await request(app).get(`/api/paypal/return?jobId=${id}&token=ORDER123`).expect(302);
    expect(authorize).toHaveBeenCalledTimes(1);
    const job = await request(app).get(`/api/jobs/${id}`).expect(200);
    expect(job.body.job.status).toBe('HELD');
    expect(job.body.job.heldCents).toBe(100);
    expect((await request(app).get('/api/ledger')).body.ledger).toHaveLength(1);
    await request(app).post(`/api/jobs/${id}/deliver`).send({ delivery: 'https://example.com/source' }).expect(200);
  });
  test('failed authorization does not display success or create hold', async () => {
    const { id } = await setup();
    jest.spyOn(paypal, 'authorizeApprovedOrder').mockRejectedValue(new Error('PayPal error'));
    await request(app).get(`/api/paypal/return?jobId=${id}&token=ORDER123`).expect(502);
    expect(db.getJob(id).status).toBe('AWAITING_PAYPAL_APPROVAL');
    expect(db.getJob(id).heldCents).toBe(0);
  });
});
