export type CategoryScore = {
  category: string;
  score: number;
  rationale: string;
};

export type Improvement = {
  title: string;
  category: string;
  priority: "High" | "Medium" | "Low";
  evidence: string;
  recommendation: string;
};

export type SavedAudit = {
  id: string;
  url: string;
  generatedAt: string;
  overallScore: number;
  scores: CategoryScore[];
  summary: string;
  improvements: Improvement[];
  desktopScreenshot: string;
  mobileScreenshot: string;
};

export type ImportedPdfBackup = {
  id: string;
  kind: "imported-pdf";
  filename: string;
  importedAt: string;
  pdf: Blob;
};

export type SavedRecord = SavedAudit | ImportedPdfBackup;

export type SavedReportStorage = "protected" | "standard" | "unavailable";

const DB_NAME = "ai-website-critic";
const STORE_NAME = "audits";
const DB_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isImportedPdf(value: unknown): value is ImportedPdfBackup {
  if (!isRecord(value) || value.kind !== "imported-pdf") {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.filename === "string" &&
    typeof value.importedAt === "string" &&
    value.pdf instanceof Blob
  );
}

function isSavedAudit(value: unknown): value is SavedAudit {
  if (!isRecord(value) || value.kind === "imported-pdf") {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.url === "string" &&
    typeof value.generatedAt === "string" &&
    typeof value.summary === "string" &&
    typeof value.overallScore === "number" &&
    typeof value.desktopScreenshot === "string" &&
    typeof value.mobileScreenshot === "string" &&
    Array.isArray(value.scores) &&
    Array.isArray(value.improvements)
  );
}

function isSavedRecord(value: unknown): value is SavedRecord {
  return isImportedPdf(value) || isSavedAudit(value);
}

function recordTime(record: SavedRecord) {
  return isImportedPdf(record) ? record.importedAt : record.generatedAt;
}

function storageManager() {
  if (typeof navigator === "undefined") {
    return null;
  }

  return navigator.storage ?? null;
}

export async function readSavedReportStorage(): Promise<SavedReportStorage> {
  const storage = storageManager();

  if (!storage || typeof storage.persisted !== "function") {
    return "unavailable";
  }

  try {
    return (await storage.persisted()) ? "protected" : "standard";
  } catch {
    return "unavailable";
  }
}

export async function protectSavedReports(): Promise<SavedReportStorage> {
  const storage = storageManager();

  if (
    !storage ||
    typeof storage.persist !== "function" ||
    typeof storage.persisted !== "function"
  ) {
    return "unavailable";
  }

  try {
    await storage.persist();
  } catch {
    return "unavailable";
  }

  return readSavedReportStorage();
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Browser storage is unavailable."));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Browser storage is unavailable."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Browser storage is unavailable."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Browser storage is unavailable."));
  });
}

export async function listSavedAudits() {
  const db = await openDatabase();

  try {
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Browser storage is unavailable."));
    });

    return records
      .filter(isSavedRecord)
      .sort((left, right) => recordTime(right).localeCompare(recordTime(left)));
  } finally {
    db.close();
  }
}

export async function saveAudit(audit: SavedAudit) {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(audit);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function saveImportedPdf(record: ImportedPdfBackup) {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).add(record);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function deleteSavedAudit(id: string) {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function clearSavedAudits() {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
