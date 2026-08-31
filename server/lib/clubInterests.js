// Shared by every route that hands back a club list the grid renders (GET /api/clubs
// and both paths of GET /api/search) — club_interests is a separate table from
// demo_club_data, so whichever query built the list still needs this merged in for the
// card's category/subcategory tagline to show up regardless of which route answered.
export async function attachClubInterests(supabaseAdmin, clubs) {
  const { data: interests, error } = await supabaseAdmin
    .from('club_interests')
    .select('club_id, category_id, subcategory_ids');

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  const interestsByClubId = new Map((interests || []).map((row) => [row.club_id, row]));

  return clubs.map((club) => {
    const row = interestsByClubId.get(club.id);
    return {
      ...club,
      category_id: row?.category_id ?? null,
      subcategory_ids: row?.subcategory_ids ?? [],
    };
  });
}
