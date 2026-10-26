// AI Website Inspector - Content Script
// This script runs in the context of the web page to scan the DOM, place markers, and handle highlights.

const inspectorDocumentId = crypto.randomUUID();
let captureCleanup = null;
let suspendedPreviews = [];
let scannedIssues = [];
let previewCache = new Map();
let markersContainer = null;
let resizeObserver = null;
let previewPositionBound = false;
let markersVisible = true;
let markerCounter = 1;
let elementAnchorIds = new WeakMap();
let anchorElements = new Map();

// Inject CSS styles for markers and highlights
const styleId = "ai-inspector-styles";
if (!document.getElementById(styleId)) {
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    /* Marker styling */
    .ai-inspector-marker {
      position: absolute !important;
      z-index: 2147483647 !important; /* Maximum z-index to stay on top */
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 24px !important;
      height: 24px !important;
      border-radius: 50% !important;
      background-color: #e11d48 !important; /* Vibrant red-rose */
      color: #ffffff !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      font-size: 11px !important;
      font-weight: 800 !important;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15), 0 2px 4px -1px rgba(0, 0, 0, 0.1) !important;
      cursor: pointer !important;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s ease !important;
      pointer-events: auto !important;
      border: 2px solid #ffffff !important;
      box-sizing: border-box !important;
    }

    .ai-inspector-marker:hover {
      transform: scale(1.25) !important;
      background-color: #be123c !important;
    }

    /* Highlight effect for target elements */
    .ai-inspector-highlight {
      outline: 4px solid #6366f1 !important; /* Indigo outline */
      outline-offset: 2px !important;
      border-radius: 4px !important;
      transition: outline 0.2s ease !important;
    }

    /* Pulse animation for the marker when highlighted */
    @keyframes ai-marker-pulse {
      0% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.8), 0 4px 6px -1px rgba(0, 0, 0, 0.15);
      }
      50% {
        transform: scale(1.35);
        box-shadow: 0 0 0 12px rgba(99, 102, 241, 0), 0 4px 6px -1px rgba(0, 0, 0, 0.15);
        background-color: #6366f1 !important;
      }
      100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(99, 102, 241, 0), 0 4px 6px -1px rgba(0, 0, 0, 0.15);
      }
    }

    .ai-inspector-marker-pulse {
      animation: ai-marker-pulse 1.5s infinite !important;
      background-color: #6366f1 !important; /* Change to indigo during pulse */
    }

    .ai-inspector-outline-box {
      position: absolute !important;
      z-index: 2147483645 !important;
      border: 1.5px dashed var(--ai-inspector-color, #f97316) !important;
      border-radius: 12px !important;
      background: transparent !important;
      pointer-events: none !important;
      box-sizing: border-box !important;
    }
    .ai-inspector-popover {
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 280px !important;
      padding: 14px !important;
      border-radius: 12px !important;
      background: #121826 !important;
      color: #f8fafc !important;
      font-family: Inter, "Segoe UI", system-ui, sans-serif !important;
      box-shadow: 0 18px 40px rgba(0,0,0,.35) !important;
      box-sizing: border-box !important;
    }
    .ai-inspector-popover-top { display: flex !important; justify-content: space-between !important; align-items: center !important; margin-bottom: 8px !important; }
    .ai-inspector-popover-kicker { color: #cbd5e1 !important; font-size: 12px !important; font-weight: 700 !important; }
    .ai-inspector-popover-severity { border-radius: 999px !important; background: #3a2a10 !important; color: #fbbf24 !important; font-size: 10px !important; font-weight: 800 !important; padding: 3px 8px !important; }
    .ai-inspector-popover h3 { margin: 0 0 6px !important; font-size: 16px !important; }
    .ai-inspector-popover p { margin: 0 0 8px !important; color: #cbd5e1 !important; font-size: 13px !important; line-height: 1.4 !important; }
    .ai-inspector-popover strong { display: block !important; margin-bottom: 2px !important; color: #fff !important; font-size: 13px !important; }
    .ai-inspector-popover-actions { display: flex !important; gap: 8px !important; margin-top: 10px !important; }
    .ai-inspector-popover button { border-radius: 8px !important; padding: 8px 12px !important; cursor: pointer !important; font: inherit !important; }
    .ai-inspector-preview-fix { border: 0 !important; background: #6d4aff !important; color: #fff !important; }
    .ai-inspector-ignore { border: 1px solid #31445f !important; background: #1a2436 !important; color: #e2e8f0 !important; }

    .ai-inspector-alt-caption {
      position: absolute !important;
      z-index: 2147483647 !important;
      display: block !important;
      max-width: 280px !important;
      padding: 4px 8px !important;
      border-radius: 4px !important;
      background: #111827 !important;
      color: #ffffff !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      line-height: 1.3 !important;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15) !important;
      pointer-events: none !important;
      box-sizing: border-box !important;
    }
  `;
  document.head.appendChild(style);
}

// Listen for messages from the side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.documentId && request.documentId !== inspectorDocumentId) {
    sendResponse({ success: false, message: "The page changed. Inspect it again." }); return false;
  }
  if (request.action === "prepareCapture") {
    prepareCapture(request.acceptedIds).then(sendResponse).catch(error => { finishCapture(); sendResponse({ success: false, message: error.message }); }); return true;
  } else if (request.action === "finishCapture") {
    finishCapture(); sendResponse({ success: true });
  } else if (request.action === "collect") {
    const result = performScan(true); sendResponse({ success: true, ...result, documentId: inspectorDocumentId });
  } else if (request.action === "ping") {
    sendResponse({ success: true, documentId: inspectorDocumentId, url: location.href });
  } else if (request.action === "getPreviewIds") {
    sendResponse({ success: true, documentId: inspectorDocumentId, ids: [...previewCache.keys()] });
  } else if (request.action === "scan") {
    const result = performScan();
    sendResponse({ success: true, findings: result.findings, pageBrief: result.pageBrief, documentId: inspectorDocumentId });
  } else if (request.action === "mergeFindings") {
    sendResponse({ success: true, findings: mergeExternalFindings(request.findings || []) });
  } else if (request.action === "highlight") {
    const success = highlightIssue(request.issueId);
    sendResponse({ success: success });
  } else if (request.action === "clear") {
    restoreAllPreviews();
    clearMarkers();
    sendResponse({ success: true });
  } else if (request.action === "applyPreview") {
    sendResponse(applyPreview(request.issueId));
  } else if (request.action === "undoPreview") {
    sendResponse(undoPreview(request.issueId));
  } else if (request.action === "restoreAllPreviews") {
    sendResponse(restoreAllPreviews());
  } else if (request.action === "setMarkerVisibility") {
    markersVisible = request.visible !== false;
    if (markersContainer) markersContainer.style.display = markersVisible ? "block" : "none";
    sendResponse({ success: true });
  }
  return true; // Keep channel open for async response
});

// Clear existing markers and highlights
function clearMarkers() {
  document.getElementById("ai-inspector-popover")?.remove();
  // Remove markers container
  if (markersContainer) {
    markersContainer.remove();
    markersContainer = null;
  }

  // Remove highlight classes from elements
  document.querySelectorAll(".ai-inspector-highlight").forEach(el => {
    el.classList.remove("ai-inspector-highlight");
  });

  // Disconnect observers
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  window.removeEventListener("resize", repositionMarkers);
  window.removeEventListener("scroll", repositionMarkers);

  scannedIssues = [];
  markerCounter = 1;
  elementAnchorIds = new WeakMap();
  anchorElements = new Map();
}

// Perform the page scan
function performScan(collectOnly = false) {
  // A rescan must judge the original page, never one of Inspector's temporary
  // previews. This keeps before/after comparisons honest.
  if (!collectOnly) { restoreAllPreviews(); clearMarkers(); }

  const findings = [];
  if (!collectOnly) {
  markerCounter = 1;

  // Create container for markers
  markersContainer = document.createElement("div");
  markersContainer.id = "ai-inspector-markers-container";
  markersContainer.style.position = "absolute";
  markersContainer.style.top = "0";
  markersContainer.style.left = "0";
  markersContainer.style.width = "100%";
  markersContainer.style.height = "100%";
  markersContainer.style.pointerEvents = "none"; // Let clicks pass through except on markers
  markersContainer.style.zIndex = "2147483646";
  markersContainer.style.display = markersVisible ? "block" : "none";
  document.body.appendChild(markersContainer);
  }

  // Helper to add findings
  function addFinding(type, category, title, description, fix, element = null, targetLevel = null, severity = "", suggestedText = "") {
    const issueId = `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const anchorId = element ? anchorIdFor(element) : null;
    let markerNumber = null;

    if (element && !collectOnly) {
      // Check if element is visible/has dimensions
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        markerNumber = markerCounter++;
        createMarker(issueId, markerNumber, element);
      }
    }

    const finding = {
      id: issueId,
      type: type,
      category: category,
      title: title,
      description: description,
      fix: fix,
      anchorId: anchorId,
      markerNumber: markerNumber,
      hasElement: !!element,
      severity,
      evidence: findingEvidence(type, element),
      suggestedText,
      canPreview: Boolean(suggestedText && element && canReplaceText(element)),
      source: "rule"
    };

    findings.push(finding);

    // Store element reference locally in content script
    if (!collectOnly) scannedIssues.push({
      id: issueId,
      type: type,
      element: element,
      anchorId: anchorId,
      targetLevel: targetLevel,
      suggestedText,
      title,
      description,
      fix,
      severity,
      category,
      markerNumber,
      markerElement: element ? markersContainer.querySelector(`[data-issue-id="${issueId}"]`) : null,
      outlineElement: element ? markersContainer.querySelector(`[data-outline-id="${issueId}"]`) : null
    });
  }

  // 1. Scan for absent alt attributes. An explicit empty alt can be correct
  // for decorative images, so it is handled only when the image is functional.
  const images = document.querySelectorAll("img");
  const seenImageSources = new Set();
  images.forEach(img => {
    if (!isVisible(img)) return;
    // Skip tiny tracking pixels or decorative icons (width/height <= 12px)
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.width <= 12 && rect.height > 0 && rect.height <= 12) {
      return;
    }

    const source = img.currentSrc || img.src || "";
    if (!img.hasAttribute("alt") && !seenImageSources.has(source)) {
      seenImageSources.add(source);
      addFinding(
        "missing_alt",
        "Accessibility",
        "Image missing text description",
        "This image has no text alternative, so people using assistive technology may miss information it carries.",
        "Decide whether the image is informative. If it is, add a short description of its purpose; if it is decorative, use an intentional empty alt value.",
        img,
        null,
        "Medium"
      );
    }
  });

  // 2. Scan for H1 headings (Structure & Search Optimization)
  const h1s = [...document.querySelectorAll("h1")].filter(isVisible);
  if (h1s.length === 0) {
    addFinding(
      "missing_h1",
      "SEO",
      "Missing main page title",
      "Your page is missing a main title. Search engines use this title to understand the primary topic of your page, and it helps visitors immediately confirm they are in the right place.",
      "Add a single, clear main title at the top of your page using the primary heading style. It should summarize the main service or value proposition of this page.",
      null // Page-wide issue
    );
  }

  // 3. Scan for Skipped Heading Levels (Structure)
  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(isVisible);
  let lastLevel = 0;
  headings.forEach(heading => {
    const currentLevel = parseInt(heading.tagName.substring(1));
    if (lastLevel > 0 && currentLevel > lastLevel + 1) {
      addFinding(
        "skipped_heading",
        "Content",
        "Skipped heading size",
        `The section titles on your page skip sizes (jumping directly from a Heading ${lastLevel} to a Heading ${currentLevel}). This disrupts the logical flow for search engines and screen readers.`,
        `Organize your section titles sequentially. Ensure a Heading ${lastLevel + 1} is used before a Heading ${currentLevel}, creating a clear, book-like table of contents.`,
        heading,
        lastLevel + 1
      );
    }
    lastLevel = currentLevel;
  });

  // 4. Scan for Missing Meta Description (Search Optimization)
  const metaDesc = document.querySelector('meta[name="description" i]');
  if (!metaDesc || !metaDesc.getAttribute("content") || metaDesc.getAttribute("content").trim() === "") {
    addFinding(
      "missing_meta",
      "SEO",
      "Missing search engine description",
      "This page has no suggested search summary. Search engines may still create one, but the site gives up a useful chance to describe the offer clearly.",
      "Add a concise, specific summary that states the service, location or audience, and a reason to visit.",
      null,
      null,
      "Medium"
    );
  }

  // 5. Scan for Weak CTA Button Text (Action Buttons)
  const weakTexts = [
    "click here", "click", "submit", "learn more", "more", "go", 
    "button", "read more", "here", "info", "more info", "start", "continue"
  ];
  
  // Find buttons and links
  const ctaElements = document.querySelectorAll("button, input[type='button'], input[type='submit'], a");
  ctaElements.forEach(el => {
    if (!isVisible(el)) return;
    let text = "";
    if (el.tagName === "INPUT") {
      text = (el.value || "").trim();
    } else {
      text = (el.textContent || "").trim();
    }

    // Clean up text (remove extra spaces, icons, etc.)
    const cleanText = text.replace(/\s+/g, " ").toLowerCase();

    if (weakTexts.includes(cleanText)) {
      addFinding(
        "weak_cta",
        el.tagName === "A" ? "UX" : "Conversion",
        "Vague action button label",
        `Your button or link uses the vague text "${text}." Visitors are less likely to take action when buttons don't clearly state what happens next.`,
        "Replace this with wording that names the destination or result for this exact link.",
        el,
        null,
        "Low",
        suggestedCtaText(el)
      );
    }
  });

  // 6. Scan for missing or unclear form labels.
  document.querySelectorAll("input, select, textarea").forEach(control => {
    const type = (control.getAttribute("type") || "").toLowerCase();
    if (["hidden", "button", "submit", "reset", "image"].includes(type) || !isVisible(control)) return;
    if (!hasAccessibleLabel(control)) {
      addFinding(
        "missing_label",
        "Accessibility",
        "Form field missing a clear label",
        "People using assistive technology may not know what this field is for.",
        "Add a visible label or an accessible name that clearly describes this field.",
        control
      );
    }
  });

  // 7. Scan for empty links and buttons.
  document.querySelectorAll("a, button, input[type='button'], input[type='submit']").forEach(el => {
    if (!isVisible(el) || accessibleText(el)) return;
    const imageLink = el.tagName === "A" && el.querySelector("img");
    addFinding(
      imageLink ? "unlabeled_image_link" : "empty_control",
      "Accessibility",
      imageLink ? "Image link has no clear destination" : "Link or button has no clear name",
      imageLink
        ? "This image is the only content of a link, but its destination is not announced to screen-reader users."
        : "Visitors and screen-reader users cannot tell what this control does.",
      imageLink
        ? "Add text or an accessible label that describes the destination, such as ‘Home’ or ‘View the project photo.’"
        : "Add short, descriptive text or an accessible label.",
      el,
      null,
      imageLink ? "High" : "Low"
    );
  });

  // 8. Scan for missing or poor page titles and search descriptions.
  const titleText = cleanText(document.title, 200);
  if (!titleText) {
    addFinding("missing_title", "SEO", "Missing page title", "This page has no title for browser tabs or search results.", "Add a clear page title that names the service, topic, or offer.");
  }

  const viewport = document.querySelector('meta[name="viewport" i]');
  if (!viewport) {
    addFinding(
      "missing_viewport",
      "UX",
      "Mobile viewport setting is missing",
      "Mobile browsers may render this page zoomed out, making it harder to read and use on a phone.",
      "Add a standard mobile viewport setting so the layout can respond to the device width.",
      null,
      null,
      "Medium"
    );
  }

  // 9. Homepage and landing-page checks. These are deliberately narrow: they
  // only ask whether a first-time visitor can see a practical next step and,
  // for visibly local services, some reason to trust the business.
  // Strategic judgements belong to the evidence-backed rubric, not keyword regexes.

  if (!collectOnly) {
  // Setup event listeners for repositioning markers
  window.addEventListener("resize", repositionMarkers);
  window.addEventListener("scroll", repositionMarkers);

  // Also watch for DOM layout changes using ResizeObserver if available
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      repositionMarkers();
    });
    // Observe body to detect layout shifts
    resizeObserver.observe(document.body);
  }

  // Initial positioning
  setTimeout(repositionMarkers, 50);

  }
  return { findings, pageBrief: buildPageBrief() };
}

function addHomepageEffectivenessChecks(addFinding, ctaElements) {
  if (!isHomepageOrLandingPage()) return;

  const visibleActions = [...ctaElements].filter(isVisible).map(element => ({
    element,
    text: accessibleText(element).toLowerCase()
  })).filter(action => action.text);
  const mainHeading = [...document.querySelectorAll("h1")].find(isVisible) || null;
  const strongAction = /\b(get (?:a )?(?:free )?(?:quote|estimate)|request (?:a )?(?:quote|estimate)|schedule|book|call now|start (?:your|a)|free consultation)\b/i;
  const genericAction = /^(learn more|read more|more|contact|contact us|get in touch|click here|submit|explore)$/i;
  const primaryAction = visibleActions.find(action => strongAction.test(action.text));
  const genericActions = visibleActions.filter(action => genericAction.test(action.text));

  if (!primaryAction) {
    const target = genericActions[0]?.element || mainHeading || visibleActions[0]?.element || null;
    const severity = "High";
    addFinding(
      "unclear_primary_action",
      "Conversion",
      visibleActions.length ? "Primary action does not set expectations" : "No visible next step for a new visitor",
      visibleActions.length
        ? "The page has an action, but its wording does not clearly tell a visitor what they will receive or what happens next."
        : "A first-time visitor cannot see an obvious action to take after understanding the offer.",
      visibleActions.length
        ? "Use one prominent action that names the outcome, such as ‘Request a Site Estimate’ or ‘Schedule a Consultation.’"
        : "Add one prominent, benefit-specific action near the main offer, such as ‘Request a Site Estimate.’",
      target,
      null,
      severity
    );
  }

  const pageText = cleanText(document.body?.innerText || "", 30000).toLowerCase();
  const localService = /\b(construction|contractor|excavat(?:e|ing|ion)|roofing|plumbing|landscap(?:e|ing)|repair|remodel|electrician|hvac)\b/.test(pageText);
  if (!localService) return;

  const visibleTrustProof = /\b(licensed|insured|bonded|certified|bbb|\d{1,2}\+?\s+years|\d{1,3}\+?\s+(?:projects|reviews)|[1-5](?:\.\d)?\s*(?:\/\s*5|stars?)|testimonial|case stud(?:y|ies)|family[- ]owned|locally[- ]owned)\b/.test(pageText);
  if (!visibleTrustProof) {
    addFinding(
      "limited_local_trust_proof",
      "Content",
      "Limited visible trust proof for a local service",
      "The page appears to promote a local service, but the visible content does not show a clear credential, project proof, review, or experience signal.",
      "Add one truthful proof point near the main offer, such as licensing or insurance, years in business, a short client review, or completed-project evidence.",
      mainHeading || visibleActions[0]?.element || null,
      null,
      "Medium"
    );
  }

  const hasLocalSchema = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .some(script => /LocalBusiness|HomeAndConstructionBusiness|GeneralContractor/i.test(script.textContent || ""));
  if (!hasLocalSchema) {
    addFinding(
      "local_schema_opportunity",
      "SEO",
      "No local business structured data detected",
      "The page appears to represent a local service business, but no visible LocalBusiness structured-data block was detected.",
      "Add accurate LocalBusiness structured data with the business name, phone, address or service area, hours, and website URL.",
      mainHeading || visibleActions[0]?.element || null,
      null,
      "Low"
    );
  }
}

function suggestedCtaText(element) {
  const href = (element.getAttribute("href") || "").toLowerCase();
  const nearby = cleanText(element.closest("section, article, div")?.innerText || "", 240).toLowerCase();
  if (/team|about/.test(href) || /team|who we are/.test(nearby)) return "Learn more about our team";
  if (/service/.test(href) || /what we offer/.test(nearby)) return "Explore Our Services";
  if (/project|portfolio|gallery/.test(href) || /project showcase/.test(nearby)) return "View past projects";
  if (/contact|quote|estimate/.test(href)) return "Request a Quote";
  return "Explore Details";
}

function findingEvidence(type, element) {
  if (!element) {
    if (type === "missing_meta") return "No search description was found in the page settings.";
    if (type === "missing_h1") return "No visible main heading was found.";
    return "Page-wide check.";
  }
  if (element.tagName === "IMG") {
    const file = (element.currentSrc || element.src || "image").split("/").pop().split("?")[0];
    return `Image file: ${file}`;
  }
  const text = cleanText(accessibleText(element) || elementSummary(element), 180);
  if (element.tagName === "A") {
    const destination = cleanText(element.getAttribute("href") || "", 120);
    return text ? `Link: “${text}” → ${destination}` : `Unlabeled link → ${destination}`;
  }
  return text ? `Visible text: “${text}”` : `<${element.tagName.toLowerCase()}>`;
}

function isHomepageOrLandingPage() {
  try {
    const path = new URL(location.href).pathname.replace(/\/+$/, "") || "/";
    return path === "/" || !/\/(blog|news|privacy|terms|article|post)\b/i.test(path);
  } catch (error) {
    return true;
  }
}

function mergeExternalFindings(incoming) {
  if (!Array.isArray(incoming) || !markersContainer) return [];
  const added = [];
  const used = new Set();

  incoming.forEach(raw => {
    if (!raw || !["Accessibility", "SEO", "UX", "Content", "Conversion"].includes(raw.category)) return;
    if (!["High", "Medium", "Low"].includes(raw.severity)) return;
    const element = anchorElements.get(raw.targetAnchorId);
    const title = cleanText(raw.title, 100);
    const description = cleanText(raw.description, 420);
    const fix = cleanText(raw.fix, 420);
    const evidence = cleanText(raw.evidence, 240);
    if (!element || !title || !description || !fix || !evidence) return;
    const key = `${raw.targetAnchorId}|${raw.category}|${title.toLowerCase()}`;
    if (used.has(key)) return;
    used.add(key);

    const issueId = `issue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const markerNumber = isVisible(element) ? markerCounter++ : null;
    if (markerNumber) createMarker(issueId, markerNumber, element);
    const finding = {
      id: issueId,
      type: raw.type === "broken_link" ? "broken_link" : "ai_review",
      category: raw.category,
      severity: raw.severity,
      title,
      description,
      fix,
      evidence,
      suggestedText: cleanText(raw.suggestedText, 240),
      source: raw.source || "ai",
      markerNumber,
      hasElement: true,
      canPreview: Boolean(raw.suggestedText && canReplaceText(element))
    };
    scannedIssues.push({
      id: issueId,
      type: finding.type,
      element,
      anchorId: raw.targetAnchorId,
      suggestedText: finding.suggestedText,
      markerElement: markersContainer.querySelector(`[data-issue-id="${issueId}"]`)
    });
    added.push(finding);
  });

  setTimeout(repositionMarkers, 0);
  return added;
}

function anchorIdFor(element) {
  if (elementAnchorIds.has(element)) return elementAnchorIds.get(element);
  // IDs must not depend on the order rules happen to run. The document-order
  // position of this element type is stable for the same rendered page, which
  // lets a cached AI review keep pointing at the same live element.
  const tagName = (element.tagName || "element").toLowerCase();
  const sameTagElements = document.getElementsByTagName(tagName);
  const position = Array.prototype.indexOf.call(sameTagElements, element) + 1;
  const anchorId = `${tagName}-${Math.max(position, 1)}`;
  elementAnchorIds.set(element, anchorId);
  anchorElements.set(anchorId, element);
  return anchorId;
}

function buildPageBrief() {
  const elements = [];
  const selector = "h1,h2,h3,h4,h5,h6,p,li,button,a,input,textarea,select,label,img,section,main,article,form";
  const candidates = [...document.querySelectorAll(selector)].filter(el => isVisible(el) && !el.closest("#ai-inspector-markers-container, #ai-inspector-preview-layer, [contenteditable]"));
  candidates.forEach(element => {
    if (elements.length >= 350 || !isVisible(element) || element.closest("#ai-inspector-markers-container, #ai-inspector-preview-layer")) return;
    const text = elementSummary(element);
    if (!text && !["img", "form", "section", "main", "article"].includes(element.tagName.toLowerCase())) return;
    elements.push({
      id: anchorIdFor(element),
      kind: element.tagName.toLowerCase(),
      text: cleanText(text, 500),
      label: cleanText(getElementLabel(element), 240),
      href: element.tagName === "A" ? cleanText(element.href || "", 500) : "",
      alt: element.tagName === "IMG" ? cleanText(element.getAttribute("alt") || "", 240) : "",
      hasAlt: element.tagName === "IMG" ? element.hasAttribute("alt") : undefined,
      rect: (() => { const r = element.getBoundingClientRect(); return { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) }; })(),
      fontSize: getComputedStyle(element).fontSize,
      accessibleName: cleanText(accessibleText(element), 240)
    });
  });

  const links = elements.filter(element => element.kind === "a" && element.href).map(element => {
    let protocol = "";
    try { protocol = new URL(element.href).protocol; } catch (error) { /* ignored */ }
    return { anchorId: element.id, url: element.href, text: element.text, protocol };
  });
  const meta = document.querySelector('meta[name="description" i]');
  const visibleText = elements.filter(element => ["h1", "h2", "h3", "p", "li", "button", "a"].includes(element.kind)).map(element => element.text).filter(Boolean).join("\n");
  return {
    url: location.href,
    title: document.title || "",
    metaDescription: meta ? meta.getAttribute("content") || "" : "",
    visibleText: cleanText(visibleText, 24000),
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    coverage: { truncated: candidates.length > 350 || visibleText.length > 24000, imageCount: candidates.filter(e => e.tagName === "IMG").length, controlCount: candidates.filter(e => e.matches("a,button,input,textarea,select")).length },
    facts: { title: document.title, metaDescription: meta?.content || "", headingLevels: candidates.filter(e => /^H[1-6]$/.test(e.tagName)).map(e => ({ level: e.tagName, text: cleanText(e.textContent, 200) })), images: candidates.filter(e => e.tagName === "IMG").map(e => ({ id: anchorIdFor(e), hasAlt: e.hasAttribute("alt"), alt: e.getAttribute("alt") })), controls: candidates.filter(e => e.matches("a,button,input,textarea,select")).map(e => ({ id: anchorIdFor(e), name: accessibleText(e), labelled: e.matches("input,textarea,select") ? hasAccessibleLabel(e) : Boolean(accessibleText(e)) })), mobileLayout: { viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 4, smallTargets: candidates.filter(e => e.matches("a,button,input[type=submit]")).map(e => ({ id: anchorIdFor(e), width: Math.round(e.getBoundingClientRect().width), height: Math.round(e.getBoundingClientRect().height) })).filter(e => e.width < 24 || e.height < 24).slice(0, 30) } },
    elements,
    links
  };
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && !element.closest("[aria-hidden='true']") && (rect.width > 0 || rect.height > 0);
}

function accessibleText(element) {
  const labelled = (element.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => document.getElementById(id)?.textContent || "").join(" ").trim();
  const labels = element.labels ? [...element.labels].map(e => e.textContent).join(" ") : "";
  const text = element.matches("input,textarea,select") ? (element.matches("input[type=button],input[type=submit]") ? element.value : "") : elementSummary(element);
  const imageAlt = [...element.querySelectorAll("img")].map(e => e.alt || "").join(" ");
  return cleanText(labelled || element.getAttribute("aria-label") || labels || text || imageAlt || element.getAttribute("title") || "", 240);
}

function getElementLabel(element) {
  if (element.tagName === "IMG") return element.getAttribute("alt") || element.getAttribute("aria-label") || "";
  if (element.labels && element.labels.length) return [...element.labels].map(label => label.textContent || "").join(" ");
  return element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.getAttribute("name") || "";
}

function hasAccessibleLabel(control) {
  return Boolean(accessibleText(control));
}

function elementSummary(element) {
  if (element.tagName === "IMG") return element.getAttribute("alt") || element.getAttribute("src") || "";
  if (element.matches("input,textarea,select")) return element.matches("input[type=button],input[type=submit]") ? element.value : element.getAttribute("placeholder") || "";
  const clone = element.cloneNode(true);
  clone.querySelectorAll("input,textarea,select,[contenteditable],script,style,#ai-inspector-markers-container,#ai-inspector-preview-layer").forEach(e => e.remove());
  return clone.textContent || "";
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function canReplaceText(element) {
  if (!element || !element.isConnected) return false;
  if (element.matches("input,textarea,select,[contenteditable]")) return element.matches("input[type=button],input[type=submit]");
  if (element.querySelector("a,button,input,textarea,select,[contenteditable]")) return false;
  return editableTextNodes(element).length > 0;
}

function editableTextNodes(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue.trim() && !node.parentElement.closest("script,style,svg,[aria-hidden=true]")) nodes.push(node);
  }
  return nodes;
}

// Create a marker element on the page
const MARKER_COLORS = ["#ef4444", "#f97316", "#a855f7", "#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#fb923c", "#7c3aed", "#38bdf8"];
function markerColor(number) { return MARKER_COLORS[(Math.max(number, 1) - 1) % MARKER_COLORS.length]; }
function createMarker(issueId, number, element) {
  const color = markerColor(number);
  const outline = document.createElement("div");
  outline.className = "ai-inspector-outline-box";
  outline.setAttribute("data-outline-id", issueId);
  outline.style.setProperty("--ai-inspector-color", color);
  outline.style.borderColor = color;
  markersContainer.appendChild(outline);

  const marker = document.createElement("div");
  marker.className = "ai-inspector-marker";
  marker.setAttribute("data-issue-id", issueId);
  marker.textContent = number;
  marker.style.backgroundColor = color;

  marker.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const issue = scannedIssues.find(i => i.id === issueId);
    const target = issue && issue.element ? issue.element : element;
    if (target && target.isConnected) target.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightIssue(issueId);
    if (issue) showIssuePopover(issue);
    chrome.runtime.sendMessage({ action: "markerClicked", issueId }).catch(() => {});
  });

  markersContainer.appendChild(marker);
}

// Reposition all markers based on current element positions
function repositionMarkers() {
  if (!markersContainer) return;

  scannedIssues.forEach(issue => {
    if (issue.markerElement && issue.element) {
      const rect = issue.element.getBoundingClientRect();
      
      // If the element is hidden or has no size, hide the marker
      if (rect.width === 0 && rect.height === 0) {
        issue.markerElement.style.display = "none";
      } else {
        issue.markerElement.style.display = "flex";
        issue.markerElement.style.top = `${rect.top + window.scrollY - 12}px`;
        issue.markerElement.style.left = `${rect.left + window.scrollX - 12}px`;
        if (issue.outlineElement) {
          issue.outlineElement.style.display = "block";
          issue.outlineElement.style.top = `${rect.top + window.scrollY - 6}px`;
          issue.outlineElement.style.left = `${rect.left + window.scrollX - 6}px`;
          issue.outlineElement.style.width = `${rect.width + 12}px`;
          issue.outlineElement.style.height = `${rect.height + 12}px`;
        }
      }
    }
  });

  positionPreviewCaptions();
}

// Highlight a specific issue
function highlightIssue(issueId) {
  // Clear previous highlights
  document.querySelectorAll(".ai-inspector-highlight").forEach(el => {
    el.classList.remove("ai-inspector-highlight");
  });
  document.querySelectorAll(".ai-inspector-marker-pulse").forEach(el => {
    el.classList.remove("ai-inspector-marker-pulse");
  });

  const issue = scannedIssues.find(i => i.id === issueId);
  if (!issue) return false;

  // Highlight element
  if (issue.element) {
    issue.element.classList.add("ai-inspector-highlight");
    
    // Smooth scroll to element
    issue.element.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Pulse marker
  if (issue.markerElement) {
    issue.markerElement.classList.add("ai-inspector-marker-pulse");
    
    // Remove pulse after 4.5 seconds (3 cycles)
    setTimeout(() => {
      issue.markerElement.classList.remove("ai-inspector-marker-pulse");
    }, 4500);
  }

  showIssuePopover(issue);
  return true;
}

function showIssuePopover(issue) {
  document.getElementById("ai-inspector-popover")?.remove();
  if (!issue?.element?.isConnected) return;
  const why = {
    Accessibility: "People using keyboards, screen readers, or smaller screens can miss this.",
    SEO: "Search engines use this signal to understand the page.",
    UX: "Visitors decide quickly whether the page is clear enough to continue.",
    Content: "Unclear wording makes the offer harder to trust.",
    Conversion: "A weak next step gives visitors a reason to leave without acting."
  }[issue.category] || "This gets in the way of a first-time visitor finishing the page.";
  const pop = document.createElement("aside");
  pop.id = "ai-inspector-popover";
  pop.className = "ai-inspector-popover";
  pop.innerHTML = `<div class="ai-inspector-popover-top"><span class="ai-inspector-popover-kicker">Issue #${issue.markerNumber || ""}</span><span class="ai-inspector-popover-severity">${issue.severity || "Medium"}</span></div><h3></h3><p class="ai-inspector-pop-body"></p><p><strong>Why it matters</strong><span class="ai-inspector-pop-why"></span></p><p><strong>Suggestion</strong><span class="ai-inspector-pop-fix"></span></p><div class="ai-inspector-popover-actions"><button type="button" class="ai-inspector-preview-fix">Preview Fix</button><button type="button" class="ai-inspector-ignore">Ignore</button></div>`;
  pop.querySelector("h3").textContent = issue.title || "Issue";
  pop.querySelector(".ai-inspector-pop-body").textContent = issue.description || "";
  pop.querySelector(".ai-inspector-pop-why").textContent = why;
  pop.querySelector(".ai-inspector-pop-fix").textContent = issue.fix || "";
  pop.querySelector(".ai-inspector-preview-fix").addEventListener("click", (event) => {
    event.stopPropagation();
    if (issue.suggestedText || issue.element) applyPreview(issue.id);
  });
  pop.querySelector(".ai-inspector-ignore").addEventListener("click", (event) => {
    event.stopPropagation();
    pop.remove();
    chrome.runtime.sendMessage({ action: "markerIgnored", issueId: issue.id }).catch(() => {});
  });
  document.body.appendChild(pop);
  const rect = issue.element.getBoundingClientRect();
  const top = Math.min(window.innerHeight - pop.offsetHeight - 12, Math.max(12, rect.bottom + 10));
  const left = Math.min(window.innerWidth - pop.offsetWidth - 12, Math.max(12, rect.left));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

const CTA_REPLACEMENTS = {
  "click here": "Get Your Free Quote",
  "click": "Get Your Free Quote",
  "submit": "Send My Request",
  "learn more": "Explore Our Services",
  "more": "Explore Our Services",
  "read more": "Read the Full Story",
  "here": "View the Details",
  "info": "View the Details",
  "more info": "View the Details",
  "go": "Continue to Next Step",
  "continue": "Continue to Next Step",
  "button": "Get Started",
  "start": "Get Started"
};

const FALLBACK_ALT = "Photo from this page";
const FALLBACK_SUMMARY = "A clear summary of this page for people who find it in search.";
const MISSING_MESSAGE = "This item is no longer on the page";

function applyPreview(issueId) {
  if (previewCache.has(issueId)) {
    return cachedPreviewResult(issueId);
  }

  const issue = scannedIssues.find(i => i.id === issueId);
  if (!issue) return { success: false, message: MISSING_MESSAGE };

  if (issue.element && scannedIssues.some(other => other.id !== issueId && other.element === issue.element && previewCache.has(other.id))) {
    return { success: false, message: "Undo the other preview on this same item before trying this suggestion." };
  }

  if (issue.suggestedText) {
    return applySuggestedText(issue);
  }

  switch (issue.type) {
    case "weak_cta":
      return applyWeakCta(issue);
    case "missing_alt":
      return applyMissingAlt(issue);
    case "multiple_h1":
      return applyMultipleH1(issue);
    case "skipped_heading":
      return applySkippedHeading(issue);
    case "missing_h1":
      return applyMissingH1(issue);
    case "missing_meta":
      return applyMissingMeta(issue);
    default:
      return { success: false, message: MISSING_MESSAGE };
  }
}

function undoPreview(issueId) {
  const entry = previewCache.get(issueId);
  if (!entry) return { success: false, message: MISSING_MESSAGE };

  try {
    entry.undo();
  } catch (err) {
    // The page redrew the element. Drop the snapshot so Restore can finish.
  }

  previewCache.delete(issueId);
  positionPreviewCaptions();
  return { success: true };
}

function restoreAllPreviews() {
  [...previewCache.keys()].forEach(issueId => undoPreview(issueId));
  return { success: true };
}

function cachedPreviewResult(issueId) {
  const issue = scannedIssues.find(i => i.id === issueId);
  if (issue && issue.type === "missing_meta") {
    const meta = document.querySelector('meta[name="description" i]');
    return {
      success: true,
      statusLine: "Applied on this page only.",
      detail: meta ? (meta.getAttribute("content") || "") : ""
    };
  }
  return { success: true, statusLine: "Shown on this page only", detail: "" };
}

function shownResult() {
  return { success: true, statusLine: "Shown on this page only", detail: "" };
}

function applySuggestedText(issue) {
  const el = issue.element;
  if (!el || !el.isConnected || !canReplaceText(el)) {
    return { success: false, message: "This suggestion needs manual editing on the website." };
  }
  const next = issue.suggestedText;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const original = el.value;
    el.value = next;
    previewCache.set(issue.id, { undo() { el.value = original; } });
    return { success: true, statusLine: "Previewed on this page only.", detail: next };
  }

  const textNodes = editableTextNodes(el);
  const original = textNodes.map(node => node.nodeValue);
  textNodes[0].nodeValue = next;
  textNodes.slice(1).forEach(node => { node.nodeValue = ""; });
  previewCache.set(issue.id, {
    undo() { textNodes.forEach((node, index) => { node.nodeValue = original[index]; }); }
  });
  return { success: true, statusLine: "Previewed on this page only.", detail: next };
}

function applyWeakCta(issue) {
  const el = issue.element;
  if (!el || !el.isConnected) return { success: false, message: MISSING_MESSAGE };

  const isInput = el.tagName === "INPUT";
  const raw = isInput ? (el.value || "") : (el.textContent || "");
  const clean = raw.replace(/\s+/g, " ").trim().toLowerCase();
  const next = CTA_REPLACEMENTS[clean];
  if (!next) return { success: false, message: MISSING_MESSAGE };

  if (isInput) el.value = next;
  else el.textContent = next;

  previewCache.set(issue.id, {
    undo() {
      if (isInput) el.value = raw;
      else el.textContent = raw;
    }
  });

  return shownResult();
}

function applyMissingAlt(issue) {
  const img = issue.element;
  if (!img || !img.isConnected) return { success: false, message: MISSING_MESSAGE };

  const hadAlt = img.hasAttribute("alt");
  const originalAlt = hadAlt ? img.getAttribute("alt") : null;
  const text = altTextForImage(img);
  img.setAttribute("alt", text);

  const caption = document.createElement("div");
  caption.className = "ai-inspector-alt-caption";
  caption.setAttribute("data-issue-id", issue.id);
  caption.textContent = text;
  previewLayer().appendChild(caption);

  previewCache.set(issue.id, {
    image: img,
    caption: caption,
    undo() {
      if (hadAlt) img.setAttribute("alt", originalAlt);
      else img.removeAttribute("alt");
      caption.remove();
    }
  });

  ensurePreviewPositioning();
  positionPreviewCaptions();
  return shownResult();
}

function applyMultipleH1(issue) {
  const el = issue.element;
  if (!el || !el.isConnected) return { success: false, message: MISSING_MESSAGE };
  if (document.querySelector("h1") === el) {
    return { success: false, message: "The first main title stays as it is." };
  }

  const replacement = swapHeading(el, "h2");
  syncIssueElement(issue.id, replacement);

  previewCache.set(issue.id, {
    undo() {
      const restored = restoreHeading(el, replacement);
      syncIssueElement(issue.id, restored);
    }
  });

  return shownResult();
}

function applySkippedHeading(issue) {
  const el = issue.element;
  if (!el || !el.isConnected) return { success: false, message: MISSING_MESSAGE };

  const level = issue.targetLevel;
  if (!level || level < 1 || level > 6) return { success: false, message: MISSING_MESSAGE };

  const replacement = swapHeading(el, "h" + level);
  syncIssueElement(issue.id, replacement);

  previewCache.set(issue.id, {
    undo() {
      const restored = restoreHeading(el, replacement);
      syncIssueElement(issue.id, restored);
    }
  });

  return shownResult();
}

function applyMissingH1(issue) {
  const title = (document.title || "").trim() || "Main page title";
  const h1 = document.createElement("h1");
  h1.setAttribute("data-ai-inspector-preview", issue.id);
  h1.textContent = title;

  const anchor = firstContentChild();
  if (anchor) document.body.insertBefore(h1, anchor);
  else document.body.appendChild(h1);

  issue.element = h1;
  previewCache.set(issue.id, {
    undo() {
      h1.remove();
      const current = scannedIssues.find(i => i.id === issue.id);
      if (current && current.element === h1) current.element = null;
    }
  });

  return shownResult();
}

function applyMissingMeta(issue) {
  const sentence = searchSummarySentence();
  let meta = document.querySelector('meta[name="description" i]');
  let created = false;
  let previous = null;

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    (document.head || document.documentElement).appendChild(meta);
    created = true;
  } else {
    previous = meta.getAttribute("content");
  }

  meta.setAttribute("content", sentence);
  previewCache.set(issue.id, {
    undo() {
      if (!meta.isConnected) return;
      if (created) meta.remove();
      else if (previous === null) meta.removeAttribute("content");
      else meta.setAttribute("content", previous);
    }
  });

  return {
    success: true,
    statusLine: "Applied on this page only.",
    detail: sentence
  };
}

function swapHeading(current, newTag) {
  const next = document.createElement(newTag);
  [...current.attributes].forEach(attr => next.setAttribute(attr.name, attr.value));
  while (current.firstChild) next.appendChild(current.firstChild);
  current.replaceWith(next);
  return next;
}

function restoreHeading(original, replacement) {
  const highlighted = replacement.classList.contains("ai-inspector-highlight");
  while (replacement.firstChild) original.appendChild(replacement.firstChild);
  if (replacement.isConnected) replacement.replaceWith(original);
  if (highlighted) original.classList.add("ai-inspector-highlight");
  return original;
}

function syncIssueElement(issueId, element) {
  const issue = scannedIssues.find(i => i.id === issueId);
  if (issue) issue.element = element;
}

function altTextForImage(img) {
  const src = img.currentSrc || img.getAttribute("src") || "";
  let name = "";
  try {
    name = new URL(src, document.baseURI).pathname.split("/").pop() || "";
  } catch (err) {
    name = src.split("/").pop() || "";
  }
  name = name.split("?")[0].replace(/\.[a-z0-9]+$/i, "");
  const cleaned = name.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!/[a-z]{3,}/i.test(cleaned)) return FALLBACK_ALT;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function searchSummarySentence() {
  const paragraphs = document.querySelectorAll("p");
  for (const paragraph of paragraphs) {
    if (paragraph.closest("#ai-inspector-markers-container")) continue;
    const text = (paragraph.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const rect = paragraph.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    return trimToAbout160(text);
  }
  return FALLBACK_SUMMARY;
}

function trimToAbout160(text) {
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim();
}

function firstContentChild() {
  for (const child of document.body.children) {
    if (child.id === "ai-inspector-markers-container") continue;
    if (child.id === "ai-inspector-preview-layer") continue;
    if (child.classList && child.classList.contains("ai-inspector-alt-caption")) continue;
    return child;
  }
  return null;
}

function previewLayer() {
  let layer = document.getElementById("ai-inspector-preview-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "ai-inspector-preview-layer";
    layer.style.position = "absolute";
    layer.style.top = "0";
    layer.style.left = "0";
    layer.style.width = "100%";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "2147483647";
    document.body.appendChild(layer);
  }
  return layer;
}

function ensurePreviewPositioning() {
  if (previewPositionBound) return;
  previewPositionBound = true;
  window.addEventListener("resize", positionPreviewCaptions);
  window.addEventListener("scroll", positionPreviewCaptions, true);
}

function positionPreviewCaptions() {
  previewCache.forEach(entry => {
    if (!entry.caption) return;
    const img = entry.image;
    if (!img || !img.isConnected) {
      entry.caption.style.display = "none";
      return;
    }
    const rect = img.getBoundingClientRect();
    entry.caption.style.display = "block";
    entry.caption.style.top = `${rect.bottom + window.scrollY - 28}px`;
    entry.caption.style.left = `${Math.max(rect.left + window.scrollX, 8)}px`;
  });
}

// Capture transaction. The watchdog restores UI even if the worker disappears.
async function prepareCapture(acceptedIds) {
  if (captureCleanup) throw new Error("An audit is already capturing this page.");
  if ([...document.querySelectorAll('input[type=password]')].some(isVisible) ||
      /\/(account|dashboard|checkout|login|signin)(\/|$)/i.test(location.pathname) ||
      [...document.querySelectorAll("a,button")].some(e => /^(log out|logout|sign out)$/i.test(e.textContent.trim()) && isVisible(e))) {
    throw new Error("Private or signed-in pages are outside this public-page demo.");
  }
  const x = scrollX, y = scrollY;
  const overlays = [...document.querySelectorAll("#ai-inspector-markers-container,#ai-inspector-preview-layer")].map(e => [e, e.style.visibility]);
  const highlighted = [...document.querySelectorAll(".ai-inspector-highlight")];
  const masks = [];
  let timer;
  captureCleanup = () => {
    clearTimeout(timer);
    masks.forEach(e => e.remove());
    overlays.forEach(([e, value]) => { e.style.visibility = value; });
    highlighted.forEach(e => e.classList.add("ai-inspector-highlight"));
    for (const id of suspendedPreviews) applyPreview(id);
    suspendedPreviews = [];
    window.scrollTo({ left: x, top: y, behavior: "instant" });
  };
  timer = setTimeout(finishCapture, 15000);
  if (Array.isArray(acceptedIds)) {
    const accepted = new Set(acceptedIds);
    suspendedPreviews = [...previewCache.keys()].filter(id => !accepted.has(id));
    suspendedPreviews.forEach(id => undoPreview(id));
  }
  overlays.forEach(([e]) => { e.style.visibility = "hidden"; });
  highlighted.forEach(e => e.classList.remove("ai-inspector-highlight"));
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  await new Promise(resolve => setTimeout(resolve, 350));
  // Opaque masks prevent values inside editable fields and embedded frames from leaving the browser.
  document.querySelectorAll("input:not([type=submit]):not([type=button]),textarea,select,[contenteditable],iframe").forEach(e => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    const mask = document.createElement("div");
    mask.dataset.inspectorMask = "true";
    Object.assign(mask.style, { position: "absolute", left: (r.left + scrollX) + "px", top: (r.top + scrollY) + "px", width: r.width + "px", height: r.height + "px", background: "#777", zIndex: "2147483647", pointerEvents: "none" });
    document.body.append(mask); masks.push(mask);
  });
  return { success: true, documentId: inspectorDocumentId, url: location.href };
}
function finishCapture() {
  const cleanup = captureCleanup; captureCleanup = null;
  if (cleanup) cleanup();
}
