// Production HTTP Server Entrypoint (binds 0.0.0.0 with graceful SIGTERM shutdown)
const config = require('./config');
const logger = require('./utils/logger');
const createApp = require('./app');
const { startTimelockWorker } = require('./services/timelock');

const app = createApp();
const timelockTimer = startTimelockWorker(15000);

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info({
    port: config.port,
    paypalMode: config.paypal.isLive ? `${config.paypal.env}-live` : 'demo',
    aiMode: config.ai.hasGroq ? config.ai.groqModel : config.ai.hasXai ? config.ai.xaiModel : config.ai.hasGemini ? 'gemini-2.0-flash' : 'deterministic-rubric',
    dbMode: config.db.isPostgres ? 'postgresql' : 'atomic-json',
  }, 'TrustSettle AI v2.0 Enterprise Server listening');

  console.log(`\n==================================================================`);
  console.log(`  TrustSettle AI v2.0 (PayPal Enterprise Ready) — Port ${config.port}`);
  console.log(`  UI Command Center : http://0.0.0.0:${config.port}`);
  console.log(`  OpenAPI / Swagger : http://0.0.0.0:${config.port}/api/docs`);
  console.log(`  MCP Agent Tools   : http://0.0.0.0:${config.port}/api/mcp/tools`);
  console.log(`  PayPal Mode       : ${config.paypal.isLive ? 'SANDBOX/LIVE API' : 'SIMULATED SANDBOX (set PAYPAL_CLIENT_ID for live)'}`);
  console.log(`  AI Engine         : ${config.ai.hasGroq ? 'GROQ + GUARDRAILS' : config.ai.hasXai ? 'GROK + GUARDRAILS' : config.ai.hasGemini ? 'GEMINI 2.0 FLASH + GUARDRAILS' : 'DETERMINISTIC RUBRIC + GUARDRAILS'}`);
  console.log(`==================================================================\n`);
});

function shutdown(sig) {
  logger.info({ sig }, 'Graceful shutdown initiated');
  clearInterval(timelockTimer);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
