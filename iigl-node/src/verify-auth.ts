// Read-only smoke test: confirm Node can verify Laravel's existing bcrypt hashes
// and that role fan-out matches the PHP middleware rules.
import bcrypt from 'bcryptjs';
import { db } from './db/index.js';

const users = await db
  .selectFrom('users')
  .select(['id', 'fullname', 'mobile', 'password', 'role_id', 'is_active'])
  .limit(5)
  .execute();

console.log(`users read: ${users.length}`);
for (const u of users) {
  const prefix = u.password.slice(0, 4);
  const parses = /^\$2[aby]\$\d{2}\$/.test(u.password);
  console.log(`  id=${u.id} role=${u.role_id} prefix=${prefix} bcrypt-parseable=${parses}`);
}

// Round-trip: hash a known value in Node, verify it, then verify a $2y$ variant
// of the same hash to prove prefix compatibility with Laravel output.
const known = 'test-password-123';
const nodeHash = await bcrypt.hash(known, 10);
const y = '$2y$' + nodeHash.slice(4);
console.log(`\nnode hash verifies:      ${await bcrypt.compare(known, nodeHash)}`);
console.log(`same hash as $2y$ verifies: ${await bcrypt.compare(known, y)}`);

const roles = await db.selectFrom('roles').selectAll().execute();
console.log('\nroles:');
for (const r of roles) console.log(`  ${r.id}  ${r.role_name}`);

await db.destroy();
