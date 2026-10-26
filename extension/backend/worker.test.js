import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('desktop review is the default while the phone check remains opt-in', () => {
  const panel = source('sidepanel.html'), script = source('sidepanel.js');
  assert.match(panel, /id="mobile-audit-toggle" type="checkbox"\s*>/);
  assert.match(panel, /Desktop is always reviewed/);
  assert.match(script, /mobileAuditEnabled: false/);
  assert.match(script, /mobileEnabled: mobileAuditToggle\.checked/);
});
function harness(options = {}) {
  const storage = {}, events = [], tab = { id: 7, windowId: 1, active: true, url: 'https://example.com/', status: 'complete' }, mobileTab = { id: 8, windowId: 2, active: true, url: 'https://example.com/', status: 'complete' };
  let listener, apiCalls = 0;
  const area = { get(key, cb) { const result = typeof key === 'string' ? { [key]: storage[key] } : storage; if(cb) cb(result); return Promise.resolve(result); }, set(values, cb) { Object.assign(storage, values); if(cb) cb(); return Promise.resolve(); }, remove: async key => { delete storage[key]; } };
  const context = vm.createContext({ console, URL, TextEncoder, crypto: webcrypto, AbortSignal,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 10)), clearTimeout,
    chrome: { sidePanel: { setPanelBehavior: async () => {} }, permissions: { contains: async () => options.permission !== false },
      runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } }, sendMessage(message, cb) { events.push(message); if (options.cancel && message.completed === 1) listener({ action: 'cancelBatch' }, {}, () => {}); cb?.(); } },
      storage: { session: area, local: area }, windows: { create: async data => { if(data.type === 'popup') { mobileTab.url = data.url; events.push({ popup: true }); return { id: 2, tabs: [{ id: 8 }] }; } return { id: 1, tabs: [{ id: 7 }] }; }, update: async () => ({}) },
      scripting: { executeScript: async () => {} },
      tabs: { get: async id => ({ ...(id === 8 ? mobileTab : tab) }), update: async (id, data) => { Object.assign(id === 8 ? mobileTab : tab, data); return id === 8 ? mobileTab : tab; }, remove: async id => events.push({ removed: id }),
        onUpdated: { addListener() {}, removeListener() {} }, captureVisibleTab: async () => { if(options.captureFail) throw Error('No permission'); if(options.switchTab) tab.active = false; return 'data:image/jpeg;base64,AAAA'; },
        sendMessage(id, m, cb) {
          const selected = id === 8 ? mobileTab : tab;
          if(m.action === 'collect' || m.action === 'scan') cb({ success: true, documentId: 'doc', findings: [], pageBrief: { url: selected.url, title: 'Service', visibleText: 'Request an estimate', viewport: { width: id === 8 ? (options.widePhone ? 500 : 390) : 1200, height: 800 }, coverage: { truncated: false, imageCount: 0, controlCount: 1 }, facts: {}, links: [], elements: [{ id: 'a-1', text: 'Request an estimate', rect: { x: 0, y: 0, width: 100, height: 30 } }] } });
          else { events.push(m); cb({ success: true, documentId: 'doc', url: selected.url }); }
        } }
    },
    fetch: async url => {
      if(options.offline) throw Error('Offline');
      if(url.endsWith('/health')) return { json: async () => ({ model: 'test-model', helperVersion: '3.1.0', rubricVersion: options.oldHelper ? 'old' : 'rubric-2' }) };
      apiCalls++;
      if(url.endsWith('/audit-paired')) {
        const make = view => ({ rubricVersion: 'rubric-2', verdict: view + ' observed', priorities: [], findings: [], criteria: [...context.InspectorGrading.CRITERIA, ...(view === 'mobile' ? context.InspectorGrading.MOBILE_CRITERIA : [])].map(c => ({ id: c.id, status: 'assessed', grade: 2, reason: 'Observed', evidenceKind: ['hierarchy','readability'].includes(c.id) || c.id.startsWith('mobile_') ? 'visual' : 'text', evidence: ['hierarchy','readability'].includes(c.id) || c.id.startsWith('mobile_') ? 'screenshot shows the link' : 'Request an estimate', targetIds: ['a-1'] })) });
        return { ok: true, json: async () => ({ rubricVersion: 'rubric-2', desktopReview: { ...make('desktop'), provenance: { model: 'test-model' } }, mobileReview: { ...make('mobile'), provenance: { model: 'test-model' } }, combinedVerdict: 'Both views need work.', priorities: [], provenance: { model: 'test-model' } }) };
      }
      if(options.quota) return { ok: false, json: async () => ({ error: 'Gemini returned 429: quota' }) };
      return { ok: true, json: async () => ({ rubricVersion: 'rubric-2', verdict: 'Specific offer, visible next step.', priorities: [], findings: [],
        criteria: options.malformed ? [] : context.InspectorGrading.CRITERIA.map(c => ({ id: c.id, status: 'assessed', grade: 2, reason: 'Observed', evidenceKind: ['hierarchy','readability'].includes(c.id) ? 'visual' : 'text', evidence: ['hierarchy','readability'].includes(c.id) ? 'screenshot shows the link' : 'Request an estimate', targetIds: ['a-1'] })),
        provenance: { source: 'fresh', model: 'test-model', screenshotIncluded: !options.captureFail, completedAt: '2026-09-23' } }) };
    }
  });
  context.importScripts = name => vm.runInContext(source(name), context);
  vm.runInContext(source('background.js'), context);
  return { context, events, storage, calls: () => apiCalls, send: message => new Promise(resolve => listener(message, {}, resolve)) };
}
test('worker reuses identical validated reviews; explicit fresh review bypasses cache', async () => {
  const h = harness(), request = { action: 'auditPage', tabId: 7, documentId: 'doc' };
  const a = await h.send(request), b = await h.send(request);
  assert.equal(a.review.score, 50); assert.equal(b.review.provenance.source, 'cached'); assert.equal(h.calls(), 1);
  await h.send({ ...request, forceFresh: true }); assert.equal(h.calls(), 2);
  assert(!JSON.stringify(h.storage).includes('data:image'));
});
for (const option of ['captureFail', 'offline', 'malformed', 'oldHelper', 'quota', 'switchTab']) test('worker honestly handles ' + option, async () => {
  const h = harness({ [option]: true });
  const result = await h.send({ action: 'auditPage', tabId: 7, documentId: 'doc' });
  assert.equal(result.reviewComplete, false); assert.equal(result.review?.score ?? null, null);
  assert(h.events.some(e => e.action === 'finishCapture'));
  if (option === 'captureFail') {
    assert.equal(h.calls(), 0, 'do not spend a Gemini request without required visual evidence');
    assert.match(result.aiMessage, /No permission/);
    assert.match(result.aiMessage, /The AI model was not called/);
  }
});
test('five-site batch retains complete grades and per-site evidence, and closes only owned tab', async () => {
  const h = harness(); const result = await h.send({ action: 'runBatchAudit', mobileEnabled: false, urls: [1,2,3,4,5].map(i => 'https://example.com/' + i) });
  assert.equal(result.results.length, 5); assert(result.results.every(r => r.score === 50 && r.review.provenance.screenshotIncluded));
  assert.equal(h.calls(), 5); assert.equal(h.events.filter(e => e.removed).length, 1); assert.equal(h.events.find(e => e.removed).removed, 7);
  assert.equal(h.storage.batchAuditResults.running, false);
});
test('batch permission denial is explicit; cancellation keeps completed results', async () => {
  const urls = [1,2,3,4,5].map(i => 'https://example.com/' + i);
  const blocked = await harness({ permission: false }).send({ action: 'runBatchAudit', mobileEnabled: false, urls }); assert.equal(blocked.success, false);
  const h = harness({ cancel: true }), stopped = await h.send({ action: 'runBatchAudit', mobileEnabled: false, urls });
  assert.equal(stopped.results[0].score, 50); assert.equal(stopped.results[1].score, null); assert.equal(h.calls(), 1);
});

test('single-page review requests capture permission before querying the tab and stops on denial', async () => {
  const panel = source('sidepanel.js');
  const scan = panel.slice(panel.indexOf('  async function triggerScan('), panel.indexOf('  async function ensureContentScriptInjected('));
  for (const allowed of [false, true]) {
    const events = [];
    const context = vm.createContext({ assessmentBusy: false, console,
      chrome: { permissions: { request: options => { events.push('permission'); assert.deepEqual(Array.from(options.origins), ['<all_urls>']); return Promise.resolve(allowed); } },
        tabs: { query: async () => { events.push('query'); return []; } } },
      confirm: () => { events.push('consent'); return true; },
      showError: message => events.push(message), showState() {}, renderComparison() {}, scanErrorMessage: e => e.message
    });
    vm.runInContext(scan, context);
    const pending = context.triggerScan(true);
    assert.equal(events[0], 'permission', 'permission must start within the click user gesture');
    await pending;
    assert.equal(events.includes('query'), allowed);
    assert.equal(events.includes('consent'), allowed);
    assert.equal(context.assessmentBusy, false);
  }
});

test('paired worker returns two validated scores and closes only its phone tab on request', async () => {
  const h = harness();
  const result = await h.send({ action: 'auditPage', mobileEnabled: true, keepMobileWindow: true, tabId: 7, documentId: 'doc', forceFresh: true });
  assert.equal(result.review.score, 50);
  assert.equal(result.mobileReview.score, 50);
  assert.equal(result.mobileTabId, 8);
  assert.equal(h.calls(), 1);
  assert.equal(h.events.filter(e => e.removed).length, 0);
  await h.send({ action: 'closeMobileView', desktopTabId: 7 });
  assert.equal(h.events.find(e => e.removed)?.removed, 8);
});

test('too-wide phone viewport is incomplete and never passed off as a mobile score', async () => {
  const h = harness({ widePhone: true });
  const result = await h.send({ action: 'auditPage', mobileEnabled: true, keepMobileWindow: false, tabId: 7, documentId: 'doc' });
  assert.equal(result.mobileReview, null);
  assert.match(result.mobileStatus, /500 CSS pixels/);
  assert.equal(h.events.find(e => e.removed)?.removed, 8);
});

test('five-site paired batch audits both views for every site and closes owned tabs', async () => {
  const h = harness();
  const result = await h.send({ action: 'runBatchAudit', mobileEnabled: true, urls: [1,2,3,4,5].map(i => 'https://example.com/' + i) });
  assert.equal(result.results.length, 5);
  assert(result.results.every(r => r.status === 'complete' && r.score === 50 && r.mobileReview.score === 50));
  assert.equal(h.calls(), 5);
  assert.equal(h.events.filter(e => e.removed === 8).length, 5);
  assert.equal(h.events.filter(e => e.removed === 7).length, 1);
});
