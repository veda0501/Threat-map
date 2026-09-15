const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = require.resolve('../supabase-db');

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_KEY;
delete require.cache[modulePath];

test('supabase module falls back to in-memory storage without env vars', async () => {
  const db = require('../supabase-db');
  await db.init();

  const inserted = await db.insertOne({
    threatId: 'LOCAL-TEST-1',
    title: 'Local fallback test',
    description: 'This should work without Supabase config.',
    eventTime: new Date().toISOString(),
    category: 'cyber',
    severity: 'high',
    status: 'emerging'
  });

  assert.equal(inserted.insertedId, 'LOCAL-TEST-1');
  const threat = await db.findOne({ threatId: 'LOCAL-TEST-1' });
  assert.ok(threat);
  assert.equal(threat.title, 'Local fallback test');
});
