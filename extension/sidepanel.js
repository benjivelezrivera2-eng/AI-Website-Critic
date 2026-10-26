// AI Website Inspector - Side Panel Script

document.addEventListener("DOMContentLoaded", () => {
  const G = globalThis.InspectorGrading, Reports = globalThis.InspectorReporting;
  let lastReview = null, lastMobileReview = null, lastMobileStatus = "", afterReview = null, afterMobileReview = null, afterStale = false, auditTabId = null, auditDocumentId = null, mobileTabId = null, mobileDocumentId = null, restoringSession = false, assessmentBusy = false;
  // UI Elements
  const welcomeState = document.getElementById("welcome-state");
  const loadingState = document.getElementById("loading-state");
  const resultsState = document.getElementById("results-state");
  
  const initialScanBtn = document.getElementById("initial-scan-btn");
  const openBatchBtn = document.getElementById("open-batch-btn");
  const rescanBtn = document.getElementById("rescan-btn");
  const clearBtn = document.getElementById("clear-btn");
  const restoreBtn = document.getElementById("restore-btn");
  const settingsRestoreBtn = document.getElementById("settings-restore-btn");
  const markerToggle = document.getElementById("marker-toggle");
  const mobileAuditToggle = document.getElementById("mobile-audit-toggle");
  const mobileScoreCard = document.getElementById("mobile-score-card");
  const mobileScoreValue = document.getElementById("mobile-score-value");
  const mobileStatus = document.getElementById("mobile-status");
  const mobileGradingReasons = document.getElementById("mobile-grading-reasons");
  const closeMobileViewBtn = document.getElementById("close-mobile-view-btn");
  const copyReportBtn = document.getElementById("copy-report-btn");
  const downloadCsvBtn = document.getElementById("download-csv-btn");
  const downloadHtmlBtn = document.getElementById("download-html-btn");
  const copyReportStatus = document.getElementById("copy-report-status");
  const beforeScore = document.getElementById("before-score");
  const afterScore = document.getElementById("after-score");
  const beforeSummary = document.getElementById("before-summary");
  const afterSummary = document.getElementById("after-summary");
  const comparisonNote = document.getElementById("comparison-note");
  const runBatchBtn = document.getElementById("run-batch-btn");
  const batchStatus = document.getElementById("batch-status");
  const batchResults = document.getElementById("batch-results");
  const batchActions = document.getElementById("batch-actions");
  const downloadBatchCsvBtn = document.getElementById("download-batch-csv-btn");
  const downloadBatchHtmlBtn = document.getElementById("download-batch-html-btn");
  const batchUrlInputs = [1, 2, 3, 4, 5].map(index => document.getElementById(`batch-url-${index}`));
  const aiStatus = document.getElementById("ai-status");
  const reviewStatus = document.getElementById("review-status");
  const verdictTitle = document.getElementById("verdict-title");
  const verdictCopy = document.getElementById("verdict-copy");
  const verdictPriorities = document.getElementById("verdict-priorities");
  
  const scoreValue = document.getElementById("score-value");
  const scoreRingProgress = document.getElementById("score-ring-progress");
  const ratingText = document.getElementById("rating-text");
  const summaryText = document.getElementById("summary-text");
  const categoriesContainer = document.getElementById("categories-container");
  const panelTabs = Array.from(document.querySelectorAll(".panel-tab"));
  const breakdownBars = document.getElementById("breakdown-bars");
  const filterChips = document.getElementById("filter-chips");
  const filterEmpty = document.getElementById("filter-empty");
  const suggestionsContainer = document.getElementById("suggestions-container");
  const reportContent = document.getElementById("report-content");
  const issueTabCount = document.getElementById("issue-tab-count");
  const issueSummary = document.getElementById("issue-summary");
  const previewSummary = document.getElementById("preview-summary");
  const lastScanned = document.getElementById("last-scanned");
  const scanStateDot = document.getElementById("scan-state-dot");

  const SCORE_CATEGORIES = ["Accessibility", "SEO", "UX", "Content", "Conversion"];
  let activeFilter = "All";
  let scoreRenderVersion = 0;
  let lastFindings = [];
  let lastScore = 0;
  let lastCategoryScores = {};
  let lastPageUrl = "";
  let lastReviewComplete = false;
  let acceptedFindingIds = new Set();
  let lastBatchResults = [];

  // Event Listeners
  initialScanBtn.addEventListener("click", () => triggerScan(false));
  openBatchBtn.addEventListener("click", () => {
    showState("results");
    showPanelTab("batch");
  });
  rescanBtn.addEventListener("click", () => triggerScan(true));
  document.getElementById("view-all-issues").addEventListener("click", () => showPanelTab("issues"));
  document.getElementById("apply-page-btn").addEventListener("click", applyVisibleSuggestions);
  document.getElementById("recheck-btn").addEventListener("click", recheckChanges);
  document.getElementById("cancel-batch-btn").addEventListener("click", () => sendToBackground({ action: "cancelBatch" }));
  clearBtn.addEventListener("click", triggerClear);
  restoreBtn.addEventListener("click", triggerRestore);
  settingsRestoreBtn.addEventListener("click", triggerRestore);
  panelTabs.forEach(tab => tab.addEventListener("click", () => showPanelTab(tab.dataset.panel)));
  markerToggle.addEventListener("change", () => setMarkersVisible(markerToggle.checked));
  mobileAuditToggle.addEventListener("change", () => chrome.storage.local.set({ mobileAuditEnabled: mobileAuditToggle.checked }));
  closeMobileViewBtn.addEventListener("click", async () => { await closeMobileView(); lastMobileStatus += " · Test window closed. Fresh review reopens it."; renderMobileReview(); renderReport(); saveSession(); });
  copyReportBtn.addEventListener("click", copyReport);
  downloadCsvBtn.addEventListener("click", downloadCsv);
  downloadHtmlBtn.addEventListener("click", downloadHtmlReport);
  runBatchBtn.addEventListener("click", triggerBatchAudit);
  downloadBatchCsvBtn.addEventListener("click", downloadBatchCsv);
  downloadBatchHtmlBtn.addEventListener("click", downloadBatchHtmlReport);

  chrome.storage.local.get({ markersVisible: true }, ({ markersVisible }) => {
    markerToggle.checked = markersVisible;
  });
  chrome.storage.local.get({ mobileAuditEnabled: false }, ({ mobileAuditEnabled }) => { mobileAuditToggle.checked = mobileAuditEnabled; });
  chrome.storage.local.get({ batchAuditResults: null }, ({ batchAuditResults }) => {
    if (batchAuditResults?.rubricVersion === G.VERSION && batchAuditResults?.success && Array.isArray(batchAuditResults.results)) {
      lastBatchResults = batchAuditResults.results;
      renderBatchResults(lastBatchResults);
    }
  });

  restoreSession();
  renderBreakdown([]);
  renderChips({ All: 0, Accessibility: 0, SEO: 0, UX: 0, Content: 0, Conversion: 0 });
  showPanelTab("overview", false);
  chrome.storage.onChanged?.addListener((changes, area) => {
    const batch = changes.batchAuditResults?.newValue;
    if (area !== "local" || batch?.rubricVersion !== G.VERSION) return;
    lastBatchResults = batch.results || []; renderBatchResults(lastBatchResults);
    runBatchBtn.disabled = Boolean(batch.running);
    if (!batch.running) showBatchStatus(batch.interrupted ? "Batch interrupted. Completed results were preserved." : "Batch finished. Only complete reviews receive a score.");
  });

  // Listen for messages from the content script (e.g., when a page marker is clicked)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "markerIgnored" && [auditTabId, mobileTabId].includes(sender.tab?.id)) {
      const ignored = document.querySelector(`.finding-card[data-issue-id="${request.issueId}"]`);
      if (ignored) markRejected(ignored);
      sendResponse({ success: true });
      return true;
    }
    if (request.action === "markerClicked" && [auditTabId, mobileTabId].includes(sender.tab?.id)) {
      selectFindingCard(request.issueId);
      sendResponse({ success: true });
    }
    if (request.action === "batchProgress") {
      showBatchProgress(request);
      sendResponse({ success: true });
    }
    return true;
  });

  // Trigger page scan
  async function triggerScan(forceFresh = false) {
    if (assessmentBusy) return;
    assessmentBusy = true;

    try {
      // Request directly from the click, before any asynchronous page work.
      // An already-open side panel does not renew the activeTab capture grant.
      if (!await chrome.permissions.request({ origins: ["<all_urls>"] })) {
        showError("Screenshot access was not granted. Click Fresh review and allow Chrome's permission request to run a complete visual audit.");
        return;
      }
      if (!confirm("Audit this public page? Its public text and a masked screenshot will be sent to OpenAI through the local helper. Do not continue on private or signed-in pages.")) return;
      showState("loading");
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showError("No active webpage found. Please click on a webpage tab to scan.");
        return;
      }

      // Check if it's a restricted browser page (like chrome://, edge://, about:blank, etc.)
      // tab.url may be undefined without the "tabs" permission, so guard the check.
      const tabUrl = tab.url || "";
      if (tabUrl.startsWith("chrome://") || tabUrl.startsWith("edge://") || tabUrl.startsWith("about:") || tabUrl.startsWith("chrome-extension://")) {
        showError("For security reasons, browser system pages cannot be scanned. Please open a regular website (e.g., google.com) and try again.");
        return;
      }
      if (!mobileAuditToggle.checked && Number.isInteger(auditTabId)) await closeMobileView();

      // Ensure content script is injected (handles newly opened tabs or post-install state)
      await ensureContentScriptInjected(tab.id);
      // Give late layout and animation work a short chance to settle. Inspecting
      // halfway through a page transition makes the visible-page result vary.
      await new Promise(resolve => setTimeout(resolve, 450));

      const baseline = await sendToTab(tab.id, { action: "scan" });
      auditTabId = tab.id;
      auditDocumentId = baseline.documentId;
      if (!baseline.success) {
        showError("The webpage inspection returned an unexpected result. Please try again.");
        return;
      }

      const audit = await sendToBackground({
        action: "auditPage",
        pageBrief: baseline.pageBrief,
        baselineFindings: baseline.findings,
        windowId: tab.windowId,
        tabId: tab.id, documentId: baseline.documentId, forceFresh, mobileEnabled: mobileAuditToggle.checked, keepMobileWindow: true
      });
      const externalFindings = [...(audit.linkFindings || []), ...(audit.aiFindings || [])];
      let mergedFindings = [];
      if (externalFindings.length) {
        const merged = await sendToTab(tab.id, { action: "mergeFindings", documentId: auditDocumentId, findings: externalFindings });
        mergedFindings = merged.success && Array.isArray(merged.findings) ? merged.findings : [];
      }
      lastReview = audit.review || null;
      lastMobileReview = audit.mobileReview || null; lastMobileStatus = audit.mobileStatus || (mobileAuditToggle.checked ? "Phone-width review incomplete." : "Desktop-only mode.");
      mobileTabId = audit.mobileTabId || null; mobileDocumentId = audit.mobileDocumentId || null;
      afterReview = null; afterMobileReview = null; afterStale = false;
      displayResults([...(baseline.findings || []).map(f => ({ ...f, view: "desktop" })), ...mergedFindings.map(f => ({ ...f, view: "desktop" })), ...(audit.mobileFindings || [])], audit.aiStatus, audit.aiMessage, baseline.pageBrief?.url || tab.url || "", audit.reviewComplete === true);
      renderMobileReview();
    } catch (error) {
      console.error("Scan exception:", error);
      showError(scanErrorMessage(error));
    } finally { assessmentBusy = false; renderComparison(); }
  }

  // Ensure content script is injected
  async function ensureContentScriptInjected(tabId) {
    try {
      // Ping first. This avoids clearing a prior inspection just to check readiness.
      await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (!response || !response.success) {
            reject(new Error("The page inspector did not respond."));
          } else {
            resolve(response);
          }
        });
      });
    } catch (err) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["content.js"]
        });
      } catch (injectionError) {
        throw new Error("Chrome could not connect to this tab. Refresh the tab once, then open Inspector again.");
      }
    }
  }

  // Trigger clearing markers
  async function triggerClear() {
    if (assessmentBusy) return;
    await sendToPage({ action: "clear" });
    if (mobileTabId && mobileDocumentId) await sendToPage({ action: "clear" }, "mobile");
    await closeMobileView();
    await chrome.storage.session.remove("inspectorPanelSession");
    lastReview = lastMobileReview = afterReview = afterMobileReview = null; lastFindings = []; auditTabId = null; auditDocumentId = null;
    showState("welcome");
  }

  async function triggerRestore() {
    if (assessmentBusy) return;
    const response = await sendToPage({ action: "restoreAllPreviews" });
    if (mobileTabId && mobileDocumentId) await sendToPage({ action: "restoreAllPreviews" }, "mobile");
    if (response.success) {
      document.querySelectorAll(".finding-card.accepted, .finding-card.previewed").forEach(resetCard);
      updateDashboardMeta();
    }
  }

  async function triggerBatchAudit() {
    const urls = normalizeBatchInput(batchUrlInputs.map(input => input.value));
    if (urls.length !== 5) {
      showBatchStatus("Add five different public website addresses before starting the batch.", true);
      return;
    }

    if (!confirm("Run five public-page audits? A separate window will show each site and send a masked screenshot and public text to OpenAI through the local helper. Do not include private or signed-in pages.")) return;
    const permitted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    if (!permitted) { showBatchStatus("Incomplete review: screenshot permission was not granted.", true); return; }
    runBatchBtn.disabled = true;
    batchActions.classList.add("hidden");
    batchResults.replaceChildren();
    showBatchStatus("Starting five visual audits in a separate window.");
    try {
      const response = await sendToBackground({ action: "runBatchAudit", urls, mobileEnabled: mobileAuditToggle.checked });
      if (!response?.success || !Array.isArray(response.results)) {
        showBatchStatus(response?.message || "The batch audit could not finish.", true);
        return;
      }
      lastBatchResults = response.results;
      renderBatchResults(lastBatchResults);
      const completed = lastBatchResults.filter(result => result.status === "complete").length;
      showBatchStatus(`${completed} of 5 sites completed. Completed reviews include a screenshot and validated grades. Incomplete sites are not ranked.`, completed !== 5);
    } catch (error) {
      showBatchStatus("The batch audit could not finish. Check that the website addresses are public and try again.", true);
    } finally {
      runBatchBtn.disabled = false;
    }
  }

  function normalizeBatchInput(values) {
    const unique = new Set();
    values.forEach(value => {
      let url = String(value || "").trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      try {
        const parsed = new URL(url);
        if (!/^https?:$/i.test(parsed.protocol)) return;
        parsed.hash = "";
        unique.add(parsed.href);
      } catch (error) {
        // The count check above gives the user one clear correction.
      }
    });
    return [...unique];
  }

  function showBatchProgress(progress) {
    if (!progress || !progress.total) return;
    const position = Math.min(progress.completed + 1, progress.total);
    showBatchStatus(`${position} of ${progress.total}: ${progress.status} · ${shortUrl(progress.url)}`);
  }

  function showBatchStatus(message, isError = false) {
    batchStatus.textContent = message;
    batchStatus.classList.toggle("is-error", isError);
    batchStatus.classList.remove("hidden");
  }

  function renderBatchResults(results) {
    batchResults.replaceChildren();
    if (!Array.isArray(results) || !results.length) {
      batchActions.classList.add("hidden");
      return;
    }
    const ranked = [...results].sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });
    ranked.forEach((result, index) => {
      const card = document.createElement("article");
      card.className = "batch-result-card" + (result.status !== "complete" ? " is-unavailable" : "");
      const topFinding = result.findings?.[0];
      const heading = document.createElement("div");
      heading.className = "batch-result-heading";
      const rank = document.createElement("span");
      rank.className = "batch-rank";
      rank.textContent = result.score === null ? "—" : `#${index + 1}`;
      const title = document.createElement("div");
      const site = document.createElement("strong");
      site.textContent = shortUrl(result.url);
      const status = document.createElement("small");
      status.textContent = result.message || "Batch audit completed.";
      title.append(site, status);
      const score = document.createElement("span");
      score.className = "batch-score";
      score.textContent = `Desktop ${Reports.score(result.review?.complete ? result.review.score : null)} · Phone ${Reports.score(result.mobileReview?.complete ? result.mobileReview.score : null)}`;
      heading.append(rank, title, score);
      card.appendChild(heading);
      if (result.status === "complete") {
        const details = document.createElement("p");
        details.className = "batch-result-details";
        details.textContent = `${result.issueCount} finding${result.issueCount === 1 ? "" : "s"} · ${topFinding ? `${topFinding.severity} ${topFinding.category}: ${topFinding.title}` : "No top finding detected"}`;
        card.appendChild(details);
      }
      batchResults.appendChild(card);
    });
    batchActions.classList.remove("hidden");
  }

  function shortUrl(value) {
    try { return new URL(value).hostname.replace(/^www\./i, ""); } catch (error) { return value || "Website"; }
  }

  function sendToTab(tabId, message) {
    return new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError || !response) {
          resolve({ success: false, message: chrome.runtime.lastError?.message || "No response" });
          return;
        }
        resolve(response);
      });
    });
  }

  function sendToBackground(message) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError || !response) {
          resolve({ aiStatus: "unavailable", aiMessage: "AI review unavailable. Showing the on-page checks instead.", aiFindings: [], linkFindings: [] });
          return;
        }
        resolve(response);
      });
    });
  }

  function setMarkersVisible(visible) {
    chrome.storage.local.set({ markersVisible: visible });
    sendToPage({ action: "setMarkerVisibility", visible });
    if (mobileTabId && mobileDocumentId) sendToPage({ action: "setMarkerVisibility", visible }, "mobile");
  }

  async function sendToPage(message, view = "desktop") {
    const targetTabId = view === "mobile" ? mobileTabId : auditTabId;
    const targetDocumentId = view === "mobile" ? mobileDocumentId : auditDocumentId;
    if (!Number.isInteger(targetTabId) || !targetDocumentId) return { success: false, message: "Inspect this view again." };
    return sendToTab(targetTabId, { ...message, documentId: targetDocumentId });
  }
  async function closeMobileView() {
    if (!Number.isInteger(auditTabId)) return;
    await sendToBackground({ action: "closeMobileView", desktopTabId: auditTabId });
    mobileTabId = null; mobileDocumentId = null;
  }
  function renderMobileReview(status = "") {
    mobileScoreCard.classList.toggle("hidden", !mobileAuditToggle.checked && !lastMobileReview);
    mobileScoreValue.textContent = Reports.score(lastMobileReview?.complete ? lastMobileReview.score : null);
    mobileStatus.textContent = status || lastMobileStatus || (lastMobileReview?.complete ? "Phone-width review complete." : mobileAuditToggle.checked ? "Phone-width review incomplete." : "Desktop-only mode.");
    mobileGradingReasons.replaceChildren();
    for (const c of lastMobileReview?.criteria || []) {
      const p = document.createElement("p");
      p.textContent = c.category + " · " + c.label + ": " + (c.status === "assessed" ? c.grade + "/4" : c.status) + ". " + c.reason + " Evidence: " + c.evidence;
      mobileGradingReasons.append(p);
    }
    closeMobileViewBtn.classList.toggle("hidden", !Number.isInteger(mobileTabId));
  }

  // Display results in UI
  function displayResults(findings, auditStatus = "unavailable", auditMessage = "", pageUrl = "", reviewComplete = false) {
    const score = lastReview?.complete ? lastReview.score : null;
    lastFindings = findings;
    acceptedFindingIds = new Set();
    lastScore = score;
    lastCategoryScores = categoryScores(findings);
    lastPageUrl = pageUrl;
    lastReviewComplete = reviewComplete = Boolean(lastReview?.complete);
    aiStatus.textContent = auditMessage;
    aiStatus.classList.toggle("hidden", !auditMessage);
    aiStatus.classList.toggle("is-unavailable", auditStatus !== "available");
    animateScore(score);
    updateRatingAndSummary(score, findings.length, reviewComplete);
    renderBreakdown(findings);
    renderVerdict(findings, reviewComplete);
    renderFindings(findings);
    renderSuggestions(findings);
    renderReport(findings, score);
    renderComparison();
    if (batchUrlInputs[0] && !batchUrlInputs[0].value && pageUrl) batchUrlInputs[0].value = pageUrl;
    updateDashboardMeta();
    setMarkersVisible(markerToggle.checked);
    showState("results");
    showPanelTab("overview", false);
  }

  function displayCategory(finding) {
    if (SCORE_CATEGORIES.includes(finding.category)) return finding.category;
    if (finding.category === "Accessibility") return "Accessibility";
    if (finding.category === "Search Optimization") return "SEO";
    if (finding.category === "Page Structure") return "Content";
    if (finding.category === "Action Buttons") return "Conversion";
    return "UX";
  }

  function severityFor(finding) {
    if (["High", "Medium", "Low"].includes(finding.severity)) return finding.severity;
    if (finding.type === "missing_h1" || finding.type === "missing_meta") return "High";
    if (finding.type === "multiple_h1" || finding.type === "missing_alt") return "Medium";
    return "Low";
  }

  function categoryScores() {
    return lastReview?.categoryScores || Object.fromEntries(SCORE_CATEGORIES.map(c => [c, null]));
  }

  function fillClass(score) {
    if (score >= 90) return "fill-success";
    if (score >= 75) return "fill-info";
    if (score >= 50) return "fill-warning";
    return "fill-danger";
  }

  function renderBreakdown(findings) {
    breakdownBars.innerHTML = "";
    const barLabels = { UX: "UX / Usability" };
    const scores = categoryScores(findings);
    SCORE_CATEGORIES.forEach(name => {
      const score = scores[name];
      const row = document.createElement("div");
      row.className = "score-row";
      row.innerHTML = `
        <span class="score-row-label">${barLabels[name] || name}</span>
        <span class="score-track" aria-hidden="true"><span class="score-fill ${fillClass(score)}"></span></span>
        <span class="score-row-value">${score === null ? "--/100" : Math.round(score) + "/100"}</span>
      `;
      breakdownBars.appendChild(row);
      const fill = row.querySelector(".score-fill");
      requestAnimationFrame(() => {
        fill.style.width = `${score ?? 0}%`;
      });
    });
  }

  function showPanelTab(name, shouldScroll = true) {
    document.body.dataset.view = name;
    panelTabs.forEach(tab => {
      const active = tab.dataset.panel === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    const destination = document.getElementById(`${name}-panel`);
    if (shouldScroll && destination && !resultsState.classList.contains("hidden")) {
      destination.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function afterComparison() {
    return { score: !afterStale && afterReview?.complete ? afterReview.score : null, mobileScore: !afterStale && afterMobileReview?.complete ? afterMobileReview.score : null, acceptedCount: acceptedFindingIds.size };
  }
  function renderComparison() {
    beforeScore.textContent = Reports.score(lastScore);
    afterScore.textContent = afterStale ? "Outdated" : Reports.score(afterComparison().score);
    document.getElementById("mobile-before-score").textContent = Reports.score(lastMobileReview?.complete ? lastMobileReview.score : null);
    document.getElementById("mobile-after-score").textContent = afterStale ? "Outdated" : Reports.score(afterComparison().mobileScore);
    beforeSummary.textContent = "Original assessment. Accepting changes does not alter it.";
    afterSummary.textContent = acceptedFindingIds.size + " accepted temporary changes.";
    comparisonNote.textContent = afterStale ? "The page changed after its last reassessment. Recheck changes." :
      afterReview ? (afterReview.complete ? "Reassessed with OpenAI. This is not a measured conversion improvement." : "After review incomplete. No verified score is available.") :
      "Click Recheck changes to grade accepted changes. Unaccepted previews are excluded.";
    document.getElementById("recheck-btn").disabled = assessmentBusy || !Number.isInteger(auditTabId);
  }
  function invalidateAfter() {
    if (restoringSession) return;
    if (afterReview) { afterStale = true; renderComparison(); renderReport(); }
  }
  async function recheckChanges() {
    if (assessmentBusy || !Number.isInteger(auditTabId)) return;
    assessmentBusy = true;
    const buttons = [...document.querySelectorAll(".finding-btn,#restore-btn,#settings-restore-btn,#clear-btn,#rescan-btn,#recheck-btn")];
    const disabled = buttons.map(b => b.disabled); buttons.forEach(b => b.disabled = true);
    comparisonNote.textContent = "Rechecking accepted changes with OpenAI...";
    try {
      if (!await chrome.permissions.request({ origins: ["<all_urls>"] })) {
        afterReview = { complete: false, score: null, verdict: "Screenshot access was not granted. Allow it when rechecking changes to obtain an After score.", criteria: [] };
        afterStale = false;
        return;
      }
      const desktopAccepted = lastFindings.filter(f => f.view !== "mobile" && acceptedFindingIds.has(f.id)).map(f => f.id);
      const mobileAccepted = lastFindings.filter(f => f.view === "mobile" && acceptedFindingIds.has(f.id)).map(f => f.id);
      const response = await sendToBackground({ action: "auditPage", tabId: auditTabId, documentId: auditDocumentId, forceFresh: true, mobileEnabled: mobileAuditToggle.checked && Boolean(lastMobileReview), keepMobileWindow: true, acceptedIds: mobileAuditToggle.checked && lastMobileReview ? { desktop: desktopAccepted, mobile: mobileAccepted } : desktopAccepted });
      afterReview = response.review || { complete: false, score: null, verdict: response.aiMessage || "After review unavailable.", criteria: [] }; afterStale = false;
      afterMobileReview = response.mobileReview || null;
      if (!afterReview) comparisonNote.textContent = response.aiMessage || "After review unavailable.";
    } finally {
      assessmentBusy = false; buttons.forEach((b, i) => b.disabled = disabled[i]);
      renderComparison(); renderReport(lastFindings, lastScore); saveSession();
    }
  }
  function saveSession() {
    if (restoringSession || !Number.isInteger(auditTabId)) return;
    const cards = [...document.querySelectorAll(".finding-card")].map(card => ({
      id: card.dataset.issueId, state: card.classList.contains("accepted") ? "accepted" : card.classList.contains("previewed") ? "previewed" : card.classList.contains("rejected") ? "rejected" : ""
    }));
    chrome.storage.session.set({ inspectorPanelSession: { rubricVersion: G.VERSION, auditTabId, auditDocumentId, mobileTabId, mobileDocumentId, findings: lastFindings, review: lastReview, mobileReview: lastMobileReview, mobileStatus: lastMobileStatus, afterReview, afterMobileReview, afterStale, url: lastPageUrl, cards } });
  }
  async function restoreSession() {
    const { inspectorPanelSession: saved } = await chrome.storage.session.get("inspectorPanelSession");
    if (!saved || saved.rubricVersion !== G.VERSION) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== saved.auditTabId) return;
    const ping = await sendToTab(tab.id, { action: "ping", documentId: saved.auditDocumentId });
    if (!ping.success) return;
    restoringSession = true;
    auditTabId = tab.id; auditDocumentId = saved.auditDocumentId;
    lastReview = saved.review ? { ...saved.review, provenance: { ...saved.review.provenance, source: "cached" } } : null;
    lastMobileReview = saved.mobileReview || null; lastMobileStatus = saved.mobileStatus || ""; mobileTabId = saved.mobileTabId || null; mobileDocumentId = saved.mobileDocumentId || null;
    afterReview = saved.afterReview; afterMobileReview = saved.afterMobileReview || null; afterStale = saved.afterStale;
    displayResults(saved.findings, lastReview ? "available" : "unavailable",
      lastReview ? "Saved AI review · " + lastReview.provenance.model + " · " + lastReview.provenance.completedAt : "Incomplete review", saved.url, lastReview?.complete);
    for (const item of saved.cards || []) {
      const card = [...document.querySelectorAll(".finding-card")].find(c => c.dataset.issueId === item.id);
      if (!card) continue;
      if (item.state === "accepted") markAccepted(card);
      else if (item.state === "previewed") markPreviewed(card);
      else if (item.state === "rejected") markRejected(card);
    }
    restoringSession = false; renderMobileReview(); renderComparison();
  }

  // Animate circular progress ring and score value
  function animateScore(targetScore) {
    const version = ++scoreRenderVersion;
    if (!Number.isFinite(targetScore)) { scoreValue.textContent = "--"; scoreRingProgress.style.strokeDashoffset = "314.16"; return; }
    let currentScore = 0;
    const duration = 800; // ms
    const startTime = performance.now();
    
    // SVG circle circumference is 2 * PI * r = 2 * 3.14159 * 50 = 314.16
    const circumference = 314.16;
    
    // Set color based on score
    scoreRingProgress.style.stroke = "url(#score-gradient)";

    function update(timestamp) {
      if (version !== scoreRenderVersion) return;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (easeOutQuad)
      const easeProgress = progress * (2 - progress);
      
      currentScore = Math.round(easeProgress * targetScore);
      scoreValue.textContent = currentScore;
      
      const offset = circumference - (easeProgress * targetScore / 100) * circumference;
      scoreRingProgress.style.strokeDashoffset = offset;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        scoreValue.textContent = targetScore;
      }
    }

    requestAnimationFrame(update);
  }

  // Update rating text and descriptive summary
  function updateRatingAndSummary(score, totalIssues, reviewComplete) {
    reviewStatus.classList.toggle("is-incomplete", !reviewComplete);
    reviewStatus.textContent = reviewComplete ? "Full review" : "Incomplete review";
    if (!reviewComplete) {
      ratingText.textContent = "Review incomplete";
      ratingText.style.color = "var(--warning)";
      summaryText.textContent = "No overall score is available. Findings below show the checks that completed.";
      return;
    }
    if (totalIssues === 0) {
      ratingText.textContent = "No detected issues";
      summaryText.textContent = "The current checks did not find a visible issue. This is not a guarantee that the page is perfect.";
      return;
    }

    if (score >= 90) {
      ratingText.textContent = "Strong foundation";
      ratingText.style.color = "var(--success)";
      summaryText.textContent = `We found ${totalIssues} improvement${totalIssues > 1 ? 's' : ''}, but the page has a strong visible foundation.`;
    } else if (score >= 75) {
      ratingText.textContent = "Clear opportunities";
      ratingText.style.color = "var(--info)";
      summaryText.textContent = `We found ${totalIssues} issue${totalIssues > 1 ? 's' : ''}. Start with the visible action path and any high-severity findings.`;
    } else if (score >= 50) {
      ratingText.textContent = "Good, but needs improvement";
      ratingText.style.color = "#4ade80";
      summaryText.textContent = `We found ${totalIssues} issue${totalIssues > 1 ? 's' : ''} on this live page.`;
    } else {
      ratingText.textContent = "Visitors may be dropping off";
      ratingText.style.color = "var(--danger)";
      summaryText.textContent = `We found ${totalIssues} major issue${totalIssues > 1 ? 's' : ''}. The visible offer, credibility, or next step is likely not doing enough work for a first-time visitor.`;
    }
  }

  function renderVerdict() {
    verdictPriorities.replaceChildren();
    verdictTitle.textContent = lastReviewComplete ? "One evidence-backed verdict" : "Review incomplete";
    verdictCopy.textContent = lastReview?.verdict || "The strategic review did not complete. Available checks are shown below.";
    for (const priority of lastReview?.priorities || []) {
      const item = document.createElement("li"); item.textContent = priority; verdictPriorities.append(item);
    }
    const reasons = document.getElementById("grading-reasons");
    reasons.replaceChildren();
    for (const c of lastReview?.criteria || []) {
      const item = document.createElement("p");
      item.textContent = c.category + " · " + c.label + ": " + (c.status === "assessed" ? c.grade + "/4" : c.status) + ". " + c.reason + " Evidence: " + c.evidence;
      reasons.append(item);
    }
  }

  function updateDashboardMeta() {
    const issueCount = lastFindings.length;
    issueTabCount.textContent = issueCount;
    issueTabCount.classList.toggle("hidden", issueCount === 0);
    issueSummary.textContent = `${issueCount} found`;
    const previewed = document.querySelectorAll(".finding-card.previewed, .finding-card.accepted").length;
    previewSummary.textContent = previewed ? `${previewed} change${previewed === 1 ? "" : "s"} selected` : "0 changes selected";
    lastScanned.textContent = lastReview?.provenance?.completedAt ? "Last scanned: " + new Date(lastReview.provenance.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Not scanned yet";
    saveSession();
    scanStateDot.classList.add("is-live");
    scanStateDot.title = "Current audit is shown";
  }

  function renderFindings(findings) {
    categoriesContainer.innerHTML = "";
    activeFilter = "All";

    const counts = { All: findings.length };
    SCORE_CATEGORIES.forEach(name => {
      counts[name] = findings.filter(finding => displayCategory(finding) === name).length;
    });
    renderChips(counts);

    if (findings.length === 0) {
      filterEmpty.classList.add("hidden");
      const perfectCard = document.createElement("div");
      perfectCard.className = "state-panel";
      perfectCard.style.padding = "16px";
      perfectCard.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom: 12px;">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <h4 style="font-size: 14px; font-weight: 700; color: var(--secondary);">No detected issues</h4>
        <p style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 0; max-width: 220px;">The available checks did not find a visible issue. That is not a guarantee that the page is fully optimized.</p>
      `;
      categoriesContainer.appendChild(perfectCard);
      return;
    }

    const severityRank = { High: 0, Medium: 1, Low: 2 };
    const sorted = findings
      .map((finding, index) => ({ finding, index }))
      .sort((a, b) => {
        const diff = severityRank[severityFor(a.finding)] - severityRank[severityFor(b.finding)];
        return diff !== 0 ? diff : a.index - b.index;
      });

    sorted.forEach(({ finding }) => {
      const card = document.createElement("div");
      card.className = "finding-card";
      card.setAttribute("data-issue-id", finding.id);
      const area = displayCategory(finding);
      const severity = severityFor(finding);
      // A preview is only honest when we have an exact, replaceable text change.
      // Structural and strategic advice belongs in the report, not behind a fake
      // Accept button that cannot change the source website.
      const canPreview = Boolean(finding.canPreview);
      const hasTarget = finding.hasElement === true;
      card.setAttribute("data-area", area);
      card.dataset.canPreview = canPreview ? "true" : "false";
      card.dataset.hasTarget = hasTarget ? "true" : "false";
      card.dataset.view = finding.view === "mobile" ? "mobile" : "desktop";

      const badgeHtml = finding.markerNumber
        ? `<span class="marker-badge">${finding.markerNumber}</span>`
        : `<span class="marker-badge page-wide">Page</span>`;
      const targetNote = hasTarget
        ? "Click this finding to show the exact item on the page."
        : "Page setting: this issue has no single on-page item to highlight.";

      card.innerHTML = `
        <div class="finding-card-header">
          ${badgeHtml}
          <span class="finding-view-tag">${finding.view === "mobile" ? "Phone width" : "Desktop"}</span>
          <span class="finding-title">${escapeHtml(finding.title)}</span>
          <span class="finding-area">${escapeHtml(area)}</span>
          <span class="severity-tag severity-${severity.toLowerCase()}">${severity}</span>
        </div>
        <p class="finding-proof-type">${finding.source === "ai" || finding.type === "ai_review" ? "Design recommendation" : "Checked page issue"}</p>
        <p class="finding-description">${escapeHtml(finding.description)}</p>
        <div class="fix-box">
          <span class="fix-label">What to do</span>
          <span class="fix-text">${escapeHtml(finding.fix)}</span>
          ${finding.suggestedText ? `<span class="fix-label">Suggested wording</span><span class="fix-text">${escapeHtml(finding.suggestedText)}</span>` : ""}
        </div>
        <p class="finding-target-note">${targetNote}</p>
        <div class="finding-actions ${canPreview ? "" : "hidden"}">
          <button type="button" class="finding-btn finding-btn-preview">Preview wording</button>
          <button type="button" class="finding-btn finding-btn-accept hidden">Accept</button>
          <button type="button" class="finding-btn finding-btn-reject hidden">Reject</button>
          <button type="button" class="finding-btn finding-btn-undo hidden">Undo</button>
        </div>
        <p class="finding-status hidden"></p>
        <p class="finding-detail hidden"></p>
      `;

      const previewBtn = card.querySelector(".finding-btn-preview");
      const acceptBtn = card.querySelector(".finding-btn-accept");
      const rejectBtn = card.querySelector(".finding-btn-reject");
      const undoBtn = card.querySelector(".finding-btn-undo");

      previewBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        previewBtn.disabled = true;
        if (finding.view === "mobile") await sendToBackground({ action: "focusMobileView", desktopTabId: auditTabId, mobileTabId });
        const response = await sendToPage({ action: "applyPreview", issueId: finding.id }, finding.view);
        if (response.success) {
          markPreviewed(card, response.statusLine, response.detail);
          sendToPage({ action: "highlight", issueId: finding.id }, finding.view);
        } else {
          previewBtn.disabled = false;
          showCardStatus(card, response.message || "This item is no longer on the page", true);
        }
      });

      acceptBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const ping = await sendToPage({ action: "ping" }, finding.view);
        if (!ping.success) { showCardStatus(card, "The page changed. Inspect it again.", true); return; }
        markAccepted(card);
      });

      rejectBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        rejectBtn.disabled = true;
        const response = await sendToPage({ action: "undoPreview", issueId: finding.id }, finding.view);
        rejectBtn.disabled = false;
        if (response.success) {
          markRejected(card);
        } else {
          showCardStatus(card, response.message || "This item is no longer on the page", true);
        }
      });

      undoBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        undoBtn.disabled = true;
        const response = await sendToPage({ action: "undoPreview", issueId: finding.id }, finding.view);
        undoBtn.disabled = false;
        if (response.success) {
          resetCard(card);
        } else {
          showCardStatus(card, response.message || "This item is no longer on the page", true);
        }
      });

      card.addEventListener("click", async () => {
        if (!hasTarget) return;
        document.querySelectorAll(".finding-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        if (finding.view === "mobile") {
          const focused = await sendToBackground({ action: "focusMobileView", desktopTabId: auditTabId, mobileTabId });
          if (!focused.success) { showCardStatus(card, focused.message, true); return; }
        }
        const response = await sendToPage({ action: "highlight", issueId: finding.id }, finding.view);
        if (!response.success) showCardStatus(card, "This item is no longer visible on the page. Rescan to update the audit.", true);
      });

      categoriesContainer.appendChild(card);
    });

    applyFilter();
  }

  function renderSuggestions(findings) {
    suggestionsContainer.replaceChildren();
    if (findings.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-copy";
      empty.textContent = "No changes are waiting. This page passed the checks currently available.";
      suggestionsContainer.appendChild(empty);
      return;
    }

    const severityRank = { High: 0, Medium: 1, Low: 2 };
    findings
      .map((finding, index) => ({ finding, index }))
      .sort((a, b) => severityRank[severityFor(a.finding)] - severityRank[severityFor(b.finding)] || a.index - b.index)
      .slice(0, 3)
      .forEach(({ finding }, index) => {
        const card = document.createElement("article");
        card.className = "suggestion-card";

        const number = document.createElement("span");
        number.className = "suggestion-number";
        number.textContent = String(index + 1);

        const copy = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = finding.title;
        const description = document.createElement("p");
        description.textContent = finding.fix;
        copy.append(title, description);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "suggestion-link";
        button.textContent = "Show this issue";
        button.addEventListener("click", () => selectFindingCard(finding.id));

        card.append(number, copy, button);
        suggestionsContainer.appendChild(card);
      });
  }

  function reportAudit() {
    return { url: lastPageUrl, review: lastReview, mobileReview: lastMobileReview, mobileStatus: lastMobileStatus, findings: lastFindings, after: afterReview, mobileAfter: afterMobileReview, afterStale };
  }
  function renderReport() {
    reportContent.replaceChildren();
    const summary = document.createElement("p");
    summary.textContent = "Desktop before: " + Reports.score(lastScore) + " · Phone-width before: " + Reports.score(lastMobileReview?.complete ? lastMobileReview.score : null) + " · After: " + (afterStale ? "Outdated" : Reports.score(afterComparison().score));
    const detail = document.createElement("details"), title = document.createElement("summary"), text = document.createElement("pre");
    title.textContent = "Full report and grading reasons"; text.style.whiteSpace = "pre-wrap";
    text.textContent = Reports.text([reportAudit()]); detail.append(title, text); reportContent.append(summary, detail);
  }

  function groupFindings(findings) {
    const groups = new Map();
    findings.forEach(finding => {
      // Repeated rule-based checks belong together. AI findings remain separate because
      // two different observations can share a category and severity.
      const identity = finding.source === "ai" || finding.type === "ai_review"
        ? finding.title
        : (finding.type || finding.title);
      const key = [displayCategory(finding), severityFor(finding), identity].join("|");
      if (!groups.has(key)) groups.set(key, { ...finding, count: 0, evidenceItems: [] });
      const group = groups.get(key);
      group.count += 1;
      if (finding.evidence && !group.evidenceItems.includes(finding.evidence)) group.evidenceItems.push(finding.evidence);
    });
    return [...groups.values()];
  }

  async function copyReport() {
    try { await navigator.clipboard.writeText(Reports.text([reportAudit()])); copyReportStatus.textContent = "Report copied."; }
    catch { copyReportStatus.textContent = "Could not copy. Expand the full report and copy its text."; }
    copyReportStatus.classList.remove("hidden");
  }
  function downloadCsv() { downloadBlob(new Blob([Reports.csv([reportAudit()])], { type: "text/csv;charset=utf-8" }), "website-inspection-report.csv"); }
  function downloadHtmlReport() { downloadBlob(new Blob([Reports.html([reportAudit()])], { type: "text/html;charset=utf-8" }), "website-inspection-report.html"); }
  function downloadBatchCsv() { downloadBlob(new Blob([Reports.csv(lastBatchResults)], { type: "text/csv;charset=utf-8" }), "five-site-audit.csv"); }
  function downloadBatchHtmlReport() { downloadBlob(new Blob([Reports.html(lastBatchResults)], { type: "text/html;charset=utf-8" }), "five-site-audit.html"); }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderChips(counts) {
    filterChips.innerHTML = "";
    ["All", ...SCORE_CATEGORIES].forEach(name => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "filter-chip" + (name === activeFilter ? " active" : "");
      chip.setAttribute("data-filter", name);
      const label = name === "All" ? "All Issues" : name;
      chip.innerHTML = `${label} <span class="chip-count">${counts[name] ?? 0}</span>`;
      chip.addEventListener("click", () => setFilter(name));
      filterChips.appendChild(chip);
    });
  }

  function setFilter(name) {
    activeFilter = name;
    filterChips.querySelectorAll(".filter-chip").forEach(chip => {
      chip.classList.toggle("active", chip.getAttribute("data-filter") === name);
    });
    applyFilter();
  }

  function applyFilter() {
    const cards = categoriesContainer.querySelectorAll(".finding-card");
    let visible = 0;
    cards.forEach(card => {
      const show = activeFilter === "All" || card.getAttribute("data-area") === activeFilter;
      card.classList.toggle("filter-hidden", !show);
      if (show) visible += 1;
    });
    filterEmpty.classList.toggle("hidden", cards.length === 0 || visible > 0);
  }

  function markPreviewed(card, statusLine, detail) {
    invalidateAfter();
    card.classList.add("previewed");
    card.classList.remove("accepted", "rejected");
    card.querySelector(".finding-btn-preview").classList.add("hidden");
    const acceptBtn = card.querySelector(".finding-btn-accept");
    acceptBtn.classList.remove("hidden");
    acceptBtn.disabled = false;
    const rejectBtn = card.querySelector(".finding-btn-reject");
    rejectBtn.classList.remove("hidden");
    rejectBtn.disabled = false;
    const undoBtn = card.querySelector(".finding-btn-undo");
    undoBtn.classList.remove("hidden");
    undoBtn.disabled = false;
    showCardStatus(card, statusLine || "Previewed on this page only.");
    const detailEl = card.querySelector(".finding-detail");
    detailEl.textContent = detail || "";
    detailEl.classList.toggle("hidden", !detail);
    updateDashboardMeta();
  }

  function markAccepted(card) {
    invalidateAfter();
    acceptedFindingIds.add(card.dataset.issueId);
    card.classList.add("accepted");
    card.classList.remove("previewed");
    card.querySelector(".finding-btn-preview").classList.add("hidden");
    card.querySelector(".finding-btn-accept").classList.add("hidden");
    card.querySelector(".finding-btn-reject").classList.remove("hidden");
    const undoBtn = card.querySelector(".finding-btn-undo");
    undoBtn.classList.remove("hidden");
    undoBtn.disabled = false;
    showCardStatus(card, "Accepted for this temporary preview. It resets when you refresh or restore the page.");
    renderComparison();
    renderReport(lastFindings, lastScore);
    updateDashboardMeta();
  }

  function markRejected(card) {
    invalidateAfter();
    acceptedFindingIds.delete(card.dataset.issueId);
    card.classList.add("rejected");
    card.classList.remove("accepted", "previewed");
    const previewBtn = card.querySelector(".finding-btn-preview");
    previewBtn.classList.remove("hidden");
    previewBtn.disabled = false;
    card.querySelector(".finding-btn-accept").classList.add("hidden");
    card.querySelector(".finding-btn-reject").classList.add("hidden");
    card.querySelector(".finding-btn-undo").classList.add("hidden");
    card.querySelector(".finding-detail").classList.add("hidden");
    showCardStatus(card, "Rejected. The original page is restored, and you can preview it again.");
    renderComparison();
    renderReport(lastFindings, lastScore);
    updateDashboardMeta();
  }

  function resetCard(card) {
    invalidateAfter();
    acceptedFindingIds.delete(card.dataset.issueId);
    card.classList.remove("accepted", "rejected", "previewed");
    const previewBtn = card.querySelector(".finding-btn-preview");
    const acceptBtn = card.querySelector(".finding-btn-accept");
    const rejectBtn = card.querySelector(".finding-btn-reject");
    const undoBtn = card.querySelector(".finding-btn-undo");
    if (card.dataset.canPreview === "true") {
      previewBtn.classList.remove("hidden");
    }
    acceptBtn.classList.add("hidden");
    rejectBtn.classList.add("hidden");
    undoBtn.classList.add("hidden");
    previewBtn.disabled = false;
    acceptBtn.disabled = false;
    rejectBtn.disabled = false;
    card.querySelector(".finding-actions").classList.remove("hidden");
    const status = card.querySelector(".finding-status");
    status.classList.add("hidden");
    status.classList.remove("is-error");
    status.textContent = "";
    card.querySelector(".finding-detail").classList.add("hidden");
    card.querySelector(".finding-detail").textContent = "";
    renderComparison();
    renderReport(lastFindings, lastScore);
    updateDashboardMeta();
  }

  function showCardStatus(card, message, isError) {
    const status = card.querySelector(".finding-status");
    status.textContent = message;
    status.classList.toggle("is-error", !!isError);
    status.classList.remove("hidden");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'\"]/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      "\"": "&quot;"
    }[char]));
  }

  function scanErrorMessage(error) {
    const message = String(error && error.message ? error.message : "");
    if (/connect|access|inject|permission/i.test(message)) {
      return "Chrome could not connect to this tab. Refresh the tab once, then open Inspector again.";
    }
    return "The inspection could not start. Refresh this tab once and try again.";
  }

  // Select and expand finding card when marker is clicked on page
  function selectFindingCard(issueId) {
    const card = document.querySelector(`.finding-card[data-issue-id="${issueId}"]`);
    if (!card) return;

    showPanelTab("issues");
    if (card.classList.contains("filter-hidden")) {
      setFilter("All");
    }

    // Mark card as selected
    document.querySelectorAll(".finding-card").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");

    // Scroll card into view in side panel
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Helper to switch between states (welcome, loading, results)
  async function applyVisibleSuggestions() {
    const cards = [...document.querySelectorAll(".finding-card[data-can-preview='true']:not(.accepted):not(.rejected):not(.previewed)")];
    for (const card of cards) card.querySelector(".finding-btn-preview")?.click();
  }

  function showState(state) {
    welcomeState.classList.add("hidden");
    resultsState.classList.remove("hidden");
    loadingState.classList.toggle("hidden", state !== "loading");
    if (state !== "results") {
      scanStateDot.classList.remove("is-live");
      scanStateDot.title = state === "loading" ? "Inspection in progress" : "Waiting to scan";
    }
  }

  // Helper to show error messages
  function showError(message) {
    showState("welcome");
    
    // Create temporary toast or alert
    const errorDiv = document.createElement("div");
    errorDiv.style.position = "absolute";
    errorDiv.style.bottom = "60px";
    errorDiv.style.left = "16px";
    errorDiv.style.right = "16px";
    errorDiv.style.backgroundColor = "#fee2e2";
    errorDiv.style.border = "1px solid var(--danger)";
    errorDiv.style.color = "#991b1b";
    errorDiv.style.padding = "12px";
    errorDiv.style.borderRadius = "8px";
    errorDiv.style.fontSize = "12px";
    errorDiv.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1)";
    errorDiv.style.zIndex = "100";
    errorDiv.style.animation = "slideDown 0.2s ease reverse";
    errorDiv.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 8px;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div>
          <strong style="font-weight: 700; display: block; margin-bottom: 2px;">Inspection Alert</strong>
          <span>${escapeHtml(message)}</span>
        </div>
      </div>
    `;

    document.body.appendChild(errorDiv);

    // Auto remove after 6 seconds
    setTimeout(() => {
      errorDiv.style.opacity = "0";
      errorDiv.style.transition = "opacity 0.3s ease";
      setTimeout(() => errorDiv.remove(), 300);
    }, 6000);
  }
});
