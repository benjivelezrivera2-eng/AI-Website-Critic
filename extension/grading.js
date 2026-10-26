/* Shared, side-effect-free grading contract used by helper, worker and panel. */
(function (root) {
  const VERSION = "rubric-2";
  const WEIGHTS = { Conversion: .35, UX: .30, Content: .15, SEO: .10, Accessibility: .10 };
  const CRITERIA = [
    ["action", "Conversion", "Clear, relevant next action"],
    ["trust", "Conversion", "Relevant supporting trust evidence"],
    ["path", "Conversion", "Understandable enquiry or purchase path"],
    ["hierarchy", "UX", "Visual hierarchy"],
    ["readability", "UX", "Readability and spacing"],
    ["navigation", "UX", "Navigation and section flow"],
    ["offer", "Content", "Specific offer"],
    ["audience", "Content", "Recognizable intended audience"],
    ["detail", "Content", "Useful supporting detail"],
    ["title", "SEO", "Descriptive page title"],
    ["description", "SEO", "Useful search description"],
    ["outline_links", "SEO", "Page outline and crawlable internal links"],
    ["names", "Accessibility", "Control names and form labels"],
    ["alternatives", "Accessibility", "Appropriate image alternatives"],
    ["semantics", "Accessibility", "Semantic heading structure"]
  ].map(([id, category, label]) => ({ id, category, label }));
  const MOBILE_CRITERIA = [
    ["mobile_fit", "UX", "Content fits a phone width without horizontal overflow"],
    ["mobile_navigation", "UX", "Navigation is usable at phone width"],
    ["mobile_readability", "UX", "Text remains readable and well spaced"],
    ["mobile_tap", "Accessibility", "Controls have usable touch targets"],
    ["mobile_action", "Conversion", "Next action remains visible and usable"]
  ].map(([id, category, label]) => ({ id, category, label }));
  const definitions = view => view === "mobile" ? [...CRITERIA, ...MOBILE_CRITERIA] : CRITERIA;
  const clean = value => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  // References are resolved locally, never trusted as model-authored quotations.
  function evidenceCatalog(brief) {
    const rows = [];
    for (const field of ["title", "metaDescription"]) if (clean(brief[field])) rows.push({ ref: "page:" + field, evidenceKind: "text", evidence: clean(brief[field]).slice(0, 600), targetIds: [] });
    for (const e of brief.elements || []) {
      const evidence = clean([e.text, e.label, e.alt].join(" ")).slice(0, 300);
      if (evidence) rows.push({ ref: "text:" + e.id, evidenceKind: "text", evidence, targetIds: [e.id] });
    }
    for (const [key, value] of Object.entries(brief.facts || {})) {
      if (Array.isArray(value) && value.length) value.forEach((v, i) => rows.push({ ref: `fact:${key}:${i}`, evidenceKind: "technical", evidence: clean(JSON.stringify(v)).slice(0, 1000), targetIds: (brief.elements || []).some(e => e.id === v?.id) ? [v.id] : [] }));
      else rows.push({ ref: "fact:" + key, evidenceKind: "technical", evidence: clean(JSON.stringify({ [key]: value })).slice(1, -1).slice(0, 1000), targetIds: [] });
    }
    return rows;
  }
  function calculate(criteria = [], view = "desktop") {
    const requiredCriteria = definitions(view);
    const categoryScores = {};
    let complete = criteria.length === requiredCriteria.length;
    for (const category of Object.keys(WEIGHTS)) {
      const required = requiredCriteria.filter(c => c.category === category);
      const items = required.map(c => criteria.filter(x => x.id === c.id));
      const valid = items.every(rows => rows.length === 1 && (rows[0].status === "not_applicable" ||
        (rows[0].status === "assessed" && Number.isInteger(rows[0].grade) && rows[0].grade >= 0 && rows[0].grade <= 4)));
      const assessed = items.flat().filter(x => x.status === "assessed");
      categoryScores[category] = valid && assessed.length ? assessed.reduce((n, x) => n + x.grade, 0) / assessed.length * 25 : null;
      if (categoryScores[category] === null) complete = false;
    }
    return { categoryScores, score: complete ? Math.round(Object.entries(WEIGHTS).reduce((n, [c, w]) => n + categoryScores[c] * w, 0)) : null, complete };
  }
  function validateReview(raw, brief, hasScreenshot, view = "desktop") {
    const elements = new Map((brief.elements || []).map(e => [e.id, e]));
    const pageText = clean([brief.title, brief.metaDescription, brief.visibleText].join(" "));
    const errors = [];
    const diagnostics = [];
    const catalog = new Map(evidenceCatalog(brief).map(e => [e.ref, e]));
    const criteria = definitions(view).map(def => {
      const matches = (Array.isArray(raw?.criteria) ? raw.criteria : []).filter(c => c.id === def.id);
      let item = matches[0];
      let reason = "This criterion could not be assessed from validated evidence.";
      const invalid = (problem = "Missing/duplicate criterion or invalid grade/status/evidence.") => { errors.push(def.id); diagnostics.push({ id: def.id, problem, proposedKind: item?.evidenceKind, proposedGrade: item?.grade, proposedEvidence: clean(item?.evidence).slice(0, 300), proposedTargets: Array.isArray(item?.targetIds) ? item.targetIds.slice(0, 5) : [] }); return { ...def, status: "unassessed", grade: null, reason: reason + " Evidence check: " + problem, evidence: "", evidenceKind: "technical", targetIds: [] }; };
      if (matches.length !== 1 || !item || !clean(item.reason)) return invalid();
      reason = clean(item.reason).slice(0, 800);
      if (item.status === "unassessed") return { ...def, status: "unassessed", grade: null, reason, evidence: "", evidenceKind: "technical", targetIds: [] };
      if (item.evidenceRef) {
        const cited = catalog.get(item.evidenceRef);
        if (!cited) return invalid("Unknown evidence reference.");
        item = { ...item, evidence: cited.evidence, evidenceKind: cited.evidenceKind, targetIds: cited.targetIds };
      }
      const ids = item.targetIds;
      if (!Array.isArray(ids) || ids.some(id => !elements.has(id))) return invalid("Target ID does not exist in the inspected page.");
      const evidence = clean(item.evidence).slice(0, 1200);
      if (!evidence) return invalid();
      if (item.status === "not_applicable") {
        const allowed = (def.id === "alternatives" && brief.coverage?.imageCount === 0) ||
          (def.id === "names" && brief.coverage?.controlCount === 0);
        return allowed ? { ...def, status: "not_applicable", grade: null, reason, evidence, evidenceKind: "technical", targetIds: ids } : invalid();
      }
      if (item.status !== "assessed" || !Number.isInteger(item.grade) || item.grade < 0 || item.grade > 4) return invalid();
      const kind = item.evidenceKind;
      if (!["text", "visual", "absence", "technical"].includes(kind)) return invalid();
      if (["hierarchy", "readability", ...MOBILE_CRITERIA.map(c => c.id)].includes(def.id) && kind !== "visual") return invalid("This criterion requires screenshot-based visual evidence, not a text or fact reference.");
      if ((["hierarchy", "readability", ...MOBILE_CRITERIA.map(c => c.id)].includes(def.id) || kind === "visual") && !hasScreenshot) return invalid();
      if (kind === "visual" && (!ids.length || !/screenshot/i.test(evidence) || ids.some(id => {
        const r = elements.get(id).rect;
        const outside = r && brief.viewport && (r.y >= brief.viewport.height || r.x >= brief.viewport.width || r.y + r.height <= 0 || r.x + r.width <= 0);
        // For the phone CTA check, an actual CTA below the first screen can
        // support a negative visibility grade when the screenshot confirms it.
        const negativeVisibility = view === "mobile" && item.grade <= 2 && (
          (["mobile_action", "path"].includes(def.id) && r?.y >= brief.viewport?.height && /below|not visible|outside|off.screen|deep scroll/i.test(evidence)) ||
          (brief.facts?.mobileLayout?.horizontalOverflow === true && r?.x >= brief.viewport?.width && /outside|not visible|off.screen|horizontal|overflow|clipp|distortion|shifted|displaced/i.test(evidence))
        );
        return outside && !negativeVisibility;
      }))) return invalid("Visual evidence must name the screenshot and target an element within its viewport.");
      if (kind === "text") {
        const corpus = ids.length ? clean(ids.map(id => { const e = elements.get(id); return [e.text, e.label, e.alt].join(" "); }).join(" ")) : pageText;
        if (!corpus.includes(evidence)) return invalid("Quotation does not match the cited target. Use a supplied text evidenceRef.");
      }
      if (kind === "absence" && (brief.coverage?.truncated !== false || !/captured|supplied|inspected/i.test(evidence) || item.grade === 4)) return invalid();
      // Technical observations cite exact machine observations, not invented assertions.
      if (kind === "technical" && !clean(JSON.stringify(brief.facts || {})).includes(evidence)) return invalid("Technical evidence does not match collected facts. Use a supplied fact evidenceRef.");
      return { ...def, status: "assessed", grade: item.grade, reason, evidence, evidenceKind: kind, targetIds: ids };
    });
    const result = calculate(criteria, view);
    const complete = result.complete && hasScreenshot && Boolean(clean(raw?.verdict));
    return { rubricVersion: VERSION, view, criteria, ...result, complete, score: complete ? result.score : null,
      verdict: clean(raw?.verdict).slice(0, 1200), priorities: Array.isArray(raw?.priorities) ? raw.priorities.filter(x => typeof x === "string").map(x => clean(x).slice(0, 600)).slice(0, 3) : [], validationErrors: errors, validationDiagnostics: diagnostics };
  }
  function isPublicUrl(value) {
    try {
      const u = new URL(value); const h = u.hostname.toLowerCase();
      return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password &&
        !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[|172\.(1[6-9]|2\d|3[01])\.)/.test(h) && h.includes(".") && !/\.(local|internal|localhost)$/.test(h);
    } catch { return false; }
  }
  root.InspectorGrading = { VERSION, WEIGHTS, CRITERIA, MOBILE_CRITERIA, calculate, validateReview, evidenceCatalog, isPublicUrl };
})(globalThis);
