const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '..');
function compile(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => imports[name] ?? require(name), Date, setInterval, clearInterval, AbortController });
  return exports;
}
const { artistRecency } = compile('lib/artist-recency.ts');
const now = Date.parse('2026-11-15T00:00:00Z');
const yesterday = '2026-11-14', five = '2021-11-15', twenty = '2006-11-15';
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);

test('no gigs and future/invalid dates retain default appearance', () => {
  for (const dates of [[], ['2027-01-01'], ['bad', '2026-02-30']]) {
    const result = artistRecency(dates, now);
    assert.equal(result.brightness, null);
    assert.equal(result.latestDate, null);
    assert.equal(result.attendedCount, 0);
  }
});
test('yesterday, five years and twenty years follow the requested curve', () => {
  approx(artistRecency([yesterday], now).brightness, 1);
  approx(artistRecency([five], now).brightness, 0.25 + 0.75 * Math.exp(-5 / 8));
  approx(artistRecency([twenty], now).brightness, 0.25 + 0.75 * Math.exp(-20 / 8));
  assert.equal(artistRecency([yesterday], now).description, 'Recently Seen');
  assert.equal(artistRecency([five], now).description, 'Seen in Recent Years');
  assert.equal(artistRecency([twenty], now).description, 'Long Ago');
});
test('mixed recency, many gigs, bounds, and future-date exclusion', () => {
  const old = artistRecency([twenty], now).brightness;
  const recent = artistRecency([yesterday], now).brightness;
  const mixed = artistRecency([twenty, yesterday], now);
  approx(mixed.brightness, (old + recent) / 2);
  assert.equal(mixed.latestDate, yesterday);
  assert.equal(mixed.attendedCount, 2);
  const dates = Array.from({ length: 15 }, (_, i) => `${2011 + i}-11-15`);
  const many = artistRecency(dates, now);
  assert.equal(many.attendedCount, 15);
  assert.ok(many.brightness >= 0.25 && many.brightness <= 1);
  assert.equal(artistRecency([twenty, '2027-01-01'], now).brightness, old);
  assert.ok(artistRecency(['1900-01-01'], now).brightness >= 0.25);
});

function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  const found = predicate(tree) ? [tree] : [];
  React.Children.forEach(tree.props?.children, child => found.push(...nodes(child, predicate)));
  return found;
}
function harness() {
  const artist = { id: 'artist-a', name: 'Artist A', type: 'Group', tags: ['indie'] };
  const gig = (id, user_id, date) => ({ id, user_id, artist_id: artist.id, artist_name: artist.name, event_date: date, venue: 'Venue', city: 'Brighton', tour: '', source: 'manual', source_id: '', source_url: '' });
  const state = [];
  Object.assign(state, { 0: { id: 'user-a' }, 1: true, 9: [artist], 10: artist, 16: [gig(1, 'user-a', twenty)], 17: artist.id, 18: 'Venue', 20: yesterday, 28: now });
  let index = 0, inserted, table, queryUser;
  const databaseRows = [gig(1, 'user-a', twenty), gig(3, 'user-b', yesterday)];
  const queries = [];
  const effects = [];
  const hooks = {
    useState(initial) { const n = index++; if (!(n in state)) state[n] = typeof initial === 'function' ? initial() : initial; return [state[n], value => state[n] = typeof value === 'function' ? value(state[n]) : value]; },
    useMemo: fn => fn(), useEffect: fn => effects.push(fn),
  };
  const db = {
    insert(row) { inserted = { ...row, id: 2 }; return this; }, select() { return this; }, single: async () => ({ data: inserted, error: null }),
    delete() { return this; }, eq(key, value) { if (key === 'user_id') queryUser = value; return this; },
    async order() { queries.push({ table, user: queryUser }); return { error: null, data: table === 'user_artists' ? [{ artist_id: artist.id, name: artist.name, tags: artist.tags }] : databaseRows.filter(g => g.user_id === queryUser) }; }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
  };
  const { default: Home } = compile('app/page.tsx', { react: hooks, '../lib/artist-recency': { artistRecency }, '../lib/supabase': { supabase: { from: name => { table = name; return db; } } } });
  const render = () => { index = 0; effects.length = 0; const tree = Home(); renderToStaticMarkup(tree); return tree; };
  const body = tree => nodes(nodes(tree, n => n.type === 'g' && n.props.className === 'node')[0], n => n.type === 'circle')[1];
  return { state, render, body, gig, effects, queries };
}
test('rendered planets preserve base appearance, size, colour and readable labels', () => {
  const h = harness(); h.state[16] = [];
  let tree = h.render(), body = h.body(tree);
  assert.equal(body.props.style, undefined); assert.equal(body.props.r, 18); assert.equal(body.props.fill, '#a78bfa');
  const label = nodes(tree, n => n.type === 'text' && n.props.children === 'Artist A')[0];
  assert.equal(label.props.style, undefined);
  h.state[16] = [h.gig(1, 'user-a', yesterday)];
  body = h.body(h.render()); assert.equal(body.props.r, 18); assert.match(body.props.style.filter, /brightness\(0\.99/);
});
test('manual save, setlist save and delete update brightness and profile immediately', async () => {
  const h = harness(); let tree = h.render(); const before = h.body(tree).props.style.filter;
  await nodes(tree, n => n.type === 'button' && n.props.children === 'Save manual gig')[0].props.onClick();
  tree = h.render(); assert.notEqual(h.body(tree).props.style.filter, before);
  assert.equal(h.body(tree).props.r, 21.599999999999998);
  assert.match(renderToStaticMarkup(tree), /2 gigs attended/);
  assert.match(renderToStaticMarkup(tree), /14 Nov 2026/);
  await nodes(tree, n => n.type === 'button' && n.props['aria-label'] === 'Remove Artist A gig')[0].props.onClick();
  tree = h.render(); assert.equal(h.body(tree).props.style.filter, before);
  h.state[23] = [{ source: 'setlist.fm', sourceId: 'new', sourceUrl: '', artistId: 'artist-a', artistName: 'Artist A', venue: 'Venue', city: 'Brighton', country: 'UK', date: yesterday, tour: '' }];
  await nodes(h.render(), n => n.type === 'button' && n.props.children === 'Add gig')[0].props.onClick();
  assert.notEqual(h.body(h.render()).props.style.filter, before);
});
test('different authenticated users receive only their own recency and profile dates', () => {
  const h = harness(); h.state[16].push(h.gig(3, 'user-b', yesterday));
  let tree = h.render(); assert.match(renderToStaticMarkup(tree), /Long Ago/);
  const oldStyle = h.body(tree).props.style.filter;
  h.state[0] = { id: 'user-b' }; tree = h.render();
  assert.notEqual(h.body(tree).props.style.filter, oldStyle);
  assert.match(renderToStaticMarkup(tree), /Recently Seen/);
  assert.match(renderToStaticMarkup(tree), /1 gig attended/);
  h.state[0] = { id: 'user-c' }; tree = h.render(); assert.equal(h.body(tree).props.style, undefined);
});

test('first load and account switch request user-scoped gig history', async () => {
  const h = harness(); h.render();
  const load = () => h.effects.find(effect => effect.toString().includes('user_artists'));
  const cleanup = load()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state[16][0].user_id, 'user-a');
  assert.match(renderToStaticMarkup(h.render()), /Long Ago/);
  cleanup(); h.state[0] = { id: 'user-b' }; h.render(); load()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state[16].length, 1);
  assert.equal(h.state[16][0].user_id, 'user-b');
  assert.match(renderToStaticMarkup(h.render()), /Recently Seen/);
  assert.deepEqual(h.queries.filter(q => q.table === 'user_gigs').map(q => q.user), ['user-a', 'user-b']);
});
