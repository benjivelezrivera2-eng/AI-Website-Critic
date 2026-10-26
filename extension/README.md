# AI Website Inspector

A working, polished Chrome extension (Manifest V3) that scans a webpage's live layout and structure for common search engine, accessibility, and customer experience issues.

It calculates a professional quality score, highlights issues directly on the page with numbered markers, and provides simple, non-technical fix recommendations in an elegant side panel.

## Features Built

- **Live Page Scanner**: Checks for missing image descriptions, form labels, page titles, search descriptions, missing or skipped headings, empty controls, vague action text, and broken links when they can be verified.
- **Genuine AI Review**: After the user starts an audit, sends trimmed public-page summaries and top-viewport screenshots at desktop and phone width to the local helper in one request. The helper calls OpenAI when `OPENAI_API_KEY` is set. It returns view-specific evidence and one combined verdict. Screenshots are used for that audit only and are never exported or stored by the extension.
- **Visual Page Markers**: Places numbered, elegant red badges directly on the page next to each identified issue.
- **Evidence-backed Scores**: Gemini grades 15 desktop criteria and those same 15 plus five phone-specific checks from 0 to 4. The extension weights Conversion 35%, UX 30%, Content 15%, SEO 10%, and Accessibility 10% for each view. Missing required evidence means that view gets no score. A narrow Chrome window tests layout, not every physical phone.
- **Desktop by default**: Every audit checks the desktop page. Phone-width review is optional in Settings and stays off unless you turn it on.
- **One-page Dashboard**: Uses a continuous dark dashboard with score, AI status, live category breakdown, issue filters, safe previews, and report export all in one scrollable view.
- **Interactive Highlighting**: Clicking any finding in the side panel smoothly scrolls the browser window to that exact element and highlights it with a pulsing outline. Clicking a numbered marker on the page highlights and scrolls to the matching finding card in the side panel.
- **Safe Previews**: Lets you preview suggested wording, accept it for the current browser session, reject it, or undo it. Reloading the page restores the original site.
- **Before / After**: Keeps the original assessment unchanged. Click Recheck changes to request a new Gemini assessment of accepted temporary changes. Unaccepted previews are suspended during collection, then restored. Further preview changes mark the After assessment outdated.
- **Five-site Batch Audit**: Audits exactly five public websites sequentially at desktop and phone width (or desktop only if selected). Requires optional screenshot permission. Completed results are saved individually; Stop batch preserves them. In paired mode, a site needs both completed views to enter the scored ranking.
- **Client-ready Export**: Copies the audit, downloads CSV, or downloads a print-ready HTML report that can be saved as PDF from Chrome.
- **Review Transparency**: Shows Fresh Gemini review, Saved Gemini review, or Incomplete review, with model and completion time. Expand Why this score? for all grading reasons.

## File Structure

- `manifest.json`: Configuration for Chrome Extension Manifest V3.
- `background.js`: Manages extension initialization and side panel behaviors.
- `content.js`: Scans the page, coordinates the visual markers, and handles scroll-and-highlight interactions.
- `sidepanel.html`: Clean, professional HTML structure for the side panel.
- `sidepanel.css`: Premium, modern stylesheet using an indigo and slate color palette.
- `sidepanel.js`: Handles scanning logic, score calculation, and interactive side-panel events.
- `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`: Extension icons.

## How to Load and Demo

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle switch in the top-right corner).
3. Click **Load unpacked** (button in the top-left corner).
4. Select the `extension` folder in this AI Website Critic project.
5. Open any website you want to audit (e.g., a local business site or a demo page).
6. Click the **AI Website Inspector** icon in your Chrome toolbar (or pin it and click it) to open the side panel.
7. Click **Inspect this page** to run the audit live.

## Enable the AI Review (optional but recommended)

The fixed checks run without setup. The genuine AI review uses the OpenAI key from AI Website Critic and a small helper running on your own computer.

1. In the `backend` folder, copy `.env.example` to `.env`.
2. Add your OpenAI key after `OPENAI_API_KEY=`. Do not put this key in the Chrome extension or commit the `.env` file. Gemini is used only when that OpenAI key is empty.
3. In a terminal opened in `backend`, run `node server.js` (or `npm start` if your npm launcher works).
4. Keep that terminal running while you use the extension. The helper listens only at `http://127.0.0.1:8787`.
5. Reload the unpacked extension from `chrome://extensions`, then inspect a public webpage.

If the helper is not running, the inspector still shows its on-page checks and clearly says that AI review is unavailable.

Use the free tier only for public webpages. Do not scan pages containing private client, login, or sensitive information.

## Version 3.1 verification and limits

- After updating files, restart the helper and reload the unpacked extension, then refresh the webpage. The helper must report version 3.1.0 and rubric-2 at /health. Configured does not prove a successful model response.
- Run automated tests with `node --test backend/server.test.js backend/worker.test.js` from the project folder. No package installation is needed.
- For live DOM/panel regression tests, run `node tests/serve.cjs`, then open http://127.0.0.1:8788/tests/browser-harness.html and http://127.0.0.1:8788/tests/panel.html. The panel harness uses clearly labelled mocked AI responses, not a real website audit.
- Public text-only smoke tests are explicit, potentially quota-consuming commands: `node backend/smoke-public.mjs https://www.ccellc.biz/` or the approved 303 Master Plumbing URL. The helper must be running. These intentionally return incomplete assessments because no screenshot is supplied.
- Screenshots stay in memory, are masked over editable fields/embedded frames, and are never stored or exported. Reviews and their public evidence are cached; this is not a no-data-retention product. Do not use it on sensitive pages. Login detection is precautionary, not proof a page is public.
- The visual scope is the top viewport at desktop and phone width, not every screen size or every page. The phone view uses a temporary Chrome window; Close phone view or Clear closes only that extension-created window. Grades do not measure sales performance, search rankings, or accessibility compliance. Fresh AI judgements may vary; reopening a saved review does not rerun the model.
- Browser integration and quality calibration still require real screenshot-backed reviews after reloading the installed extension. See VERIFICATION.md for the exact verified scope.
