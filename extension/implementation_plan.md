# v2 plan — live accept / undo preview

Status: built.

Demo target: Benji's own site, in the tab already open. No sample site is added to this repo.

## What v2 is

Clicking **Accept** on a finding changes that one element in the current tab so the room can see it. The change is local to this browser tab. Nothing is saved, sent, or written back to the website. Refresh loads the real page again.

Clicking **Undo** on that card puts the original content back, from a cache taken before the change.

Clicking **Reject** leaves the page alone and marks that card skipped for this panel session.

## Out of scope

- Lead capture. No email field, no "send the report", no form, no CRM.
- A fake demo site, sample HTML page, or bundled screenshot site.
- Any network request, file write, or CMS update when Accept is clicked.
- Custom typed replacement copy. Accept is one click with canned text.
- A fake Google result for the search-engine description.

## How it works

The content script already keeps each finding's element in `scannedIssues` (`content.js`). Accept does not search the page again. It uses that stored element.

A second in-memory map, `previewCache`, lives only in the content script. Each entry stores the issue id, the finding type, and the smallest snapshot needed to reverse the edit (original text, original alt, original heading node, or the node we inserted). It is not `localStorage` and not `chrome.storage`. Refresh destroys it with the page.

New messages, same channel the panel already uses:

| Message | Who sends it | Result |
|---|---|---|
| `applyPreview` | side panel | Change that issue's element. Return ok or a short failure. |
| `undoPreview` | side panel | Restore that issue from `previewCache`. |
| `restoreAllPreviews` | side panel | Restore every cached change. |

No new extension permissions. `activeTab`, `sidePanel`, and `scripting` are enough.

## What each finding does

Visible changes use `textContent` or a real heading swap. No `innerHTML`.

| Type | On Accept | What the room sees | Undo |
|---|---|---|---|
| `weak_cta` | Replace the button or link label, or an input's value. Do not change the link address or what the button submits. | The label changes immediately. | Put the original label back. |
| `missing_alt` | Set the image `alt` to a real description. Also show a short caption on the image, tagged so we can remove it. | The caption. The attribute itself does not paint. | Restore the previous alt (including "there was no alt") and remove the caption. |
| `multiple_h1` | Turn that extra main title into a subheading (`h2`), move its existing contents, and point the stored element at the new node. The first main title on the page is left alone. | That heading gets smaller. | Put the original `h1` node back. |
| `skipped_heading` | Change that heading to the size that was skipped (a jump from 2 to 4 becomes a 3). Same node-swap as above. | That heading's size changes. | Put the original heading node back. |
| `missing_h1` | There is no element today. Insert one visible main title at the top of the page body, using the current tab title when it has text, otherwise "Main page title". | A new title appears. | Remove the inserted title. |
| `missing_meta` | Set or create the page's search summary in the document head. | Nothing in the layout. The card shows the exact sentence that was written, plus "Applied on this page only." Re-Analyze will stop flagging it. | Restore the previous summary, or remove the tag if we created it. |

Canned button labels (must not still be on the vague-label list):

- click here, click → Get Your Free Quote
- submit → Send My Request
- learn more, more → Explore Our Services
- read more → Read the Full Story
- here, info, more info → View the Details
- go, continue → Continue to Next Step
- button, start → Get Started

Image captions: humanize the filename when it contains words (`hero-office.jpg` → "Hero office"). Otherwise use "Photo from this page".

Search summary: first visible paragraph on the page, trimmed to about 160 characters. If the page has no paragraph, use one canned sentence: "A clear summary of this page for people who find it in search."

## Panel behavior

Each finding card gets **Accept** and **Reject**. Those buttons do not trigger the card's existing highlight click.

- Accept: send `applyPreview`, scroll and highlight as today, then swap the card actions to **Undo** and a short "Shown on this page only" line.
- Undo: send `undoPreview`, then show Accept and Reject again.
- Reject: no message to the page. Card shows "Skipped" and hides both buttons until the next Analyze.

The score does not change on Accept. **Re-Analyze Page** reads the page as it looks now, including accepted previews, so fixed items drop off and the score can rise. Re-Analyze must not wipe `previewCache`. `clearMarkers()` today empties `scannedIssues`; the preview map stays separate so Restore still works after a rescan.

**Clear Markers** still only removes badges and outlines. It does not revert previews.

Add one **Restore page** control in the results action bar. It sends `restoreAllPreviews`. Use this after a re-analyze, when the accepted cards are gone but the visual changes are still on the page. Refresh remains the hard reset.

If the element is gone, or the issue id is unknown, Accept fails quietly on the card ("This item is no longer on the page") and does not change anything else.

## Files to touch when building

- `[MODIFY] content.js` — `previewCache`, apply / undo / restore, per-type edits, caption style.
- `[MODIFY] sidepanel.js` — card buttons, card states, the three new messages, Restore page.
- `[MODIFY] sidepanel.css` — button row, accepted and skipped card styles.
- `[MODIFY] sidepanel.html` — Restore page button. Footer version becomes v2.0.0 with the build.
- `[MODIFY] manifest.json` — `"version": "2.0.0"` with the build.

Do not add files. Do not add a demo page. Do not change `background.js`.

## Assumptions

- The demo site keeps the elements we edit. A site that redraws itself can wipe a preview on its next update. Refresh still shows the real page.
- Generic button labels are good enough for a live demo. Typed custom copy is a later version.
- The search summary is a head-only change. We do not draw a mock search result to make it visible.
- Reject is session-only in the panel. A new Analyze shows rejected items again, because the page never changed.

## Verify after the build

On your own site, with the extension loaded unpacked:

1. Analyze. Accept a vague button. The label changes in the tab. Undo puts the original words back.
2. Accept a missing image description. A caption appears, and the image `alt` is set. Undo removes the caption and restores alt.
3. Reject a finding. The page does not change. The card says Skipped.
4. Accept one item, then Re-Analyze. That item leaves the list. Restore page puts the original content back.
5. Refresh the tab. The site matches what it was before any Accept.
6. The extension makes no network request on Accept.
