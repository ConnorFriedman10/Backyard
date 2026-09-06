// One-off script: sets join_policy = 'request' on every club that currently has 'open'.
// Run from the repo root: node scripts/set-all-join-policy-request.js

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const { data, error } = await supabase
  .from('demo_club_data')
  .update({ join_policy: 'request' })
  .eq('join_policy', 'open')
  .select('id, club_name');

if (error) {
  console.error('Update failed:', error.message);
  process.exit(1);
}

console.log(`Updated ${data.length} club(s) to join_policy = 'request':`);
data.forEach((c) => console.log(`  ${c.id}  ${c.club_name}`));
