let csrfToken = null;

export async function prepareCsrf() {
  const response = await fetch("/api/auth/csrf", { credentials: "include" });
  const data = await response.json();
  csrfToken = data.token;
}

export async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = { Accept: "application/json", ...options.headers };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (method !== "GET" && method !== "HEAD") {
    if (!csrfToken) await prepareCsrf();
    headers["X-XSRF-TOKEN"] = csrfToken;
  }

  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

export function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function displayDate(value) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

export const METHOD_LABELS = {
  VODAFONE_CASH: "Vodafone Cash",
  INSTAPAY: "InstaPay",
  TELDA: "Telda",
  UNASSIGNED: "Unassigned"
};

export const METHODS = ["VODAFONE_CASH", "INSTAPAY", "TELDA"];
export const ADMIN_METHODS = [...METHODS, "UNASSIGNED"];
