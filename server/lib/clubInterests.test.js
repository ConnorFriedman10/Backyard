import { describe, it, expect } from 'vitest';
import { attachClubInterests } from './clubInterests.js';

function makeSupabaseAdmin(interestsRows) {
  return {
    from: () => ({
      select: () => Promise.resolve({ data: interestsRows, error: null }),
    }),
  };
}

describe('attachClubInterests', () => {
  it('merges category_id/subcategory_ids onto clubs with a matching row', async () => {
    const supabaseAdmin = makeSupabaseAdmin([
      { club_id: 'club-1', category_id: 'cat-1', subcategory_ids: ['sub-1'] },
    ]);

    const result = await attachClubInterests(supabaseAdmin, [{ id: 'club-1', club_name: 'Robotics Club' }]);

    expect(result).toEqual([
      { id: 'club-1', club_name: 'Robotics Club', category_id: 'cat-1', subcategory_ids: ['sub-1'] },
    ]);
  });

  it('fills in null/empty when no matching club_interests row exists', async () => {
    const supabaseAdmin = makeSupabaseAdmin([]);

    const result = await attachClubInterests(supabaseAdmin, [{ id: 'club-2', club_name: 'Chess Club' }]);

    expect(result).toEqual([
      { id: 'club-2', club_name: 'Chess Club', category_id: null, subcategory_ids: [] },
    ]);
  });

  it('throws a 502 when the club_interests query errors', async () => {
    const supabaseAdmin = {
      from: () => ({
        select: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      }),
    };

    await expect(attachClubInterests(supabaseAdmin, [])).rejects.toMatchObject({ status: 502, message: 'boom' });
  });
});
