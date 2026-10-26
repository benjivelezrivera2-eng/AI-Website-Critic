importScripts("grading.js");
const G = globalThis.InspectorGrading;
let batchJob = null;
// AI Website Inspector - Background Service Worker

// Enable the side panel to open when the user clicks the extension icon in the toolbar.
// Also pin the panel page on every tab. Without this, Chrome can open the named
// panel and leave the page inside it blank.
function enableSidePanel(tabId) {
  if (!chrome.sidePanel?.setOptions) return Promise.resolve();
  const options = { path: "sidepanel.html", enabled: true };
  if (Number.isInteger(tabId)) options.tabId = tabId;
  return chrome.sidePanel.setOptions(options);
}
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting side panel behavior:", error));
enableSidePanel().catch((error) => console.error("Error enabling side panel:", error));
chrome.runtime.onInstalled.addListener(() => {
  enableSidePanel().catch((error) => console.error("Error enabling side panel:", error));
});
chrome.runtime.onStartup?.addListener(() => {
  enableSidePanel().catch((error) => console.error("Error enabling side panel:", error));
});
chrome.tabs.onActivated?.addListener(({ tabId }) => {
  enableSidePanel(tabId).catch(() => {});
});

const LOCAL_AUDIT_URL = "http://127.0.0.1:8787/audit";
const MAX_LINKS_TO_CHECK = 100;
const LINK_CONCURRENCY = 6;
// Version this cache whenever the page-target format changes. Reusing a review
// with old target IDs could attach an otherwise valid finding to the wrong item.
const AI_CACHE_STORAGE_KEY = "aiAuditCacheRubric2";
const AI_CACHE_LIMIT = 30;
const mobileSessions = new Map();
const recovery = (async () => {
  const { batchAuditResults: saved } = await chrome.storage.local.get("batchAuditResults");
  if (!saved?.running) return;
  const results = saved.results || [];
  for (const url of (saved.urls || []).slice(results.length)) results.push({ url, score: null, status: "interrupted", findings: [], message: "Not reviewed: browser worker restarted." });
  await chrome.storage.local.set({ batchAuditResults: { ...saved, results, running: false, interrupted: true } });
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "closeMobileView") {
    closeMobileView(request.desktopTabId).then(() => sendResponse({ success: true })).catch(error => sendResponse({ success: false, message: error.message }));
    return true;
  }
  if (request.action === "focusMobileView") {
    getMobileSession(request.desktopTabId).then(session => {
      if (!session || session.tabId !== request.mobileTabId) return sendResponse({ success: false, message: "Phone view closed. Run a fresh review to reopen it." });
      return chrome.windows.update(session.windowId, { focused: true }).then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false, message: "Phone view closed. Run a fresh review." }));
    });
    return true;
  }
  if (request.action === "cancelBatch") { if (batchJob) batchJob.cancelled = true; sendResponse({ success: true }); return false; }
  if (request.action === "runBatchAudit") {
    runBatchAudit(request.urls, request.mobileEnabled !== false)
      .then(sendResponse)
      .catch((error) => {
        console.warn("Inspector batch audit failed:", error);
        sendResponse({ success: false, message: "The batch audit could not finish. Try again with public website addresses." });
      });
    return true;
  }

  if (request.action !== "auditPage") return undefined;

  (request.mobileEnabled ? runDualAudit(request) : runAudit(request.tabId, request.documentId, request.forceFresh, request.acceptedIds))
    .then(sendResponse)
    .catch((error) => {
      console.warn("Inspector audit failed:", error);
      sendResponse({
        aiStatus: "unavailable",
        aiMessage: "Review incomplete: AI could not run. Showing technical checks only.",
        reviewComplete: false,
        aiFindings: [],
        linkFindings: []
      });
    });

  return true;
});

async function runAudit(tabId, documentId, forceFresh = false, acceptedIds) {
  let brief, screenshot = "", captureError = "";
  const before = await chrome.tabs.get(tabId);
  if (!G.isPublicUrl(before.url)) throw new Error("Only public websites can be audited.");
  try {
    const prepared = await messageTab(tabId, { action: "prepareCapture", documentId, acceptedIds });
    if (!prepared?.success) throw new Error(prepared?.message || "Could not prepare this page safely.");
    const collected = await messageTab(tabId, { action: "collect", documentId });
    if (!collected?.success) throw new Error("Could not collect the current page.");
    brief = collected.pageBrief;
    const current = await chrome.tabs.get(tabId);
    if (current.url !== before.url || current.windowId !== before.windowId) throw new Error("The page changed during capture.");
    if (current.active) {
      try { screenshot = await chrome.tabs.captureVisibleTab(current.windowId, { format: "jpeg", quality: 70 }); }
      catch (error) { captureError = String(error.message || "Chrome refused the screenshot.").slice(0, 400); }
      const after = await chrome.tabs.get(tabId);
      const ping = await messageTab(tabId, { action: "ping", documentId });
      if (!after.active || after.url !== before.url || !ping?.success) throw new Error("The active page changed during capture.");
    } else captureError = "The audited tab is not active. Keep it selected during the review.";
    brief.baseline = collected.findings;
  } finally { await messageTab(tabId, { action: "finishCapture", documentId }); }
  const links = await checkLinks(brief.links || []);
  brief.facts.linkChecks = links.checks;
  const incomplete = message => ({ aiStatus: "unavailable", aiMessage: message, reviewComplete: false, aiFindings: [], linkFindings: links.findings, review: null });
  if (!screenshot) return incomplete("Incomplete review: screenshot capture failed. " + (captureError || "Chrome returned no image.") + " Select the audited tab, then click Fresh review and allow screenshot access. The AI model was not called; technical findings are still available.");
  try {
    const healthResponse = await fetch("http://127.0.0.1:8787/health", { signal: AbortSignal.timeout(3000) });
    const health = await healthResponse.json();
    if (health.rubricVersion !== G.VERSION || health.helperVersion !== "3.1.0") return incomplete("Incomplete review: restart the local helper and reload the extension (version mismatch).");
    const baseline = brief.baseline; delete brief.baseline;
    const cacheKey = await auditCacheKey({ brief, screenshotHash: await auditCacheKey(screenshot), model: health.model, rubric: G.VERSION });
    const saved = !forceFresh && await getCachedAiReview(cacheKey);
    let review;
    if (saved) review = { ...saved.review, provenance: { ...saved.review.provenance, source: "cached" } };
    else {
      const response = await fetch(LOCAL_AUDIT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(125000),
        body: JSON.stringify({ rubricVersion: G.VERSION, pageBrief: brief, baselineFindings: baseline, screenshotDataUrl: screenshot }) });
      const payload = await response.json();
      if (!response.ok) return incomplete("Incomplete review: " + (payload.error || "AI unavailable."));
      // Validate the helper contract again before exposing a numerical score.
      if (payload.rubricVersion !== G.VERSION || !payload.provenance) return incomplete("Incomplete review: invalid helper response.");
      review = { ...payload, ...G.validateReview(payload, brief, Boolean(screenshot)), findings: payload.findings || [] };
      await cacheAiReview(cacheKey, review);
    }
    const stillCurrent = await messageTab(tabId, { action: "ping", documentId });
    if (!stillCurrent?.success || stillCurrent.url !== brief.url) return incomplete("Incomplete review: the page changed while the AI model was reviewing it. Inspect it again.");
    const label = review.complete ? (saved ? "Saved AI review" : "Fresh AI review") : "Incomplete review";
    return { aiStatus: "available", reviewComplete: review.complete, review,
      aiMessage: label + " · " + review.provenance.model + " · " + review.provenance.completedAt +
        (!screenshot ? " · Screenshot unavailable." : !review.complete ? " · Not assessed: " + review.criteria.filter(c => c.status === "unassessed").map(c => c.label).join(", ") + ". Open Why this score? for the reason." : ""),
      aiFindings: review.findings, linkFindings: links.findings };
  } catch (error) {
    return incomplete("Incomplete review: " + (error.name === "TimeoutError" ? "AI request timed out." : "Local AI helper unavailable. Start or restart it."));
  } finally { screenshot = ""; }
}

async function closeMobileView(desktopTabId) {
  const session = await getMobileSession(desktopTabId);
  if (!session) return;
  mobileSessions.delete(desktopTabId);
  await sessionStorageArea().remove("mobileView_" + desktopTabId);
  try { await chrome.tabs.remove(session.tabId); } catch { /* already closed by user */ }
}
async function getMobileSession(desktopTabId) {
  return mobileSessions.get(desktopTabId) || (await sessionStorageArea().get("mobileView_" + desktopTabId))["mobileView_" + desktopTabId] || null;
}

async function captureEvidence(tabId, documentId, acceptedIds) {
  const before = await chrome.tabs.get(tabId);
  if (!G.isPublicUrl(before.url) || !before.active) throw new Error("Keep the audited public tab selected during capture.");
  let brief, baseline, screenshot = "";
  try {
    const ready = await messageTab(tabId, { action: "prepareCapture", documentId, acceptedIds });
    if (!ready?.success) throw new Error(ready?.message || "Could not prepare the page safely.");
    const collected = await messageTab(tabId, { action: "collect", documentId });
    if (!collected?.success) throw new Error("Could not collect page evidence.");
    brief = collected.pageBrief; baseline = collected.findings;
    const active = await chrome.tabs.get(tabId);
    if (active.url !== before.url || active.windowId !== before.windowId || !active.active) throw new Error("The audited page changed during capture.");
    screenshot = await chrome.tabs.captureVisibleTab(active.windowId, { format: "jpeg", quality: 70 });
    const after = await chrome.tabs.get(tabId), ping = await messageTab(tabId, { action: "ping", documentId });
    if (!after.active || after.url !== before.url || !ping?.success) throw new Error("The audited page changed during capture.");
  } finally { await messageTab(tabId, { action: "finishCapture", documentId }); }
  if (!screenshot) throw new Error("Chrome returned no screenshot.");
  return { brief, baseline, screenshot };
}

async function runDualAudit(request) {
  const { tabId, documentId, forceFresh, acceptedIds } = request;
  let desktop, mobile, mobileTabId, mobileDocumentId, mobileWindowId, mobileBaselineFindings = [], createdHere = false;
  const incomplete = (message, desktopResult = null) => ({ ...desktopResult, aiStatus: desktopResult?.aiStatus || "unavailable", aiMessage: message, reviewComplete: Boolean(desktopResult?.reviewComplete), mobileReview: null, mobileStatus: message, mobileFindings: [] });
  try {
    const mainTab = await chrome.tabs.get(tabId);
    if (!G.isPublicUrl(mainTab.url)) throw new Error("Only public homepages can be reviewed.");
    desktop = await captureEvidence(tabId, documentId, acceptedIds?.desktop);
    if (desktop.brief.viewport.width < 900) throw new Error("Desktop viewport is under 900 pixels. Widen the browser before reviewing both layouts.");
    if (forceFresh && !acceptedIds) await closeMobileView(tabId);
    let session = await getMobileSession(tabId);
    if (session) {
      try { const tab = await chrome.tabs.get(session.tabId); if (tab.url !== mainTab.url) session = null; }
      catch { session = null; }
    }
    if (!session && acceptedIds?.mobile?.length) throw new Error("The phone view with accepted previews was closed. Its After score cannot be verified. Run a new Before review.");
    if (!session) {
      await closeMobileView(tabId);
      const win = await chrome.windows.create({ url: mainTab.url, type: "popup", focused: true, width: 400, height: 850 });
      if (!win?.tabs?.[0]?.id) {
        if (win?.id) await chrome.windows.remove(win.id);
        throw new Error("Chrome could not open the phone-width test window.");
      }
      session = { windowId: win.id, tabId: win.tabs[0].id, url: mainTab.url };
      mobileSessions.set(tabId, session); createdHere = true;
      await sessionStorageArea().set({ ["mobileView_" + tabId]: session });
      await waitForTabComplete(session.tabId, 30000); await delay(650);
    } else await chrome.windows.update(session.windowId, { focused: true });
    mobileWindowId = session.windowId; mobileTabId = session.tabId;
    await ensureContentScript(mobileTabId);
    const ping = await messageTab(mobileTabId, { action: "ping" });
    mobileDocumentId = ping?.documentId;
    if (!mobileDocumentId) throw new Error("Phone-width page could not be inspected.");
    if (acceptedIds?.mobile?.length) {
      const activePreviews = await messageTab(mobileTabId, { action: "getPreviewIds", documentId: mobileDocumentId });
      if (!activePreviews?.success || acceptedIds.mobile.some(id => !activePreviews.ids.includes(id))) throw new Error("An accepted phone-width preview is no longer on the test page. Its After score cannot be verified.");
    }
    // Keep markers and preview history when rechecking the same temporary page.
    if (createdHere) {
      const baseline = await messageTab(mobileTabId, { action: "scan" });
      if (!baseline?.success) throw new Error("Phone-width baseline check failed.");
      mobileBaselineFindings = baseline.findings || [];
      session.baselineFindings = mobileBaselineFindings;
      await sessionStorageArea().set({ ["mobileView_" + tabId]: session });
    } else mobileBaselineFindings = session.baselineFindings || [];
    mobile = await captureEvidence(mobileTabId, mobileDocumentId, acceptedIds?.mobile);
    const width = mobile.brief.viewport?.width;
    if (width < 320 || width > 430) throw new Error(`Phone-width check unavailable: Chrome rendered the test window at ${width} CSS pixels.`);
    const links = await checkLinks(desktop.brief.links || []);
    desktop.brief.facts.linkChecks = links.checks;
    const health = await (await fetch("http://127.0.0.1:8787/health", { signal: AbortSignal.timeout(3000) })).json();
    if (health.rubricVersion !== G.VERSION || health.helperVersion !== "3.1.0") throw new Error("Restart the local helper and reload the extension (version mismatch).");
    const cacheKey = await auditCacheKey({ desktop: desktop.brief, mobile: mobile.brief, desktopImage: await auditCacheKey(desktop.screenshot), mobileImage: await auditCacheKey(mobile.screenshot), model: health.model, rubric: G.VERSION });
    const saved = !forceFresh && await getCachedAiReview(cacheKey);
    let result = saved?.review;
    if (!result) {
      const response = await fetch("http://127.0.0.1:8787/audit-paired", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(125000), body: JSON.stringify({ rubricVersion: G.VERSION, desktopBrief: desktop.brief, mobileBrief: mobile.brief, desktopBaseline: desktop.baseline, mobileBaseline: mobile.baseline, desktopScreenshot: desktop.screenshot, mobileScreenshot: mobile.screenshot }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI review unavailable.");
      if (payload.rubricVersion !== G.VERSION || !payload.desktopReview || !payload.mobileReview) throw new Error("Invalid paired review response.");
      result = payload;
      result.desktopReview = { ...payload.desktopReview, ...G.validateReview(payload.desktopReview, desktop.brief, true), findings: payload.desktopReview.findings || [], provenance: payload.desktopReview.provenance };
      result.mobileReview = { ...payload.mobileReview, ...G.validateReview(payload.mobileReview, mobile.brief, true, "mobile"), findings: payload.mobileReview.findings || [], provenance: payload.mobileReview.provenance };
      await cacheAiReview(cacheKey, result);
    }
    const currentDesktop = await chrome.tabs.get(tabId), currentMobile = await chrome.tabs.get(mobileTabId);
    if (currentDesktop.url !== desktop.brief.url || currentMobile.url !== mobile.brief.url) throw new Error("A page changed while the AI model reviewed it. Run a fresh review.");
    const mobileMerged = await messageTab(mobileTabId, { action: "mergeFindings", documentId: mobileDocumentId, findings: result.mobileReview.findings || [] });
    const mobileFindings = [...mobileBaselineFindings, ...(mobileMerged?.findings || [])].map(f => ({ ...f, view: "mobile" }));
    return { aiStatus: "available", aiMessage: (saved ? "Saved" : "Fresh") + " AI review · " + (result.provenance?.model || health.model), reviewComplete: result.desktopReview.complete, review: { ...result.desktopReview, verdict: result.combinedVerdict || result.desktopReview.verdict, priorities: result.priorities || [] }, aiFindings: result.desktopReview.findings || [], linkFindings: links.findings, mobileReview: result.mobileReview, mobileFindings, mobileTabId, mobileDocumentId, mobileWindowId, mobileStatus: result.mobileReview.complete ? "Phone-width review complete" : "Phone-width review incomplete: " + result.mobileReview.criteria.filter(c => c.status === "unassessed").map(c => c.label).join(", ") };
  } catch (error) {
    // A desktop result remains useful if Chrome cannot provide a phone viewport.
    if (createdHere || mobileTabId) await closeMobileView(tabId);
    try { const original = await chrome.tabs.get(tabId); await chrome.windows.update(original.windowId, { focused: true }); } catch { /* original tab was closed */ }
    const desktopResult = desktop ? await runAudit(tabId, documentId, forceFresh, acceptedIds?.desktop) : null;
    return incomplete("Phone-width review incomplete: " + error.message, desktopResult);
  } finally {
    desktop = null; mobile = null;
    if (request.keepMobileWindow === false) await closeMobileView(tabId);
    if (mobileWindowId) { try { const tab = await chrome.tabs.get(tabId); await chrome.windows.update(tab.windowId, { focused: true }); } catch { /* user closed source window */ } }
  }
}

async function runBatchAudit(rawUrls, mobileEnabled = true) {
  await recovery;
  if (batchJob) return { success: false, message: "A five-site audit is already running." };
  const urls = normalizeBatchUrls(rawUrls);
  if (urls.length !== 5) return { success: false, message: "Enter exactly five different public URLs." };
  if (!await chrome.permissions.contains({ origins: ["<all_urls>"] })) return { success: false, message: "Incomplete review: screenshot permission is required for a visual batch." };
  const job = batchJob = { urls, mobileEnabled, cancelled: false, results: [], generatedAt: Date.now(), running: true };
  let ownedTabId;
  try {
    const win = await chrome.windows.create({ url: "about:blank", type: "normal", focused: true, width: 1366, height: 900 });
    ownedTabId = win.tabs[0].id;
    for (let i = 0; i < urls.length && !job.cancelled; i++) {
      notifyBatchProgress(i, 5, urls[i], "Opening public homepage");
      const result = await auditOneBatchSite(urls[i], i, 5, ownedTabId, mobileEnabled);
      job.results.push(result);
      await chrome.storage.local.set({ batchAuditResults: { ...job, success: true, rubricVersion: G.VERSION } });
      notifyBatchProgress(i + 1, 5, urls[i], result.status === "complete" ? "Visual review completed" : result.message);
      if (/429|quota|rate limit/i.test(result.message || "")) job.cancelled = true;
      if (i < 4 && !job.cancelled) await delay(1000);
    }
  } catch (error) {
    job.cancelled = true;
  } finally {
    job.running = false;
    for (const url of urls.slice(job.results.length)) job.results.push({ url, status: "cancelled", score: null, message: "Not reviewed: batch stopped.", findings: [] });
    if (Number.isInteger(ownedTabId)) { try { await chrome.tabs.remove(ownedTabId); } catch { /* user closed it */ } }
    batchJob = null;
    await chrome.storage.local.set({ batchAuditResults: { ...job, success: true, rubricVersion: G.VERSION } });
  }
  return { success: true, ...job };
}

function normalizeBatchUrls(rawUrls) {
  const unique = new Set();
  (Array.isArray(rawUrls) ? rawUrls : []).forEach(value => {
    let url = String(value || "").trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (!G.isPublicUrl(parsed.href)) return;
      parsed.hash = "";
      unique.add(parsed.href);
    } catch (error) {
      // Invalid entries are rejected by the final five-site count.
    }
  });
  return [...unique];
}

async function auditOneBatchSite(url, index, total, tabId, mobileEnabled) {
  try {
    await chrome.tabs.update(tabId, { url, active: true });
    await waitForTabComplete(tabId, 30000);
    await delay(650);
    if (batchJob?.cancelled) throw new Error("Batch cancelled.");
    await ensureContentScript(tabId);
    const baseline = await messageTab(tabId, { action: "scan" });
    if (!baseline?.success) throw new Error("The page could not be inspected.");
    notifyBatchProgress(index, total, url, "Reviewing screenshot and page evidence");
    const audit = mobileEnabled ? await runDualAudit({ tabId, documentId: baseline.documentId, mobileEnabled: true, keepMobileWindow: false, forceFresh: true }) : await runAudit(tabId, baseline.documentId);
    const findings = [...baseline.findings, ...(audit.linkFindings || []), ...(audit.aiFindings || []).map(f => ({ ...f, view: "desktop" })), ...(audit.mobileFindings || [])];
    return { url, title: baseline.pageBrief.title, status: audit.reviewComplete && (!mobileEnabled || audit.mobileReview?.complete) ? "complete" : "incomplete",
      message: audit.aiMessage, reviewComplete: audit.reviewComplete, review: audit.review,
      score: audit.reviewComplete && (!mobileEnabled || audit.mobileReview?.complete) ? audit.review?.score ?? null : null, mobileReview: audit.mobileReview || null, mobileStatus: audit.mobileStatus || "Desktop only", categoryScores: audit.review?.categoryScores || {},
      issueCount: findings.length, findings };
  } catch (error) {
    try { await chrome.tabs.get(tabId); } catch { if (batchJob) batchJob.cancelled = true; }
    return { url, status: "unavailable", message: error.message, score: null, findings: [], issueCount: 0 };
  }
}

async function ensureContentScript(tabId) {
  const ping = await messageTab(tabId, { action: "ping" });
  if (ping?.success) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const confirmed = await messageTab(tabId, { action: "ping" });
  if (!confirmed?.success) throw new Error("Chrome could not inspect this page.");
}

function messageTab(tabId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response || null);
    });
  });
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("The page took too long to load.")), timeoutMs);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };
    const finish = error => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error); else resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === "complete") finish();
    }).catch(() => finish(new Error("The batch tab was closed.")));
  });
}

function notifyBatchProgress(completed, total, url, status) {
  chrome.runtime.sendMessage({ action: "batchProgress", completed, total, url, status }, () => {
    void chrome.runtime.lastError;
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function auditCacheKey(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function sessionStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

function readStorage(area, key) {
  return new Promise(resolve => {
    area.get(key, result => resolve(result?.[key] || {}));
  });
}

function writeStorage(area, values) {
  return new Promise(resolve => area.set(values, resolve));
}

async function getCachedAiReview(cacheKey) {
  try {
    const cache = await readStorage(sessionStorageArea(), AI_CACHE_STORAGE_KEY);
    const review = cache[cacheKey];
    return review?.review?.rubricVersion === G.VERSION ? review : null;
  } catch (error) {
    return null;
  }
}

async function cacheAiReview(cacheKey, review) {
  try {
    const area = sessionStorageArea();
    const cache = await readStorage(area, AI_CACHE_STORAGE_KEY);
    cache[cacheKey] = { review, savedAt: Date.now() };
    const retained = Object.entries(cache)
      .sort(([, a], [, b]) => (b.savedAt || 0) - (a.savedAt || 0))
      .slice(0, AI_CACHE_LIMIT);
    await writeStorage(area, { [AI_CACHE_STORAGE_KEY]: Object.fromEntries(retained) });
  } catch (error) {
    // Caching is only a consistency improvement. A storage problem must not
    // prevent an otherwise valid audit from completing.
  }
}


async function checkLinks(links) {
  const unique = new Map();
  for (const link of links) {
    if (!link || !G.isPublicUrl(link.url)) continue;
    if (!unique.has(link.url)) unique.set(link.url, []);
    unique.get(link.url).push(link);
    if (unique.size >= MAX_LINKS_TO_CHECK) break;
  }

  const entries = [...unique.entries()];
  const results = [];
  for (let index = 0; index < entries.length; index += LINK_CONCURRENCY) {
    const batch = entries.slice(index, index + LINK_CONCURRENCY);
    const checked = await Promise.all(batch.map(async ([url, targets]) => ({
      targets,
      result: await checkOneLink(url)
    })));
    results.push(...checked);
  }

  const findings = results.flatMap(({ targets, result }) => {
    if (result.status !== "broken") return [];
    return targets.map((target) => ({
      type: "broken_link",
      category: "UX",
      severity: result.code === 404 || result.code === 410 ? "High" : "Medium",
      title: "Link could not be opened",
      description: `This link returned ${result.code}. Visitors may reach an error page instead of the expected destination.`,
      fix: "Update the destination or remove this link.",
      evidence: target.text || target.url,
      targetAnchorId: target.anchorId,
      source: "link-check"
    }));
  });
  return { findings, checks: results.map(({ targets, result }) => ({ url: targets[0].url, ...result })) };
}

async function checkOneLink(url) {
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", credentials: "omit", signal: AbortSignal.timeout(4000) });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: "GET", redirect: "follow", credentials: "omit", signal: AbortSignal.timeout(4000) });
    }
    if (response.status === 404 || response.status === 410 || response.status >= 500) {
      return { status: "broken", code: response.status };
    }
    return { status: response.ok ? "ok" : "unverified", code: response.status };
  } catch (error) {
    // A network or CORS failure is not evidence that a public link is broken.
    return { status: "unverified" };
  }
}
