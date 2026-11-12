// Seed sample users, agents, and demo merchant API key
const db = require('./index');

function seed() {
  const users = db.listUsers();
  const agents = db.listAgents();
  console.log(`[db:seed] Ready: ${users.length} users, ${agents.length} AI agents, default sandbox API key provisioned.`);
}

if (require.main === module) seed();
module.exports = seed;
