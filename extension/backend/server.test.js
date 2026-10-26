import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, buildDualPrompt, validateFindings, validateReview, createServer, requestGemini, requestGeminiDual, requestOpenAI } from "./server.js";
import "../reporting.js";
const G = globalThis.InspectorGrading, R = globalThis.InspectorReporting;
const brief = { url: "https://example.com/", title: "Excavation services", visibleText: "Request an estimate",
  elements: [{ id: "a-1", kind: "a", text: "Request an estimate", rect: { x: 0, y: 0, width: 100, height: 30 } }],
  viewport: { width: 1200, height: 800 }, coverage: { truncated: false, imageCount: 0, controlCount: 1 }, facts: { title: "Excavation services" } };
function raw(grade = 2) {
  return { criteria: G.CRITERIA.map(c => ({ id: c.id, status: "assessed", grade, reason: "Specific observable explanation.", evidenceKind: ["hierarchy", "readability"].includes(c.id) ? "visual" : "text",
    evidence: ["hierarchy", "readability"].includes(c.id) ? "The screenshot shows the estimate link clearly." : "Request an estimate", targetIds: ["a-1"] })),
    verdict: "The page appears to offer excavation services. Its next action is clear.", priorities: ["Explain the project process."], findings: [] };
}
for (const [grade, score] of [[0, 0], [2, 50], [4, 100]]) test("uniform grades " + grade + " produce " + score, () => assert.equal(validateReview(raw(grade), brief, true).score, score));
test("weights preserve weak conversion and UX despite perfect technical checks", () => {
  const r = raw(4);
  r.criteria.forEach(c => { if (["Conversion", "UX"].includes(G.CRITERIA.find(d => d.id === c.id).category)) c.grade = 1; });
  assert.equal(validateReview(r, brief, true).score, 51);
});
test("empty findings without rubric never means 100", () => assert.equal(validateReview({ findings: [] }, brief, true).score, null));
test("missing, duplicate and out of range criteria produce incomplete reviews", () => {
  for (const change of [r => r.criteria.pop(), r => r.criteria.push(r.criteria[0]), r => r.criteria[0].grade = 5]) {
    const r = raw(); change(r); assert.equal(validateReview(r, brief, true).score, null);
  }
});
test("invented quotations and targets are rejected", () => {
  const r = raw(); r.criteria[0].evidence = "We are certified"; assert.equal(validateReview(r, brief, true).score, null);
  r.criteria[0].evidence = "Request an estimate"; r.criteria[0].targetIds = ["missing"]; assert.equal(validateReview(r, brief, true).score, null);
});
test("missing screenshot never produces a full score", () => assert.equal(validateReview(raw(), brief, false).score, null));
test("absence claims need full supplied coverage and cannot earn 4", () => {
  const r = raw(); Object.assign(r.criteria[0], { evidenceKind: "absence", evidence: "No action in captured content", targetIds: [] });
  assert.equal(validateReview(r, { ...brief, coverage: { truncated: true } }, true).score, null);
  r.criteria[0].grade = 4; assert.equal(validateReview(r, brief, true).score, null);
});
test("only objectively inapplicable criteria can be omitted", () => {
  const r = raw(); Object.assign(r.criteria.find(c => c.id === "alternatives"), { status: "not_applicable", grade: null, evidence: "No images in inspected content" });
  assert.equal(validateReview(r, brief, true).score, 50);
  r.criteria[0].status = "not_applicable"; assert.equal(validateReview(r, brief, true).score, null);
});
test("multiple distinct findings in one category survive; duplicates do not", () => {
  const f = { category: "Conversion", severity: "medium", title: "Vague promise", description: "Explain the next step.", fix: "Name the next step.", evidence: "Request an estimate", targetAnchorId: "a-1", criterionId: "action" };
  const f2 = { ...f, criterionId: "path", title: "Explain the process" };
  assert.equal(validateFindings([f, f, f2], brief).length, 2);
  assert.equal(validateFindings([{ ...f, evidence: "fabricated" }], brief).length, 0);
  const r = raw(); const before = validateReview(r, brief, true).score; r.findings = Array(100).fill(f);
  assert.equal(validateReview(r, brief, true).score, before);
});
test("visual findings require a target in the supplied view or measured phone clipping", () => {
  const f = { category: "UX", severity: "high", title: "Clipped control", description: "Hard to use.", fix: "Fit the control within the phone layout.", evidenceKind: "visual", evidence: "The screenshot shows this control clipped by horizontal overflow.", targetAnchorId: "a-1" };
  const offscreen = { ...brief, elements: [{ ...brief.elements[0], rect: { x: 800, y: 250, width: 100, height: 30 } }], viewport: { width: 390, height: 800 }, facts: { mobileLayout: { horizontalOverflow: false } } };
  assert.equal(validateFindings([f], offscreen, true).length, 0);
  offscreen.facts.mobileLayout.horizontalOverflow = true;
  assert.equal(validateFindings([f], offscreen, true).length, 1);
  assert.equal(validateFindings([{ ...f, evidence: "The screenshot looks bad." }], offscreen, true).length, 0);
});
test("prompt is contextual, anchored, and treats page text as untrusted", () => {
  const p = buildPrompt(brief, [], false);
  assert.match(p, /not four personas/i); assert.match(p, /NO screenshot/); assert.match(p, /Unknown/);
  assert.match(p, /not.*indiscriminately/i); assert.match(p, /NEVER instructions/);
});
test("all export formats retain reasons and never invent after improvement", () => {
  const review = { ...validateReview(raw(2), brief, true), provenance: { source: "fresh", model: "test", completedAt: "2026-09-23", screenshotIncluded: true } };
  const audit = { url: brief.url, review, findings: [] };
  for (const text of [R.text([audit]), R.csv([audit]), R.html([audit])]) { assert.match(text, /50/); assert.match(text, /Specific observable explanation/); assert.match(text, /test/); }
  assert.match(R.text([audit]), /not reassessed/);
  assert.doesNotMatch(R.csv([{ ...audit, after: { ...review, score: 100 }, afterStale: true }]), /100/);
  assert.match(R.html([{ ...audit, findings: [{ title: "<script>alert(1)</script>" }] }]), /&lt;script&gt;/);
});
test("public URL guard excludes local and credential-bearing destinations", () => {
  for (const u of ["http://localhost", "http://127.0.0.1", "http://192.168.1.2", "file:///x", "https://user:pass@example.com", "http://[::1]"]) assert.equal(G.isPublicUrl(u), false);
  assert.equal(G.isPublicUrl("https://www.ccellc.biz/"), true);
});
test("helper health exposes versions, not secrets; arbitrary web origins are refused", async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = "http://127.0.0.1:" + server.address().port;
    const health = await (await fetch(url + "/health")).json();
    assert.equal(health.rubricVersion, G.VERSION); assert.equal(health.helperVersion, "3.1.0"); assert.equal("key" in health, false);
    assert.equal((await fetch(url + "/audit", { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" })).status, 403);
    const bad = await (await fetch(url + "/audit", { method: "POST", body: "{}" })).json(); assert.match(bad.error, /version mismatch/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('evidence references resolve locally including an empty meta description; unknown references fail', () => {
  const b = { ...brief, facts: { ...brief.facts, metaDescription: "" } };
  const r = raw();
  Object.assign(r.criteria.find(c => c.id === 'description'), { evidenceRef: 'fact:metaDescription', grade: 0, evidence: 'paraphrased by model' });
  const v = validateReview(r, b, true);
  assert.equal(v.complete, true);
  assert.equal(v.criteria.find(c => c.id === 'description').evidence, '"metaDescription":""');
  assert.equal(validateReview(v, b, true).score, v.score, 'worker revalidation is idempotent');
  r.criteria[0].evidenceRef = 'invented';
  assert.equal(validateReview(r, b, true).complete, false);
  assert.match(validateReview(r, b, true).validationDiagnostics[0].problem, /Unknown/);
});

test('text references cannot substitute for visual evidence', () => {
  const r = raw(); r.criteria.find(c => c.id === 'hierarchy').evidenceRef = 'text:a-1';
  assert.equal(validateReview(r, brief, true).complete, false);
});

test('phone CTA below first viewport can support a low visibility grade only', () => {
  const b = { ...brief, viewport: { width: 390, height: 800 }, facts: { ...brief.facts, mobileLayout: { horizontalOverflow: true } }, elements: [{ ...brief.elements[0], rect: { x: 0, y: 900, width: 100, height: 30 } }] };
  const r = raw(2);
  r.criteria.push(...G.MOBILE_CRITERIA.map(c => ({ id: c.id, status: 'assessed', grade: 2, reason: 'Observed', evidenceKind: 'visual', evidence: 'The screenshot shows the link in the first screen.', targetIds: ['a-1'] })));
  for (const id of ['hierarchy','readability','mobile_fit','mobile_navigation','mobile_readability','mobile_tap']) r.criteria.find(c=>c.id===id).status = 'unassessed';
  const action = r.criteria.find(c=>c.id==='mobile_action');
  action.grade = 1; action.evidence = 'The screenshot shows this action is below the first screen.';
  assert.equal(validateReview(r,b,true,'mobile').criteria.find(c=>c.id==='mobile_action').status, 'assessed');
  const generalAction = r.criteria.find(c=>c.id==='action');
  generalAction.grade = 1; generalAction.evidenceKind = 'visual'; generalAction.evidence = 'Screenshot shows layout clipping and overflow affecting the contact action.'; generalAction.targetIds = ['a-1'];
  b.elements[0].rect = { x: 800, y: 250, width: 100, height: 30 };
  assert.equal(validateReview(r,b,true,'mobile').criteria.find(c=>c.id==='action').status, 'assessed');
  b.facts.mobileLayout.horizontalOverflow = false;
  assert.equal(validateReview(r,b,true,'mobile').criteria.find(c=>c.id==='action').status, 'unassessed');
  action.grade = 4;
  assert.equal(validateReview(r,b,true,'mobile').criteria.find(c=>c.id==='mobile_action').status, 'unassessed');
  action.grade = 1;
  action.evidence = 'Screenshot shows this action outside the initial phone viewport.';
  b.facts.mobileLayout.horizontalOverflow = true;
  b.elements[0].rect = { x: 800, y: 250, width: 100, height: 30 };
  assert.equal(validateReview(r,b,true,'mobile').criteria.find(c=>c.id==='mobile_action').status, 'assessed');
});

test('one evidence repair preserves valid original grades and never accepts a second invalid quotation', async () => {
  for (const repairWorks of [true, false]) {
    let calls = 0;
    const first = raw(2); first.criteria[0].evidence = 'invented';
    const corrected = raw(4); corrected.criteria[0].evidenceRef = repairWorks ? 'text:a-1' : 'invented';
    const fetcher = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(++calls === 1 ? first : corrected) }] } }], modelVersion: 'mock-model' }) });
    const result = await requestGemini(brief, [], 'data:image/jpeg;base64,AAAA', fetcher);
    assert.equal(calls, 2);
    assert.equal(result.provenance.repairAttempted, true);
    assert.equal(result.criteria.find(c => c.id === 'offer').grade, 2, 'valid grades must not drift in repair');
    assert.equal(result.complete, repairWorks);
    if (!repairWorks) assert.equal(result.score, null);
  }
});

test("openai review parses a responses payload and keeps valid grades", async () => {
  const fetcher = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-5-mini");
    assert.equal(body.input[0].content.filter(part => part.type === "input_image").length, 1);
    assert.match(options.headers.Authorization, /^Bearer /);
    return { ok: true, json: async () => ({ id: "resp_test", status: "completed", model: "gpt-5-mini", output_text: JSON.stringify(raw(3)) }) };
  };
  const result = await requestOpenAI(brief, [], "data:image/jpeg;base64,AAAA", fetcher);
  assert.equal(result.complete, true);
  assert.equal(result.score, 75);
  assert.equal(result.provenance.provider, "openai");
  assert.equal(result.provenance.model, "gpt-5-mini");
});

test('paired reviews validate 15 desktop and 20 phone-width checks independently', async () => {
  const mobile = { ...brief, viewport: { width: 390, height: 800 }, facts: { ...brief.facts, mobileLayout: { viewportWidth: 390, documentWidth: 390, horizontalOverflow: false } } };
  const desktopRaw = raw(4), mobileRaw = raw(2);
  mobileRaw.criteria.push(...G.MOBILE_CRITERIA.map(c => ({ id: c.id, status: 'assessed', grade: 1, reason: 'Observed mobile limitation.', evidenceKind: 'visual', evidence: 'The screenshot shows the estimate action in the phone viewport.', evidenceRef: '', targetIds: ['a-1'] })));
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    assert.equal(request.contents[0].parts.filter(p => p.inlineData).length, 2);
    assert.match(request.contents[0].parts[0].text, /MOBILE EXTRA CRITERIA/);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ desktop: desktopRaw, mobile: mobileRaw, combinedVerdict: 'Phone layout needs work.', priorities: ['Enlarge phone controls.'] }) }] } }], modelVersion: 'test-paired' }) };
  };
  const result = await requestGeminiDual(brief, mobile, [], [], 'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB', fetcher);
  assert.equal(calls, 1);
  assert.equal(result.desktopReview.score, 100);
  assert.equal(result.mobileReview.criteria.length, 20);
  assert(result.mobileReview.score < result.desktopReview.score);
  assert.equal(result.combinedVerdict, 'Phone layout needs work.');
  await assert.rejects(requestGeminiDual(brief, { ...mobile, viewport: { width: 500 } }, [], [], 'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB', fetcher), /phone-width/);
});

test('paired scores, reasons, and view labels agree in copied, CSV, and HTML reports', () => {
  const desktop = { ...validateReview(raw(3), brief, true), provenance: { source: 'fresh', model: 'mock', screenshotIncluded: true } };
  const mobileBrief = { ...brief, viewport: { width: 390, height: 800 } };
  const mobileRaw = raw(2);
  mobileRaw.criteria.push(...G.MOBILE_CRITERIA.map(c => ({ id: c.id, status: 'assessed', grade: 1, reason: 'Phone control is small.', evidenceKind: 'visual', evidence: 'The screenshot shows a small link.', targetIds: ['a-1'] })));
  const mobile = { ...validateReview(mobileRaw, mobileBrief, true, 'mobile'), provenance: { source: 'fresh', model: 'mock', screenshotIncluded: true, viewport: mobileBrief.viewport } };
  const audit = { url: brief.url, review: desktop, mobileReview: mobile, after: desktop, mobileAfter: mobile, findings: [{ view: 'mobile', category: 'UX', title: 'Small control', severity: 'Medium', evidence: 'Request an estimate', description: 'Hard to tap.', fix: 'Enlarge it.' }] };
  for (const output of [R.text([audit]), R.csv([audit]), R.html([audit])]) {
    assert.match(output, /Phone width|Phone-width/);
    assert.match(output, /Phone control is small/);
    assert.match(output, new RegExp(String(desktop.score)));
    assert.match(output, new RegExp(String(mobile.score)));
  }
});
test('an unavailable phone view appears explicitly in every report format', () => {
  const audit = { url: brief.url, review: validateReview(raw(2), brief, true), mobileReview: null, mobileStatus: 'Phone-width review incomplete: Chrome rendered the test window too wide.', findings: [] };
  for (const output of [R.text([audit]), R.csv([audit]), R.html([audit])]) assert.match(output, /Phone-width review incomplete: Chrome rendered the test window too wide/);
});
