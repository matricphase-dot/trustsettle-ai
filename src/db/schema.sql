-- TrustSettle AI v2.0 — Production PostgreSQL Schema
-- Double-entry escrow accounting, RBAC users, merchant API keys, idempotency, and hash-chained audit logs.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('CLIENT', 'FREELANCER', 'AGENT', 'ARBITRATOR', 'MERCHANT_ADMIN')),
  paypal_email VARCHAR(255),
  trust_score INTEGER NOT NULL DEFAULT 85,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(64) PRIMARY KEY,
  merchant_name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL,
  key_hash VARCHAR(128) UNIQUE NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['jobs:read', 'jobs:write', 'escrow:execute'],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(64) NOT NULL,
  specialty VARCHAR(255) NOT NULL,
  rate_cents INTEGER NOT NULL CHECK (rate_cents > 0),
  trust_score INTEGER NOT NULL DEFAULT 95,
  jobs_done INTEGER NOT NULL DEFAULT 0,
  payout_email VARCHAR(255) NOT NULL,
  mcp_endpoint VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  brief TEXT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  budget_cents INTEGER NOT NULL CHECK (budget_cents >= 100),
  held_cents INTEGER NOT NULL DEFAULT 0,
  released_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  mode VARCHAR(16) NOT NULL DEFAULT 'HUMAN' CHECK (mode IN ('HUMAN', 'AGENT')),
  agent_id VARCHAR(64) REFERENCES agents(id),
  client_id VARCHAR(64),
  client_email VARCHAR(255) NOT NULL,
  freelancer_id VARCHAR(64),
  freelancer_email VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN (
    'DRAFT', 'ORDER_CREATED', 'HELD', 'DELIVERED', 'REVISE',
    'PENDING_APPROVAL', 'SETTLEMENT_PROPOSED', 'ESCALATED',
    'RELEASED', 'SETTLED', 'REFUNDED', 'VOIDED'
  )),
  order_id VARCHAR(128),
  authorization_id VARCHAR(128),
  capture_id VARCHAR(128),
  payout_id VARCHAR(128),
  refund_id VARCHAR(128),
  approve_url TEXT,
  delivery TEXT,
  verification JSONB,
  client_decision JSONB,
  settlement JSONB,
  audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  deadline_at TIMESTAMPTZ NOT NULL,
  sla_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_client_email ON jobs(client_email);
CREATE INDEX IF NOT EXISTS idx_jobs_order_id ON jobs(order_id);

CREATE TABLE IF NOT EXISTS escrow_ledger (
  id VARCHAR(64) PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL REFERENCES jobs(id),
  job_title VARCHAR(255) NOT NULL,
  entry_type VARCHAR(32) NOT NULL CHECK (entry_type IN ('DEBIT_HOLD', 'CREDIT_CAPTURE', 'DEBIT_PAYOUT', 'CREDIT_REFUND', 'VOID_HOLD')),
  event VARCHAR(128) NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  status VARCHAR(32) NOT NULL,
  paypal_id VARCHAR(128) NOT NULL,
  mode VARCHAR(16) NOT NULL,
  actor VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_job_id ON escrow_ledger(job_id);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idem_key VARCHAR(128) PRIMARY KEY,
  method VARCHAR(16) NOT NULL,
  path VARCHAR(255) NOT NULL,
  status_code INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR(128) PRIMARY KEY,
  event_type VARCHAR(128) NOT NULL,
  paypal_resource_id VARCHAR(128),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  mode VARCHAR(16) NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
