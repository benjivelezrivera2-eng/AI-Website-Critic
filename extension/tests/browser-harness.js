document.getElementById("run-tests").addEventListener("click", async () => {
  const output = document.getElementById("test-results"); output.textContent = "Running";
  const results = [];
  const assert = (ok, name) => { if (!ok) throw new Error(name); results.push("PASS " + name); };
  const call = message => new Promise(resolve => inspectorListeners[0](message, {}, resolve));
  try {
    const baseline = await call({ action: "scan" });
    assert(baseline.success, "Baseline scan completes");
    assert(!baseline.findings.some(f => f.type === "multiple_h1"), "Multiple H1s alone do not trigger an SEO complaint");
    assert(!baseline.findings.some(f => f.type === "poor_meta" || f.type === "poor_title"), "Length-only metadata complaints removed");
    const raw = JSON.stringify(baseline.pageBrief);
    assert(!/PRIVATE-TEST-VALUE|PRIVATE-NAME|PRIVATE-TEXTAREA/.test(raw), "Entered values excluded from page brief");
    assert(baseline.findings.some(f => f.type === "missing_label"), "Unlabelled inputs are detected");
    const team = baseline.findings.find(f => f.type === "weak_cta" && f.anchorId === baseline.pageBrief.elements.find(e => e.href === "https://example.com/team")?.id);
    assert(Boolean(team), "Known vague link has a target");
    const nested = baseline.findings.find(f => f.type === "weak_cta" && f.anchorId === baseline.pageBrief.elements.find(e => e.href === "https://example.com/projects")?.id);
    const span = document.querySelector("#project-link span");
    assert(nested.canPreview && (await call({ action: "applyPreview", issueId: nested.id })).success && span.textContent !== "More", "Nested link labels can be previewed without removing markup");
    await call({ action: "undoPreview", issueId: nested.id });
    assert(span.textContent === "More" && span === document.querySelector("#project-link span"), "Undo preserves nested markup and original text");
    const el = document.getElementById("team-link"), original = el.textContent;
    const markerCount = document.querySelectorAll(".ai-inspector-marker").length;
    for (let i = 0; i < 3; i++) {
      assert((await call({ action: "applyPreview", issueId: team.id })).success && el.textContent !== original, "Preview changes the exact link (cycle " + i + ")");
      await call({ action: "collect" });
      assert(el.textContent !== original && document.querySelectorAll(".ai-inspector-marker").length === markerCount, "Read-only recollection preserves preview and markers");
      assert((await call({ action: "undoPreview", issueId: team.id })).success && el.textContent === original, "Undo restores original wording (cycle " + i + ")");
    }
    await call({ action: "applyPreview", issueId: team.id });
    const cap = await call({ action: "prepareCapture", acceptedIds: [] });
    assert(cap.success && el.textContent === original, "Unaccepted preview suspended for capture");
    assert(document.querySelectorAll("[data-inspector-mask]").length >= 3, "Editable values masked for screenshot");
    await call({ action: "finishCapture" });
    assert(el.textContent !== original && !document.querySelector("[data-inspector-mask]"), "Capture restores preview and removes masks");
    await call({ action: "prepareCapture", acceptedIds: [team.id] });
    assert(el.textContent !== original, "Accepted change remains applied during capture");
    await call({ action: "finishCapture" });
    assert(!(await call({ action: "undoPreview", issueId: team.id, documentId: "wrong-document" })).success, "Stale document actions are refused");
    await call({ action: "clear" });
    assert(el.textContent === original && !document.querySelector(".ai-inspector-marker"), "Clear restores original content and removes markers");
    output.textContent = results.join("\n") + "\nALL PASSED (" + results.length + ")";
  } catch (error) { output.textContent = results.join("\n") + "\nFAIL " + error.message; }
});
