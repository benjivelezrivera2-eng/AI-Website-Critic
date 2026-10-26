// Explicit manual diagnostic. Never runs in npm test. Public text only; no screenshot.
import '../grading.js';
const url = process.argv[2];
if (!['https://www.ccellc.biz/', 'https://www.303masterplumbing.com/'].includes(url)) throw Error('Choose an approved public test homepage.');
const html = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).text();
const clean = text => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
const elements = [...html.matchAll(/<(h[1-6]|p|a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((m,i) => ({id: 'source-'+i,kind:m[1].toLowerCase(),text:clean(m[3]).slice(0,500)})).filter(e=>e.text).slice(0,180);
const brief = { url, title, visibleText: elements.map(e=>e.text).join('\n').slice(0,16000), elements, facts: { title }, coverage: { truncated: true },
  limitation: 'Static HTML text diagnostic, not a rendered visual audit. Hidden content and visual layout have not been verified.' };
try {
  const response = await fetch('http://127.0.0.1:8787/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rubricVersion: InspectorGrading.VERSION, pageBrief: brief, baselineFindings: [], screenshotDataUrl: '' }), signal: AbortSignal.timeout(65000) });
  const review = await response.json();
  if (!response.ok) throw Error(review.error || 'Helper request failed');
  console.log(JSON.stringify({ source: review.provenance.source, model: review.provenance.model, responseId: review.provenance.responseId, completedAt: review.provenance.completedAt, complete: review.complete, score: review.score, assessed: review.criteria.filter(c=>c.status==='assessed').length, validationErrors: review.validationErrors, findings: review.findings.length }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
