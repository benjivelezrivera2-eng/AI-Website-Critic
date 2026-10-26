(function (root) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const score = value => Number.isFinite(value) ? Math.round(value) + "/100" : "Not assessed";
  const csvCell = value => '"' + String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
  function lines(audit) {
    const r = audit.review || {}, p = r.provenance || {};
    const result = ["AI Website Inspector Report", "Page: " + audit.url,
      "Desktop score: " + score(r.complete ? r.score : null),
      "Phone-width score: " + (audit.mobileReview ? score(audit.mobileReview.complete ? audit.mobileReview.score : null) : "Not assessed"),
      "Review: " + (r.complete ? (p.source === "cached" ? "Saved AI review" : "Fresh AI review") : "Incomplete review"),
      "Model: " + (p.model || "Unavailable") + " | Completed: " + (p.completedAt || "Not completed") + " | Rubric: " + (r.rubricVersion || "Unavailable"),
      "Coverage: " + (p.scope || "Available page checks only") + "; screenshot: " + (p.screenshotIncluded ? "top viewport" : "unavailable"),
      "Verdict: " + (r.verdict || audit.message || "The strategic review did not complete."), "", "Priority improvements:", ...(r.priorities || []).map((x, i) => (i + 1) + ". " + x), "", "Grading reasons:"];
    for (const [category, value] of Object.entries(r.categoryScores || {})) result.push(category + ": " + score(value));
    for (const c of r.criteria || []) result.push(c.category + " / " + c.label + ": " + (c.status === "assessed" ? c.grade + "/4" : c.status) + ". " + c.reason + " Evidence: " + c.evidence);
    if (audit.mobileReview) {
      const m = audit.mobileReview;
      result.push("", "Phone-width review: " + score(m.complete ? m.score : null), "Viewport: " + (m.provenance?.viewport?.width || "Unknown") + " CSS pixels");
      for (const [category, value] of Object.entries(m.categoryScores || {})) result.push("Phone width / " + category + ": " + score(value));
      for (const c of m.criteria || []) result.push("Phone width / " + c.category + " / " + c.label + ": " + (c.status === "assessed" ? c.grade + "/4" : c.status) + ". " + c.reason + " Evidence: " + c.evidence);
    } else result.push("Phone-width status: " + (audit.mobileStatus || "Not assessed"));
    if (audit.omitAfter) { /* Nested After report has no second After section. */ }
    else if (audit.afterStale) result.push("After: outdated. Recheck changes before comparing scores.");
    else if (audit.after) {
      result.push("", "After reassessment: " + score(audit.after.complete ? audit.after.score : null));
      result.push(...lines({ url: audit.url, review: audit.after, mobileReview: audit.mobileAfter, findings: audit.after.findings || [], omitAfter: true }).slice(2));
      if (audit.mobileReview && !audit.mobileAfter) result.push("After phone-width reassessment: Not assessed");
    } else result.push("After: not reassessed. Accepting a suggestion does not award points.");
    result.push("", "Findings:");
    for (const [i, f] of (audit.findings || []).entries()) result.push((i + 1) + ". [" + (f.view === "mobile" ? "Phone width" : "Desktop") + " / " + f.category + " / " + (f.severity || "Low") + "] " + f.title + "\nAssessment: " + (f.source === "ai" ? "Design recommendation" : "Checked page issue") + "\nEvidence: " + (f.evidence || "Page-level check") + "\nWhy: " + f.description + "\nChange: " + f.fix);
    result.push("", "Temporary previews never publish changes. This is not a full-site SEO audit, accessibility certification, or measured conversion performance.");
    return result;
  }
  function text(audits) { return audits.map(a => lines(a).join("\n")).join("\n\n====================\n\n"); }
  function csv(audits) {
    const rows = [["Page", "Phase", "View", "Score", "Status", "Model", "Completed", "Rubric", "Type", "Category", "Item", "Grade", "Reason", "Evidence", "Recommendation"]];
    for (const a of audits) {
      for (const [phase, view, review] of [["Before", "Desktop", a.review], ["Before", "Phone width", a.mobileReview], [a.afterStale ? "After outdated" : "After", "Desktop", a.after], [a.afterStale ? "After outdated" : "After", "Phone width", a.mobileAfter]]) {
        if (phase.startsWith("After") && (!review || a.afterStale)) continue;
        if (view === "Phone width" && !review) {
          rows.push([a.url, phase, view, "", a.mobileStatus || "Not assessed", "", "", "", "summary", "", "Review status", "", a.mobileStatus || "Not assessed"]);
          continue;
        }
        const r = review || {}, p = r.provenance || {};
        const prefix = [a.url, phase, view, r.complete ? r.score : "", r.complete ? p.source : "incomplete", p.model, p.completedAt, r.rubricVersion];
        rows.push([...prefix, "summary", "", "Verdict", "", r.verdict || a.message || "Review incomplete", "Screenshot: " + Boolean(p.screenshotIncluded), (r.priorities || []).join(" | ")]);
        for (const [category, value] of Object.entries(r.categoryScores || {})) rows.push([...prefix, "category", category, category, value === null ? "" : Math.round(value)]);
        for (const c of r.criteria || []) rows.push([...prefix, "criterion", c.category, c.label, c.grade, c.reason, c.evidence, c.status]);
        if (phase === "Before") for (const f of (a.findings || []).filter(f => (f.view === "mobile" ? "Phone width" : "Desktop") === view)) rows.push([...prefix, f.source === "ai" ? "design recommendation" : "checked page issue", f.category, f.title, "", f.description, f.evidence, f.fix]);
      }
      if (a.afterStale) rows.push([a.url, "After", "", "outdated"]);
    }
    return rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  }
  function html(audits) {
    return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Website inspection report</title><style>body{font:15px/1.6 system-ui;max-width:900px;margin:40px auto;color:#172033;padding:20px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}section{break-after:page}h1{font-size:26px}@media print{body{margin:0;padding:0}}</style><h1>Website inspection report</h1><p>Use Chrome Print (Ctrl+P) to save as PDF.</p>' + audits.map(a => '<section><pre>' + escape(lines(a).join("\n")) + '</pre></section>').join("") + '</html>';
  }
  root.InspectorReporting = { text, csv, html, score };
})(globalThis);
