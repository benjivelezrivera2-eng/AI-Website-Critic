# GitHub Issues Guide

Repo: [benjivelezrivera2-eng/AI-Website-Critic](https://github.com/benjivelezrivera2-eng/AI-Website-Critic)

What this repo is: A Next.js (TypeScript) web app that captures desktop and mobile screenshots of a public URL, asks OpenAI for an overall score, eight category scores, and ten improvements, and stores the report in the browser.

Follow this on every task. Benji confirms the issue before any code is written.

## Prime rule

No code until a GitHub Issue exists for the work. Plan the issue first, then build.

## Before you start

1. List open issues: `gh issue list`.
2. Pick the issue this chat will work on, or draft a new one if none fits.
3. Confirm that choice with Benji. Wait for a yes before writing code.
4. Work on a branch off the default branch, never directly on it. Open a pull request when done.

## Issue format

- **Title:** specific and clear.
- **Goal:** one short paragraph on the outcome.
- **Steps:** a checkbox list of the work.
- **Done when:** the checks that prove it is finished.

```markdown
## Goal
<one short paragraph>

## Steps
- [ ] ...

## Done when
- [ ] ...
```

## Labels

Use only labels that already exist. Check with `gh label list`. If the right label is missing, ask Benji to create it. Do not invent or create labels.

## Standard Labels

- **enhancement:** New features or improvements
- **bug:** Errors or broken functionality
- **documentation:** Changes to README, guides, or code comments
- **refactor:** Code cleanup with no change in behavior
- **urgent:** Blocks something critical, like the site or getting paid

## Milestones

This repo does not use milestones. Track work with issues and the GitHub Project board.

## While working

Comment on the issue with progress and any decision you make. Keep comments short and factual.

## When finished

1. Check off the completed steps.
2. Comment with a short summary of what changed.
3. Close the issue (or let the merged PR close it with "Closes #N").
4. Move its card to **Done** on the GitHub Project board.

## Do not delete

Never delete issues, this repo, or branches unless Benji explicitly says yes in the same chat.

## Secrets

Keep tokens, API keys, and other secrets out of issues, comments, and code.
