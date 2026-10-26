// Mock-only panel test: no extension privileges and no network calls to Gemini.
const mockStorage = {}, mockMessages = []; let audits = 0, mockIncomplete = false;
const mockArea = { get(key, cb) { const r = typeof key === 'string' ? { [key]: mockStorage[key] } : { ...key, ...mockStorage }; cb?.(r); return Promise.resolve(r); }, set(value) { Object.assign(mockStorage, value); return Promise.resolve(); }, remove(key) { delete mockStorage[key]; return Promise.resolve(); } };
const mockFinding = { id: 'test-finding', category: 'UX', severity: 'Low', type: 'weak_cta', title: 'Vague link', description: 'The destination is unclear.', fix: 'Name the team.', evidence: 'More', suggestedText: 'Meet our team', hasElement: true, markerNumber: 1, canPreview: true };
window.confirm = () => true;
window.chrome = { storage: { local: mockArea, session: mockArea }, permissions: { request: async () => true },
  tabs: { query: async () => [{ id: 7, windowId: 1, url: 'https://example.com/' }], sendMessage(id, message, cb) { mockMessages.push({ id, ...message }); cb(message.action === 'scan' ? { success: true, findings: [mockFinding], pageBrief: { url: 'https://example.com/' }, documentId: 'doc' } : { success: true, documentId: 'doc', findings: [] }); } },
  runtime: { onMessage: { addListener() {} }, sendMessage(message, cb) {
    mockMessages.push(message);
    if (mockIncomplete) { cb({ review: null, aiStatus: 'unavailable', aiMessage: 'Incomplete review: test outage', reviewComplete: false, aiFindings: [], linkFindings: [] }); return; }
    const grade = audits++ === 0 ? 2 : 3;
    const criteria = InspectorGrading.CRITERIA.map(c => ({ ...c, status: 'assessed', grade, reason: 'Test evidence', evidence: 'More', targetIds: ['a-1'] }));
    const review = { rubricVersion: InspectorGrading.VERSION, criteria, ...InspectorGrading.calculate(criteria), verdict: 'The test offer is understandable.', priorities: ['Clarify the link destination.'], provenance: { source: 'fresh', model: 'mock-only', completedAt: new Date().toISOString(), screenshotIncluded: true } };
    cb({ review, aiStatus: 'available', aiMessage: 'Fresh Gemini review (MOCK TEST ONLY)', reviewComplete: true, aiFindings: [], linkFindings: [] });
  } } };
document.addEventListener('DOMContentLoaded', () => {
  const button = document.createElement('button'); button.textContent = 'Run panel tests'; button.id = 'run-panel-tests';
  const output = document.createElement('pre'); output.id = 'panel-test-results'; output.style.whiteSpace = 'pre-wrap';
  document.body.prepend(button, output);
  button.onclick = async () => {
    const results = [], check = (ok, name) => { if(!ok) throw Error(name); results.push('PASS ' + name); };
    const wait = async condition => { const start = Date.now(); while(!condition()) { if(Date.now()-start > 4000) throw Error('UI did not reach expected state'); await new Promise(r=>setTimeout(r,50)); } };
    try {
      document.getElementById('initial-scan-btn').click();
      await wait(()=>document.getElementById('score-value').textContent === '50');
      check(document.getElementById('grading-reasons').children.length === 15, 'All 15 grading reasons rendered');
      document.querySelector('.finding-btn-preview').click(); await wait(()=>document.querySelector('.finding-card.previewed'));
      document.querySelector('.finding-btn-accept').click(); await wait(()=>document.querySelector('.finding-card.accepted'));
      check(document.getElementById('before-score').textContent === '50/100', 'Accept preserves Before score');
      check(document.getElementById('after-score').textContent === 'Not assessed', 'Accept awards no artificial After score');
      document.getElementById('recheck-btn').click(); await wait(()=>document.getElementById('after-score').textContent === '75/100');
      check(mockMessages.some(m=>m.action==='auditPage' && m.acceptedIds?.[0]==='test-finding'), 'Recheck sends only accepted change IDs');
      check(document.getElementById('report-content').textContent.includes('75/100'), 'Report agrees with reassessed score');
      document.querySelector('.finding-btn-undo').click(); await wait(()=>document.getElementById('after-score').textContent === 'Outdated');
      check(document.getElementById('before-score').textContent === '50/100', 'Undo preserves immutable Before score');
      document.querySelector('.finding-btn-preview').click(); await wait(()=>document.querySelector('.finding-card.previewed'));
      document.querySelector('.finding-btn-reject').click(); await wait(()=>document.querySelector('.finding-card.rejected'));
      check(mockMessages.filter(m=>m.action==='undoPreview').every(m=>m.id===7 && m.documentId==='doc'), 'Undo and Reject stay bound to audited document');
      check(mockStorage.inspectorPanelSession.review.score===50, 'Saved session preserves original grade');
      mockIncomplete = true;
      document.getElementById('rescan-btn').click(); await wait(()=>document.getElementById('score-value').textContent === '--');
      check(document.getElementById('rating-text').textContent === 'Review incomplete', 'AI outage shows no numerical website score');
      check(!document.getElementById('report-content').textContent.includes('100/100'), 'Incomplete report never defaults to 100');
      output.textContent = results.join('\n')+'\nALL PASSED ('+results.length+')';
    } catch(e) { output.textContent = results.join('\n')+'\nFAIL '+e.message; }
  };
});
