// PostgreSQL schema migration runner
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  if (!config.db.isPostgres) {
    console.log('[db:migrate] DATABASE_URL not set — atomic JSON store auto-initializes schema. Ready.');
    return;
  }
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: config.db.url });
  try {
    await pool.query(sql);
    console.log('[db:migrate] PostgreSQL schema applied successfully.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrate().catch(err => {
    console.error('[db:migrate] Failed:', err.message);
    process.exit(1);
  });
}

module.exports = migrate;
