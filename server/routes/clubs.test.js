import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Tiny thenable query builder, same shape as clubJoinRequests.test.js: every method
// records what it was asked for and returns itself, and awaiting it hands back whatever
// `results` says that table should return.
const calls = [];
let results = {};

function makeBuilder(table) {
  const state = { table, op: 'select', filters: [] };

  const resolve = () => {
    calls.push({ ...state, filters: [...state.filters] });
    const key = `${state.table}.${state.op}`;
    const value = results[key];
    const resolved = typeof value === 'function' ? value(state) : value;
    return Promise.resolve(resolved ?? { data: null, error: null });
  };

  const builder = {
    select: () => { state.op = 'select'; return builder; },
    eq: (k, v) => { state.filters.push([k, v]); return builder; },
    in: (k, v) => { state.filters.push([k, v]); return builder; },
    single: resolve,
    maybeSingle: resolve,
    then: (onOk, onErr) => resolve().then(onOk, onErr),
  };
  return builder;
}

vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: { from: (table) => makeBuilder(table) },
}));

const { default: clubsRouter } = await import('./clubs.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/clubs', clubsRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

beforeEach(() => {
  calls.length = 0;
  results = {};
});

describe('GET /api/clubs', () => {
  it('merges category_id/subcategory_ids onto a club with a matching club_interests row', async () => {
    results['demo_club_data.select'] = {
      data: [{ id: 'club-1', club_name: 'Robotics Club' }],
      error: null,
    };
    results['club_interests.select'] = {
      data: [{ club_id: 'club-1', category_id: 'cat-1', subcategory_ids: ['sub-1'] }],
      error: null,
    };

    const res = await request(makeApp()).get('/api/clubs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'club-1', club_name: 'Robotics Club', category_id: 'cat-1', subcategory_ids: ['sub-1'] },
    ]);
  });

  it('fills in null category_id and an empty subcategory_ids when no club_interests row exists', async () => {
    results['demo_club_data.select'] = {
      data: [{ id: 'club-2', club_name: 'Chess Club' }],
      error: null,
    };
    results['club_interests.select'] = { data: [], error: null };

    const res = await request(makeApp()).get('/api/clubs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'club-2', club_name: 'Chess Club', category_id: null, subcategory_ids: [] },
    ]);
  });

  it('returns an empty list when there are no clubs', async () => {
    results['demo_club_data.select'] = { data: [], error: null };
    results['club_interests.select'] = { data: [], error: null };

    const res = await request(makeApp()).get('/api/clubs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('queries club_interests unfiltered rather than by id list, so a large club list never overflows a filter URL', async () => {
    results['demo_club_data.select'] = { data: [{ id: 'club-1', club_name: 'Robotics Club' }], error: null };
    results['club_interests.select'] = { data: [], error: null };

    await request(makeApp()).get('/api/clubs');

    const interestsCall = calls.find((c) => c.table === 'club_interests');
    expect(interestsCall.filters).toEqual([]);
  });
});
