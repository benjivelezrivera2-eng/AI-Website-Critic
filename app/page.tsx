"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import {
  clearSavedAudits,
  deleteSavedAudit,
  isImportedPdf,
  listSavedAudits,
  protectSavedReports,
  readSavedReportStorage,
  saveAudit,
  saveImportedPdf,
  type Improvement,
  type ImportedPdfBackup,
  type SavedAudit,
  type SavedRecord,
  type SavedReportStorage,
} from "@/lib/saved-audits";

type View = "dashboard" | "history" | "reports" | "settings";

const SAVE_FAILED =
  "This report is on screen, but it could not be saved in this browser.";

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatWhen(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function bandLabel(score: number) {
  if (score >= 80) {
    return "Strong";
  }

  if (score >= 60) {
    return "Fair";
  }

  return "Needs work";
}

function scoreColor(score: number, max: number) {
  const ratio = score / max;

  if (ratio >= 0.8) {
    return "#34d399";
  }

  if (ratio >= 0.6) {
    return "#fbbf24";
  }

  return "#fb7185";
}

function priorityStyle(priority: Improvement["priority"]) {
  if (priority === "High") {
    return "bg-rose-500/15 text-rose-300";
  }

  if (priority === "Medium") {
    return "bg-amber-500/15 text-amber-300";
  }

  return "bg-emerald-500/15 text-emerald-300";
}

function markerColor(index: number) {
  const colors = [
    "bg-rose-500",
    "bg-orange-500",
    "bg-amber-400",
    "bg-yellow-300 text-slate-900",
    "bg-lime-500",
    "bg-emerald-500",
    "bg-teal-400",
    "bg-sky-400",
    "bg-emerald-400",
    "bg-green-500",
  ];

  return colors[index] ?? "bg-emerald-500";
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function NavGlyph({ name }: { name: string }) {
  if (name === "Dashboard") {
    return (
      <Icon>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </Icon>
    );
  }

  if (name === "New Audit") {
    return (
      <Icon>
        <path d="M12 5v14M5 12h14" />
      </Icon>
    );
  }

  if (name === "Audits History") {
    return (
      <Icon>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </Icon>
    );
  }

  if (name === "Reports") {
    return (
      <Icon>
        <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M14 3v6h6M8 13h8M8 17h5" />
      </Icon>
    );
  }

  if (name === "Templates") {
    return (
      <Icon>
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" />
        <rect x="13" y="13" width="7" height="7" rx="1" />
      </Icon>
    );
  }

  return (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </Icon>
  );
}

function shotSrc(data: string) {
  return `data:image/png;base64,${data}`;
}

export default function Home() {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef(false);
  const pendingPrint = useRef(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [selected, setSelected] = useState<SavedAudit | null>(null);
  const [audits, setAudits] = useState<SavedRecord[]>([]);
  const [error, setError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [view, setView] = useState<View>("dashboard");

  useEffect(() => {
    let cancelled = false;

    listSavedAudits()
      .then((saved) => {
        if (!cancelled) {
          setAudits(saved);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStorageNotice(
            "Saved reports in this browser could not be opened.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (view !== "dashboard" || !pendingFocus.current) {
      return;
    }

    pendingFocus.current = false;
    urlInputRef.current?.focus();
  }, [view]);

  useEffect(() => {
    if (!pendingPrint.current || !selected) {
      return;
    }

    pendingPrint.current = false;
    window.print();
  }, [selected]);

  function focusNewAudit() {
    if (view === "dashboard") {
      urlInputRef.current?.focus();
      return;
    }

    pendingFocus.current = true;
    setView("dashboard");
  }

  function openAudit(audit: SavedAudit) {
    setSelected(audit);
    setPreview("desktop");
    setView("dashboard");
  }

  function exportPdf(audit: SavedAudit) {
    if (selected?.id === audit.id) {
      window.print();
      return;
    }

    pendingPrint.current = true;
    setSelected(audit);
  }

  function openImportedPdf(record: ImportedPdfBackup) {
    const url = URL.createObjectURL(record.pdf);
    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (!opened) {
      URL.revokeObjectURL(url);
      setStorageNotice("The browser blocked the PDF tab. Allow pop-ups and try again.");
      return;
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function downloadImportedPdf(record: ImportedPdfBackup) {
    const url = URL.createObjectURL(record.pdf);
    const link = document.createElement("a");
    link.href = url;
    link.download = record.filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importPdfBackup(file: File) {
    const filename = file.name.trim();
    const typeOk = file.type === "" || file.type === "application/pdf";

    if (!filename.toLowerCase().endsWith(".pdf") || !typeOk) {
      setStorageNotice("Choose a PDF file. Other file types cannot be imported.");
      return;
    }

    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const signature = String.fromCharCode(...header);

    if (signature !== "%PDF-") {
      setStorageNotice("That file is not a PDF. Choose a .pdf backup.");
      return;
    }

    const record: ImportedPdfBackup = {
      id: crypto.randomUUID(),
      kind: "imported-pdf",
      filename,
      importedAt: new Date().toISOString(),
      pdf: file,
    };

    try {
      await saveImportedPdf(record);
      setAudits((current) => [record, ...current]);
      setStorageNotice("");
    } catch {
      setStorageNotice("That PDF could not be saved in this browser.");
    }
  }

  async function removeAudit(record: SavedRecord) {
    const confirmed = window.confirm(
      isImportedPdf(record)
        ? `Delete the imported PDF backup ${record.filename}? It will be removed from this browser.`
        : `Delete the saved report for ${record.url}? It will be removed from this browser.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteSavedAudit(record.id);
      setAudits((current) => current.filter((item) => item.id !== record.id));

      if (selected?.id === record.id) {
        setSelected(null);
      }
    } catch {
      setStorageNotice("That report could not be deleted from this browser.");
    }
  }

  async function removeAllAudits() {
    if (audits.length === 0) {
      return;
    }

    const importedCount = audits.filter(isImportedPdf).length;
    const confirmed = window.confirm(
      importedCount > 0
        ? `Delete all ${audits.length} saved reports from this browser, including ${importedCount} imported PDF backup${importedCount === 1 ? "" : "s"}? This cannot be undone.`
        : `Delete all ${audits.length} saved reports from this browser? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await clearSavedAudits();
      const removedIds = new Set(audits.map((audit) => audit.id));
      setAudits([]);

      if (selected && removedIds.has(selected.id)) {
        setSelected(null);
      }
    } catch {
      setStorageNotice("Saved reports could not be cleared from this browser.");
    }
  }

  async function startAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSaveNotice("");
    setIsLoading(true);
    setPreview("desktop");
    setView("dashboard");

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      });

      const data = (await response.json()) as {
        url?: string;
        desktopScreenshot?: string;
        mobileScreenshot?: string;
        report?: SavedAudit;
        error?: string;
      };

      if (
        !response.ok ||
        !data.report ||
        !data.url ||
        !data.desktopScreenshot ||
        !data.mobileScreenshot
      ) {
        throw new Error(data.error ?? "The website could not be audited.");
      }

      const audit: SavedAudit = {
        id: crypto.randomUUID(),
        url: data.url,
        generatedAt: new Date().toISOString(),
        overallScore: data.report.overallScore,
        scores: data.report.scores,
        summary: data.report.summary,
        improvements: data.report.improvements,
        desktopScreenshot: data.desktopScreenshot,
        mobileScreenshot: data.mobileScreenshot,
      };

      setSelected(audit);

      try {
        await saveAudit(audit);
        setAudits((current) => [audit, ...current]);
      } catch {
        setSaveNotice(SAVE_FAILED);
      }
    } catch (auditError) {
      setError(
        auditError instanceof Error
          ? auditError.message
          : "The website could not be audited.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  const report = selected;
  const activeShot =
    preview === "desktop"
      ? selected?.desktopScreenshot
      : selected?.mobileScreenshot;
  const overall = report?.overallScore ?? 0;
  const overallPct = Math.min(100, Math.max(0, overall));
  const recent = audits
    .filter((record): record is SavedAudit => !isImportedPdf(record))
    .slice(0, 4);

  const headings: Record<View, { title: string; detail: string }> = {
    dashboard: {
      title: "Website Audit",
      detail:
        "Get AI-powered insights and actionable improvements for any website.",
    },
    history: {
      title: "Audits History",
      detail: "Saved reports in this browser, newest first.",
    },
    reports: {
      title: "Reports",
      detail: "Open, export, or delete a report saved in this browser.",
    },
    settings: {
      title: "Settings",
      detail: "Reports are stored only in this browser.",
    },
  };

  return (
    <>
      <div className="app-shell min-h-screen bg-navy text-ink lg:grid lg:grid-cols-[15.25rem_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-line bg-sidebar lg:min-h-screen lg:border-r lg:border-b-0">
          <div className="flex items-center gap-3 px-4 py-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-sm font-bold text-slate-950">
              AI
            </span>
            <div>
              <p className="text-sm font-semibold">AI Website Critic</p>
              <p className="text-[11px] text-muted">Website Review & Audit Tool</p>
            </div>
          </div>

          <nav className="space-y-1 px-3" aria-label="Primary">
            <button
              type="button"
              aria-current={view === "dashboard" ? "page" : undefined}
              onClick={() => setView("dashboard")}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                view === "dashboard"
                  ? "bg-accent font-medium text-slate-950"
                  : "text-muted hover:bg-panel hover:text-ink"
              }`}
            >
              <NavGlyph name="Dashboard" />
              Dashboard
            </button>
            <button
              type="button"
              onClick={focusNewAudit}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted outline-none hover:bg-panel hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            >
              <NavGlyph name="New Audit" />
              New Audit
            </button>
            {(
              [
                ["history", "Audits History"],
                ["reports", "Reports"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                aria-current={view === id ? "page" : undefined}
                onClick={() => setView(id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  view === id
                    ? "bg-accent font-medium text-slate-950"
                    : "text-muted hover:bg-panel hover:text-ink"
                }`}
              >
                <NavGlyph name={name} />
                {name}
              </button>
            ))}
            <button
              type="button"
              disabled
              title="Planned"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted disabled:cursor-not-allowed"
            >
              <NavGlyph name="Templates" />
              Templates
              <span className="ml-auto text-[10px] font-semibold tracking-wide uppercase">
                Planned
              </span>
            </button>
            <button
              type="button"
              aria-current={view === "settings" ? "page" : undefined}
              onClick={() => setView("settings")}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                view === "settings"
                  ? "bg-accent font-medium text-slate-950"
                  : "text-muted hover:bg-panel hover:text-ink"
              }`}
            >
              <NavGlyph name="Settings" />
              Settings
            </button>
          </nav>

          <div className="mt-6 px-4">
            <p className="text-xs font-medium text-muted">Recent Audits</p>
            {recent.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-4 text-xs leading-5 text-muted">
                No saved audits yet. A finished report stays in this browser.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {recent.map((audit) => (
                  <li key={audit.id}>
                    <button
                      type="button"
                      onClick={() => openAudit(audit)}
                      className="w-full rounded-xl border border-line px-3 py-2 text-left outline-none hover:bg-panel focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <p className="truncate text-xs font-medium">{audit.url}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {formatScore(audit.overallScore)}/100
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mx-3 mt-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-700 to-indigo-900 p-4">
            <p className="text-sm font-semibold">Upgrade to Pro</p>
            <p className="mt-1 text-xs leading-5 text-violet-100/80">
              Templates are planned. Saved reports stay in this browser.
            </p>
            <button
              type="button"
              disabled
              className="mt-3 w-full rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed"
            >
              Coming soon
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex flex-col gap-4 border-b border-line px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {headings[view].title}
              </h1>
              <p className="mt-1 text-sm text-muted">{headings[view].detail}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!selected}
                onClick={() => {
                  if (selected) {
                    window.print();
                  }
                }}
                className="h-10 rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:text-muted"
              >
                Export / Save PDF
              </button>
              <button
                type="submit"
                form="audit-form"
                disabled={isLoading}
                className="h-10 rounded-lg bg-accent px-3 text-sm font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Running audit..." : "Generate New Audit"}
              </button>
            </div>
          </header>

          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="PDF backup file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";

              if (file) {
                void importPdfBackup(file);
              }
            }}
          />

          {view === "dashboard" && (
            <form id="audit-form" onSubmit={startAudit} className="px-4 pt-4 lg:px-6">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-center">
                <label className="relative block">
                  <span className="sr-only">Website URL</span>
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
                    <Icon>
                      <circle cx="12" cy="12" r="8" />
                      <path d="M3 12h18M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16" />
                    </Icon>
                  </span>
                  <input
                    ref={urlInputRef}
                    type="url"
                    required
                    value={websiteUrl}
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    placeholder="https://example-business.com"
                    className="h-11 w-full rounded-lg border border-line bg-panel pr-3 pl-10 text-sm outline-none placeholder:text-muted focus:border-accent"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-11 w-fit rounded-lg bg-accent px-5 text-sm font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Capturing and analyzing..." : "Run New Audit"}
                </button>
              </div>
            </form>
          )}

          <main className="space-y-4 px-4 py-4 lg:px-6">
            {storageNotice && (
              <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {storageNotice}
              </p>
            )}

            {view === "history" && (
              <HistoryView
                audits={audits}
                onOpen={openAudit}
                onOpenPdf={openImportedPdf}
              />
            )}

            {view === "reports" && (
              <ReportsView
                audits={audits}
                onOpen={openAudit}
                onExport={exportPdf}
                onDelete={removeAudit}
                onImportClick={() => pdfInputRef.current?.click()}
                onOpenPdf={openImportedPdf}
                onDownloadPdf={downloadImportedPdf}
              />
            )}

            {view === "settings" && (
              <SettingsView
                audits={audits}
                onDelete={removeAudit}
                onClear={removeAllAudits}
              />
            )}

            {view === "dashboard" && (
              <>
                {error && (
                  <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </p>
                )}

                {saveNotice && (
                  <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    {saveNotice}
                  </p>
                )}

                {isLoading && (
                  <p className="audit-pulse rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">
                    Capturing desktop and mobile screenshots, then writing the report.
                  </p>
                )}

                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                  <div className="space-y-4">
                    <section className="rounded-2xl border border-line bg-panel p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold">Website Preview</h2>
                        <div className="flex gap-1 text-muted">
                          <button
                            type="button"
                            aria-pressed={preview === "desktop"}
                            onClick={() => setPreview("desktop")}
                            className={`rounded-md p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              preview === "desktop" ? "bg-panel-2 text-ink" : ""
                            }`}
                          >
                            <span className="sr-only">Desktop screenshot</span>
                            <Icon>
                              <rect x="3" y="5" width="18" height="12" rx="1.5" />
                              <path d="M8 20h8" />
                            </Icon>
                          </button>
                          <button
                            type="button"
                            disabled
                            title="Tablet capture is not available"
                            className="rounded-md p-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="sr-only">Tablet screenshot unavailable</span>
                            <Icon>
                              <rect x="6" y="3" width="12" height="18" rx="1.5" />
                            </Icon>
                          </button>
                          <button
                            type="button"
                            aria-pressed={preview === "mobile"}
                            disabled={!selected}
                            onClick={() => setPreview("mobile")}
                            className={`rounded-md p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${
                              preview === "mobile" ? "bg-panel-2 text-ink" : ""
                            }`}
                          >
                            <span className="sr-only">Mobile screenshot</span>
                            <Icon>
                              <rect x="8" y="3" width="8" height="18" rx="1.5" />
                            </Icon>
                          </button>
                        </div>
                      </div>

                      {selected && activeShot ? (
                        <img
                          src={shotSrc(activeShot)}
                          alt={
                            preview === "desktop"
                              ? "Desktop screenshot of the audited website"
                              : "Mobile screenshot of the audited website"
                          }
                          className={`mt-4 w-full rounded-xl border border-line object-cover object-top ${
                            preview === "mobile"
                              ? "mx-auto max-h-[28rem] max-w-xs object-contain"
                              : "max-h-[22rem]"
                          }`}
                        />
                      ) : (
                        <div className="mt-4 flex min-h-56 items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-sm leading-6 text-muted">
                          The captured website preview appears here after you run an audit.
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-between">
                        <h3 className="text-sm font-medium">
                          Screenshots Captured ({selected ? 2 : 0})
                        </h3>
                      </div>
                      {selected ? (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPreview("desktop")}
                            className="overflow-hidden rounded-lg border border-line text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            <img
                              src={shotSrc(selected.desktopScreenshot)}
                              alt=""
                              className="h-16 w-full object-cover object-top"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreview("mobile")}
                            className="overflow-hidden rounded-lg border border-line text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            <img
                              src={shotSrc(selected.mobileScreenshot)}
                              alt=""
                              className="h-16 w-full object-cover object-top"
                            />
                          </button>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted">
                          Desktop and mobile captures show up in this strip.
                        </p>
                      )}
                    </section>

                    <section className="rounded-2xl border border-line bg-panel p-4">
                      <div className="grid gap-4 lg:grid-cols-[9rem_minmax(0,1fr)]">
                        <div>
                          <h2 className="text-sm font-semibold">Overall Score</h2>
                          <div className="mt-4 flex flex-col items-center">
                            <div
                              className="grid h-28 w-28 place-items-center rounded-full"
                              style={{
                                background: report
                                  ? `conic-gradient(#34d399 ${overallPct * 3.6}deg, #243044 0deg)`
                                  : "#243044",
                              }}
                            >
                              <div className="grid h-[5.4rem] w-[5.4rem] place-items-center rounded-full bg-panel text-center">
                                <p className="font-mono text-2xl font-semibold tabular-nums">
                                  {report ? formatScore(overall) : "–"}
                                </p>
                                <p className="-mt-1 text-[11px] text-muted">/100</p>
                              </div>
                            </div>
                            <p className="mt-3 text-sm text-amber-300">
                              {report ? bandLabel(overall) : "No score yet"}
                            </p>
                          </div>
                        </div>

                        {report ? (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {report.scores.map((score) => (
                              <article
                                key={score.category}
                                title={score.rationale}
                                className="rounded-xl border border-line bg-navy px-3 py-3"
                              >
                                <p className="text-[11px] text-muted">{score.category}</p>
                                <p
                                  className="mt-2 font-mono text-sm font-semibold tabular-nums"
                                  style={{ color: scoreColor(score.score, 10) }}
                                >
                                  {formatScore(score.score)}
                                  <span className="text-muted">/10</span>
                                </p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="self-center text-sm leading-6 text-muted">
                            Category scores, each out of 10, appear beside the overall
                            score after the audit.
                          </p>
                        )}
                      </div>
                      <p className="mt-4 text-xs text-muted">
                        Score uses the live model result. Category notes are on each card.
                      </p>
                    </section>
                  </div>

                  <section className="rounded-2xl border border-line bg-panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-sm font-semibold">AI Audit Report</h2>
                      <p className="text-right text-[11px] text-muted">
                        {selected
                          ? `Generated: ${formatWhen(selected.generatedAt)}`
                          : "Not generated yet"}
                      </p>
                    </div>

                    <div className="mt-4 rounded-xl border border-line bg-navy p-3">
                      <p className="text-xs font-semibold text-amber-300">Summary</p>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {report
                          ? report.summary
                          : "The written summary appears here after you run an audit."}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Top Improvements</h3>
                      <span className="rounded-md border border-line px-2 py-1 text-[11px] text-muted">
                        All Priorities
                      </span>
                    </div>

                    {report ? (
                      <ol className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto pr-1">
                        {report.improvements.map((improvement, index) => (
                          <li
                            key={`${improvement.title}-${index}`}
                            className="rounded-xl border border-line bg-navy px-3 py-3"
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-slate-950 ${markerColor(index)}`}
                              >
                                {index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium">{improvement.title}</p>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityStyle(improvement.priority)}`}
                                  >
                                    {improvement.priority}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-muted">
                                  {improvement.recommendation}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-ink/80">
                                  {improvement.evidence}
                                </p>
                              </div>
                              <span className="hidden shrink-0 text-[11px] text-muted sm:block">
                                {improvement.priority} Impact
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-8 text-sm leading-6 text-muted">
                        Ten live improvements appear here after you run an audit.
                      </p>
                    )}

                    <div className="mt-5 border-t border-line pt-4">
                      <h3 className="text-sm font-semibold">Next Steps</h3>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                        <button
                          type="button"
                          disabled={!selected}
                          onClick={() => {
                            if (selected) {
                              window.print();
                            }
                          }}
                          className="rounded-lg border border-line px-2 py-2 text-left text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:text-muted"
                        >
                          Export / Save PDF
                        </button>
                        <p className="rounded-lg border border-dashed border-line px-2 py-2 text-muted">
                          Share with Client
                          <span className="mt-1 block text-[10px]">Unavailable</span>
                        </p>
                        <p className="rounded-lg border border-dashed border-line px-2 py-2 text-muted">
                          Track Improvements
                          <span className="mt-1 block text-[10px]">Unavailable</span>
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {selected && <PrintReport audit={selected} />}
    </>
  );
}

function HistoryView({
  audits,
  onOpen,
  onOpenPdf,
}: {
  audits: SavedRecord[];
  onOpen: (audit: SavedAudit) => void;
  onOpenPdf: (record: ImportedPdfBackup) => void;
}) {
  if (audits.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-sm leading-6 text-muted">
        No saved audits yet. Run an audit and it will show up here.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {audits.map((record) =>
        isImportedPdf(record) ? (
          <li key={record.id}>
            <button
              type="button"
              onClick={() => onOpenPdf(record)}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-left outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold tracking-wide text-amber-300 uppercase">
                  Imported PDF backup
                </span>
                <span className="mt-1 block truncate text-sm font-medium">
                  {record.filename}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {formatWhen(record.importedAt)}
                </span>
              </span>
            </button>
          </li>
        ) : (
          <li key={record.id}>
            <button
              type="button"
              onClick={() => onOpen(record)}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-left outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{record.url}</span>
                <span className="mt-1 block text-xs text-muted">
                  {formatWhen(record.generatedAt)}
                </span>
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatScore(record.overallScore)}
                <span className="text-muted">/100</span>
              </span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function ReportsView({
  audits,
  onOpen,
  onExport,
  onDelete,
  onImportClick,
  onOpenPdf,
  onDownloadPdf,
}: {
  audits: SavedRecord[];
  onOpen: (audit: SavedAudit) => void;
  onExport: (audit: SavedAudit) => void;
  onDelete: (record: SavedRecord) => void;
  onImportClick: () => void;
  onOpenPdf: (record: ImportedPdfBackup) => void;
  onDownloadPdf: (record: ImportedPdfBackup) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onImportClick}
          className="h-10 rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Import PDF Backup
        </button>
      </div>

      {audits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-sm leading-6 text-muted">
          No saved reports yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {audits.map((record) =>
            isImportedPdf(record) ? (
              <li
                key={record.id}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-wide text-amber-300 uppercase">
                    Imported PDF backup
                  </p>
                  <p className="mt-1 truncate text-sm font-medium">{record.filename}</p>
                  <p className="mt-1 text-xs text-muted">{formatWhen(record.importedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenPdf(record)}
                    className="h-9 rounded-lg border border-line px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Open original PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownloadPdf(record)}
                    className="h-9 rounded-lg border border-line px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(record)}
                    className="h-9 rounded-lg border border-rose-400/40 px-3 text-xs font-medium text-rose-200 outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ) : (
              <li
                key={record.id}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{record.url}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatWhen(record.generatedAt)} · {formatScore(record.overallScore)}/100
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(record)}
                    className="h-9 rounded-lg border border-line px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onExport(record)}
                    className="h-9 rounded-lg border border-line px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(record)}
                    className="h-9 rounded-lg border border-rose-400/40 px-3 text-xs font-medium text-rose-200 outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function storageStatusLabel(status: SavedReportStorage) {
  if (status === "protected") {
    return "Protected";
  }

  if (status === "standard") {
    return "Standard browser storage";
  }

  return "Unavailable";
}

function SettingsView({
  audits,
  onDelete,
  onClear,
}: {
  audits: SavedRecord[];
  onDelete: (record: SavedRecord) => void;
  onClear: () => void;
}) {
  const [storage, setStorage] = useState<SavedReportStorage | null>(null);
  const [isProtecting, setIsProtecting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    readSavedReportStorage().then((status) => {
      if (!cancelled) {
        setStorage(status);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function protectReports() {
    setIsProtecting(true);

    try {
      setStorage(await protectSavedReports());
    } finally {
      setIsProtecting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-line bg-panel p-4">
        <h2 className="text-sm font-semibold">Saved reports</h2>
        <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">
          {audits.length}
        </p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          These reports are stored only in this browser, on this computer. They
          are not uploaded to an account, and they are not available in another
          browser.
        </p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Saved audits normally survive page refreshes, Chrome restarts, and
          device restarts in this Chrome profile.
        </p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Clearing browser site data, deleting the Chrome profile, or device
          failure can still remove local reports.
        </p>
        <p className="mt-4 text-sm">
          <span className="text-muted">Saved-report storage: </span>
          <span className="font-medium">
            {storage ? storageStatusLabel(storage) : "Checking…"}
          </span>
        </p>
        <button
          type="button"
          disabled={isProtecting}
          onClick={() => void protectReports()}
          className="mt-3 h-10 rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          Protect saved reports
        </button>
        <button
          type="button"
          disabled={audits.length === 0}
          onClick={onClear}
          className="mt-4 h-10 rounded-lg border border-rose-400/40 px-3 text-sm text-rose-200 outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear all reports
        </button>
      </div>

      {audits.length > 0 && (
        <ul className="space-y-2">
          {audits.map((record) => (
            <li
              key={record.id}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                {isImportedPdf(record) ? (
                  <>
                    <p className="text-[11px] font-semibold tracking-wide text-amber-300 uppercase">
                      Imported PDF backup
                    </p>
                    <p className="mt-1 truncate text-sm font-medium">{record.filename}</p>
                    <p className="mt-1 text-xs text-muted">{formatWhen(record.importedAt)}</p>
                  </>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium">{record.url}</p>
                    <p className="mt-1 text-xs text-muted">{formatWhen(record.generatedAt)}</p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(record)}
                className="h-9 w-fit rounded-lg border border-rose-400/40 px-3 text-xs font-medium text-rose-200 outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                Delete report
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PrintReport({ audit }: { audit: SavedAudit }) {
  return (
    <article className="audit-print bg-white px-8 py-8 text-slate-900">
      <header className="print-block">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          AI Website Critic
        </p>
        <h1 className="mt-2 text-2xl font-semibold break-all">{audit.url}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Generated {formatWhen(audit.generatedAt)}
        </p>
      </header>

      <section className="print-block mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Overall score
        </h2>
        <p className="mt-1 text-3xl font-semibold">
          {formatScore(audit.overallScore)}
          <span className="text-lg text-slate-500">/100</span>
        </p>
      </section>

      <section className="print-block mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Summary
        </h2>
        <p className="mt-2 text-sm leading-6">{audit.summary}</p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Category scores
        </h2>
        <div className="mt-3 space-y-3">
          {audit.scores.map((score) => (
            <div key={score.category} className="print-block">
              <p className="text-sm font-semibold">
                {score.category}: {formatScore(score.score)}/10
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{score.rationale}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Improvements
        </h2>
        <ol className="mt-3 space-y-4">
          {audit.improvements.map((improvement, index) => (
            <li key={`${improvement.title}-${index}`} className="print-block text-sm">
              <p className="font-semibold">
                {index + 1}. {improvement.title}
              </p>
              <p className="mt-1 text-slate-600">
                {improvement.priority} · {improvement.category}
              </p>
              <p className="mt-1 leading-6">{improvement.recommendation}</p>
              <p className="mt-1 leading-6 text-slate-700">{improvement.evidence}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Screenshots
        </h2>
        <figure className="print-block mt-3">
          <figcaption className="text-sm font-semibold">Desktop</figcaption>
          <img
            src={shotSrc(audit.desktopScreenshot)}
            alt="Desktop screenshot of the audited website"
            className="mt-2 w-full border border-slate-200"
          />
        </figure>
        <figure className="print-block mt-4">
          <figcaption className="text-sm font-semibold">Mobile</figcaption>
          <img
            src={shotSrc(audit.mobileScreenshot)}
            alt="Mobile screenshot of the audited website"
            className="mt-2 w-56 border border-slate-200"
          />
        </figure>
      </section>
    </article>
  );
}
