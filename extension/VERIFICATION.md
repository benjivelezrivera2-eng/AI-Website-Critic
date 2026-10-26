# Inspector 3.0.0 verification

Date: 2026-09-23. Rubric: rubric-1. Existing uncommitted work was retained; the API key and configured model were not changed.

## Verified

- 24 Node tests passed: grade arithmetic, category weights, incomplete coverage, evidence validation, duplicate findings, cache/fresh behavior, helper health/version handling, report safety, mocked screenshot failures, mocked five-site completion/cancellation, and helper unavailability.
- 23 real-browser DOM assertions passed against a controlled local page: known baseline failures, no length-only SEO complaints, nested link labels, repeated preview/undo, read-only recollection, accepted/unaccepted capture behavior, screenshot masks, stale-document refusal, and clear/restore.
- 10 real-browser panel assertions passed with explicitly mocked AI responses: 15 grading reasons, unchanged Before score on Accept/Undo, genuine reassessment data flow, outdated After state, report consistency, document-bound actions, session saving, and no overall score during an outage.
- JavaScript syntax checks and git diff whitespace checks passed. backend/.env remains ignored.
- The local helper reports helperVersion 3.0.0, rubricVersion rubric-1 and configured model gemini-3.5-flash-lite. It listens only on 127.0.0.1:8787.
- A fresh Gemini response for Cornerstone public HTML text completed at 2026-09-23T09:13:46.833Z. It assessed 9 criteria; two additional criteria failed evidence validation. No screenshot was supplied, and no overall score was issued.
- A fresh response through the running local helper for 303 Master Plumbing public HTML text completed at 2026-09-23T09:18:16.025Z. It assessed 10 criteria with no validation errors. No screenshot was supplied, and no overall score was issued.

## Still requires the installed extension

### Evidence-reference repair, version 3.0.2 (September 23)

- Added locally resolved text/fact references so Gemini need not reproduce serialized technical facts character-for-character. Unknown references and unmatched quotations still fail. Visual criteria still require screenshot evidence and viewport-valid targets.
- One bounded correction request repairs invalid criteria only. Already valid grades are preserved; unsuccessful corrections leave the review incomplete. The worker allows time for both requests and reports the specific unassessed checks.
- All 28 automated tests passed, including reference resolution, repeat validation, empty descriptions, invalid references, visual requirements, and bounded repair preserving existing grades.
- Restarted the existing local helper; health returned helperVersion 3.0.2 with the same configured gemini-3.5-flash-lite model. Credentials were not changed.
- A real helper review of Cornerstone using a clean browser page, read-only DOM collection, and an in-memory top-viewport screenshot completed at 2026-09-23T09:48:54.429Z. All 15 criteria assessed, zero validation errors, score 70, no correction retry. Response ID: bKCzatbTKMnxqtsPrtyEkAI. This number is a test result, not a forced calibration target.
- This diagnostic used its own DOM collector and browser screenshot, not the installed extension messaging/capture pipeline. The installed extension still requires user reload and end-to-end verification. No screenshots were written to disk; temporary page and image reference were cleared.
- Earlier text-only/static-source probe remained incomplete, as expected without visual coverage, and rejected two unsupported technical observations. It was not counted as a successful complete audit.

Browser automation policy prevented opening Chrome's extension-management page. The installed extension has not been reloaded or verified end-to-end in this run. The local browser harnesses are not a substitute for that verification.

1. Reload AI Website Inspector in chrome://extensions, then refresh the public test page.
2. Inspect Cornerstone and 303 Master Plumbing with screenshots. Check the model/time, complete criteria and top-viewport evidence. Do not force the results to 51 or 67.
3. Run a real five-site visual batch after granting optional screenshot access. Check permission denial, cancellation, saved partial results, and report exports. The batch engine passed mocked tests, not a live five-provider-request run.
4. Recheck accepted changes, then Undo; inspect the rendered After reasons and the outdated state. Confirm the real extension's marker/card round trip.
5. Calibrate fresh Gemini judgement on deliberately weak, adequate and strong rendered homepage fixtures. Unit tests prove the arithmetic, not human agreement about design quality or fresh-model repeatability.

## Running locally

The machine's npm launcher currently points to a missing npm-cli.js. Node 24.15.0 itself works. Use node server.js inside backend when restarting manually. The helper was started directly and left running for the user. No runtime installation is required.

Automated tests: node --test backend/server.test.js backend/worker.test.js

Browser harnesses: node tests/serve.cjs, then visit /tests/browser-harness.html and /tests/panel.html at http://127.0.0.1:8788. The test server only exposes allowlisted project UI/test files, never the backend or .env.

Screenshots are neither persisted nor exported. Public audit text and evidence are saved in extension storage. Private/signed-in pages remain out of scope; the public-page confirmation and login heuristics are not a guarantee that every page is safe to share.

## Desktop and phone-width review, version 3.1.0 (September 23)

- The helper reports version 3.1.0 and rubric-2, with the previously configured Gemini model unchanged. It was restarted after implementation.
- One genuine paired Gemini request used two in-memory screenshots and public DOM briefs from Cornerstone at measured 1200px and 390px browser viewports. Both 15 desktop and 20 phone-width grades passed local validation. The resulting scores were 53 desktop and 43 phone width; these are observed test results, not fixed targets. The combined verdict identified the measured phone layout overflow and clipped contact area. No screenshot was written to disk.
- A second fresh request after the final validator restart also completed with zero invalid grades, at 47 desktop and 26 phone width. The difference shows that fresh model judgements can still vary; a saved review remains stable until Fresh review is chosen. It is not proof of measured conversion performance.
- 36 Node tests passed, including two-view scoring, viewport failure, batch cleanup mocks, explicit incomplete-view reporting, report consistency, and visual finding target validation. The controlled browser harness passed 23 DOM assertions; the panel harness passed 10 assertions with mocked AI data. JavaScript syntax checks passed.
- The direct helper test and harnesses are not an installed-extension end-to-end test. After reloading the unpacked extension and refreshing the page, verify a fresh paired audit, marker-to-card navigation in both windows, reversible previews, Before/After recheck, exports, and a five-site batch. A real five-site Gemini batch was not run; it may consume quota.
