import type { ApiResponse } from "~/types/api";
import { createApiError } from "~/utils/apiError";
import { useAuthStore } from "~/stores/auth";
import { requireLoadedPermission } from "~/utils/permissionAccess";

export interface PayslipEmployee {
  id: number;
  uuid?: string;
  employee_uuid?: string;
  name: string;
  employee_id?: string | number;
  employee_code?: string | number;
  code?: string | number;
}

export interface PayslipCompany {
  id: number;
  name: string;
}

export interface PayslipAmounts {
  base_salary: number;
  total_additions: number;
  total_deductions: number;
  net_salary: number;
}

export interface PayslipPeriod {
  from: string;
  to: string;
  label: string;
}

export interface Payslip {
  id: number;
  uuid?: string;
  employee_uuid?: string;
  employee_id?: number | string;
  employee?: PayslipEmployee;
  company?: PayslipCompany;
  salary_id?: number;
  amounts?: PayslipAmounts;
  period?: PayslipPeriod;
  effective_from?: string;
  effective_to?: string;
  is_paid?: boolean | number;
  generated_at?: string;
  created_at?: string;
  status?: "paid" | "unpaid" | string;
  month?: number | string;
  year?: number;
  base_salary?: number;
  total_additions?: number;
  total_deductions?: number;
  net_salary?: number;
  grossSalary?: number;
}

export interface GeneratePayslipPayload {
  employee_id?: number | string;
  month: string | number;
  year: number;
  employee_ids?: Array<number | string>;
}

export interface PayslipListFilters {
  date?: string;
  employee_id?: number | string;
  status?: "paid" | "unpaid";
  order_by?: string;
  order?: "asc" | "desc";
  month?: string | number;
  year?: number;
  search?: string;
}

const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_ABBR_TO_NUM: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const PAYSLIP_DOWNLOAD_RETRY_ATTEMPTS = 10;
const PAYSLIP_DOWNLOAD_RETRY_DELAY_MS = 2000;
const BASIC_HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

function getBaseUrl() {
  const config = useRuntimeConfig();
  return config.public.apiUrl || "http://127.0.0.1:8000/api";
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

function getHeaders(token: string, accept = "application/json") {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: accept,
  };
}

function normalizeMonthToDate(
  month?: string | number,
  year?: number,
): string | undefined {
  if (month == null || year == null) return undefined;

  let monthNumber: number | undefined;

  if (typeof month === "number" && month >= 1 && month <= 12) {
    monthNumber = month;
  } else {
    const normalized = String(month).trim();
    const numeric = parseInt(normalized, 10);
    if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 12) {
      monthNumber = numeric;
    } else {
      const upper = normalized.toUpperCase();
      monthNumber =
        MONTH_ABBR_TO_NUM[upper] ??
        MONTH_NAMES_EN.findIndex(
          (name) => name.toLowerCase() === normalized.toLowerCase(),
        ) + 1;
    }
  }

  if (!monthNumber || monthNumber < 1 || monthNumber > 12) return undefined;
  return `${year}-${String(monthNumber).padStart(2, "0")}-01`;
}

function deriveMonthYear(filters?: PayslipListFilters): {
  month?: string;
  year?: number;
} {
  if (!filters) return {};

  if (filters.month != null && filters.year != null) {
    const normalizedDate = normalizeMonthToDate(filters.month, filters.year);
    if (!normalizedDate) return {};

    const date = new Date(normalizedDate);
    if (Number.isNaN(date.getTime())) return {};

    return {
      month: MONTH_NAMES_EN[date.getMonth()],
      year: date.getFullYear(),
    };
  }

  if (filters.date) {
    const date = new Date(filters.date);
    if (Number.isNaN(date.getTime())) return {};

    return {
      month: MONTH_NAMES_EN[date.getMonth()],
      year: date.getFullYear(),
    };
  }

  return {};
}

function buildMonthQueryCandidates(
  filters?: PayslipListFilters,
): Array<{ month?: string; year?: number }> {
  const derived = deriveMonthYear(filters);
  if (!derived.month || derived.year == null) return [derived];

  const monthIndex = MONTH_NAMES_EN.findIndex(
    (monthName) => monthName.toLowerCase() === derived.month?.toLowerCase(),
  );
  if (monthIndex < 0) return [derived];

  const monthNumber = monthIndex + 1;
  const monthAbbr = MONTH_NAMES_EN[monthIndex]?.slice(0, 3).toUpperCase();
  const candidateOrder: string[] = [];

  const pushCandidate = (value?: string) => {
    if (!value || candidateOrder.includes(value)) return;
    candidateOrder.push(value);
  };

  if (filters?.month != null) {
    const rawMonth = String(filters.month).trim();
    const upperRawMonth = rawMonth.toUpperCase();
    const numericRawMonth = parseInt(rawMonth, 10);

    if (
      !Number.isNaN(numericRawMonth) &&
      numericRawMonth >= 1 &&
      numericRawMonth <= 12
    ) {
      pushCandidate(String(monthNumber));
      pushCandidate(derived.month);
      pushCandidate(monthAbbr);
    } else if (MONTH_ABBR_TO_NUM[upperRawMonth]) {
      pushCandidate(monthAbbr);
      pushCandidate(derived.month);
      pushCandidate(String(monthNumber));
    } else {
      pushCandidate(derived.month);
      pushCandidate(monthAbbr);
      pushCandidate(String(monthNumber));
    }
  } else {
    pushCandidate(String(monthNumber));
    pushCandidate(derived.month);
    pushCandidate(monthAbbr);
  }

  return candidateOrder.map((month) => ({
    month,
    year: derived.year,
  }));
}

function normalizeListArgs(
  filtersOrToken?: PayslipListFilters | string,
  tokenOrFilters?: string | PayslipListFilters,
) {
  let token: string | undefined;
  let filters: PayslipListFilters | undefined;

  if (typeof filtersOrToken === "string") {
    token = filtersOrToken;
    filters = typeof tokenOrFilters === "object" ? tokenOrFilters : undefined;
  } else {
    filters = filtersOrToken;
    token = typeof tokenOrFilters === "string" ? tokenOrFilters : undefined;
  }

  return { token, filters };
}

function extractPagination(
  raw: unknown,
  fallbackCount: number,
): ApiResponse<Payslip[]>["meta"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  const topMeta = obj.meta;
  if (
    topMeta &&
    typeof topMeta === "object" &&
    "pagination" in (topMeta as Record<string, unknown>)
  ) {
    return topMeta as ApiResponse<Payslip[]>["meta"];
  }

  const candidates = [obj.data, obj];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const currentPage = Number(record.current_page ?? 0);
    const lastPage = Number(record.last_page ?? record.total_pages ?? 0);
    const total = Number(record.total ?? fallbackCount);
    const perPage = Number(record.per_page ?? fallbackCount);

    if (currentPage > 0 || lastPage > 0 || total > 0 || perPage > 0) {
      return {
        pagination: {
          total,
          per_page: perPage || fallbackCount,
          current_page: currentPage || 1,
          last_page: lastPage || 1,
          next_page_url:
            typeof record.next_page_url === "string"
              ? record.next_page_url
              : null,
          prev_page_url:
            typeof record.prev_page_url === "string"
              ? record.prev_page_url
              : null,
          from: Number(record.from ?? (fallbackCount > 0 ? 1 : 0)),
          to: Number(record.to ?? fallbackCount),
        },
      };
    }
  }

  return undefined;
}

function extractPayslipArray(raw: unknown): Payslip[] {
  if (Array.isArray(raw)) return raw as Payslip[];
  if (!raw || typeof raw !== "object") return [];

  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as Payslip[];

  if (obj.data && typeof obj.data === "object" && obj.data !== null) {
    const nested = obj.data as Record<string, unknown>;
    if (Array.isArray(nested.data)) return nested.data as Payslip[];
  }

  if ("id" in obj) return [obj as unknown as Payslip];

  return [];
}

function extractPayslipItem(raw: unknown): Payslip | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  if ("id" in obj) return obj as unknown as Payslip;

  if (obj.data && typeof obj.data === "object" && obj.data !== null) {
    return extractPayslipItem(obj.data);
  }

  return null;
}

async function parseApiError(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw createApiError(fallbackMessage, response.status, {});
  }

  const err = await response.json().catch(() => ({}));
  throw createApiError(
    (err as { message?: string }).message || fallbackMessage,
    response.status,
    err,
  );
}

function resolveFilename(response: Response, fallbackName: string) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(
    /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/,
  );
  if (!match?.[1]) return fallbackName;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function isHtmlLikeContentType(contentType: string) {
  return (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml")
  );
}

function decodeBasicHtmlEntities(value: string) {
  return value.replace(
    /&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/g,
    (entity) => BASIC_HTML_ENTITIES[entity] ?? entity,
  );
}

function extractTextFromHtml(html: string) {
  const normalized = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return decodeBasicHtmlEntities(normalized).replace(/\s+/g, " ").trim();
}

function isPayslipProcessingMessage(message: string) {
  return (
    /payslips?\s+(?:are|is)?\s*(?:still\s+)?(?:being\s+)?process(?:ed|ing)\s+in(?:\s+the)?\s+background/i.test(
      message,
    ) || /payslips?\s+(?:are|is)?\s*still processing/i.test(message)
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJsonMessage(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;

  try {
    const body = (await response.clone().json()) as { message?: unknown };
    return typeof body.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

async function isProcessingResponse(response: Response): Promise<boolean> {
  const message = await getJsonMessage(response);
  return message != null && isPayslipProcessingMessage(message);
}

async function downloadResponseBlob(response: Response, fallbackName: string) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const err = await response.json().catch(() => ({}));
    const message =
      (err as { message?: string }).message || "Failed to download payslip";
    if (isPayslipProcessingMessage(message)) {
      throw createApiError(
        "Payslips are being generated in the background. Please wait a moment and try downloading again.",
        202,
        { ...(err as Record<string, unknown>), isProcessing: true },
      );
    }

    throw createApiError(message, response.status, err);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = resolveFilename(response, fallbackName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function fetchPayslipDownloadResponse(
  uuids: string[],
  authToken: string,
) {
  return fetch(`${getBaseUrl()}/download-payslip`, {
    method: "POST",
    headers: getHeaders(
      authToken,
      "application/pdf, application/octet-stream, application/json, text/html",
    ),
    body: JSON.stringify({ uuids }),
  });
}

async function getDownloadablePayslipResponse(
  uuids: string[],
  authToken: string,
) {
  for (
    let attempt = 1;
    attempt <= PAYSLIP_DOWNLOAD_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    const response = await fetchPayslipDownloadResponse(uuids, authToken);
    const contentType = response.headers.get("content-type") || "";

    if (
      contentType.includes("application/pdf") ||
      contentType.includes("application/octet-stream")
    ) {
      return response;
    }

    if (await isProcessingResponse(response)) {
      if (attempt < PAYSLIP_DOWNLOAD_RETRY_ATTEMPTS) {
        await delay(PAYSLIP_DOWNLOAD_RETRY_DELAY_MS * attempt);
        continue;
      }

      throw createApiError(
        "Payslips are being generated in the background. Please wait a moment and try downloading again.",
        202,
        { uuids, isProcessing: true },
      );
    }

    if (!isHtmlLikeContentType(contentType)) {
      if (!response.ok) {
        await parseApiError(response, "Failed to download payslips");
      }

      if (contentType.includes("application/json")) {
        const message = await getJsonMessage(response);
        throw createApiError(
          message || "Failed to download payslip",
          response.status || 500,
          {
            uuids,
            contentType,
          },
        );
      }

      return response;
    }

    const html = await response.text().catch(() => "");
    const message = extractTextFromHtml(html);

    if (
      isPayslipProcessingMessage(message) &&
      attempt < PAYSLIP_DOWNLOAD_RETRY_ATTEMPTS
    ) {
      await delay(PAYSLIP_DOWNLOAD_RETRY_DELAY_MS * attempt);
      continue;
    }

    if (isPayslipProcessingMessage(message)) {
      throw createApiError(
        "Payslips are being generated in the background. Please wait a moment and try downloading again.",
        202,
        { uuids, contentType, message, isProcessing: true },
      );
    }

    if (!response.ok) {
      throw createApiError(
        message || "Failed to download payslips",
        response.status || 500,
        { uuids, contentType },
      );
    }

    throw createApiError(
      message ||
        "The server returned an HTML page instead of a downloadable payslip file.",
      response.status || 200,
      { uuids, contentType },
    );
  }

  throw createApiError("Failed to download payslips", 500, { uuids });
}

async function requestJson<T>(
  path: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, options);
  if (!response.ok) {
    await parseApiError(response, fallbackMessage);
  }
  return response.json();
}

function normalizeListResponse(
  raw: ApiResponse<unknown>,
): ApiResponse<Payslip[]> {
  const data = extractPayslipArray(raw.data);

  return {
    ...raw,
    data,
    meta: extractPagination(raw, data.length) ?? raw.meta,
  };
}

function requireSuperAdminPayslipMaintenance(): void {
  if (useAuthStore().isSuperAdmin) return;

  throw createApiError(
    "You do not have permission to maintain payslip payment status or delete payslips.",
    403,
    {
      requiredRole: "Super-Admin",
      blockedBy: "frontend-business-rule",
      backendPermissionMiddleware: "missing",
    },
  );
}

export const payslipService = {
  async list(
    page: number = 1,
    perPage: number = 10,
    filtersOrToken?: PayslipListFilters | string,
    tokenOrFilters?: string | PayslipListFilters,
  ): Promise<ApiResponse<Payslip[]>> {
    requireLoadedPermission("list-payslip");
    const { token, filters } = normalizeListArgs(
      filtersOrToken,
      tokenOrFilters,
    );
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    if (
      filters?.employee_id != null &&
      String(filters.employee_id).trim() !== ""
    ) {
      params.set("employee_id", String(filters.employee_id));
    }
    if (filters?.status) params.set("status", filters.status);
    if (filters?.order_by) params.set("order_by", filters.order_by);
    if (filters?.order) params.set("order", filters.order);
    if (filters?.search?.trim()) params.set("search", filters.search.trim());

    const monthCandidates = buildMonthQueryCandidates(filters);
    let firstResponse: ApiResponse<Payslip[]> | null = null;

    for (const candidate of monthCandidates) {
      const candidateParams = new URLSearchParams(params);

      if (candidate.month) candidateParams.set("month", candidate.month);
      else candidateParams.delete("month");

      if (candidate.year != null)
        candidateParams.set("year", String(candidate.year));
      else candidateParams.delete("year");

      const raw = await requestJson<ApiResponse<unknown>>(
        `/list-payslips?${candidateParams.toString()}`,
        {
          method: "GET",
          headers: getHeaders(authToken),
        },
        "Failed to fetch payslips",
      );

      const normalized = normalizeListResponse(raw);
      if (!firstResponse) firstResponse = normalized;
      if (normalized.data.length > 0) return normalized;
    }

    return (
      firstResponse ?? {
        success: true,
        message: "There is no Payslips found",
        status_code: 200,
        data: [],
        meta: undefined,
      }
    );
  },

  async listWithFilters(
    filters: PayslipListFilters & { page?: number; per_page?: number },
    token?: string,
  ): Promise<ApiResponse<Payslip[]>> {
    return this.list(filters.page ?? 1, filters.per_page ?? 10, filters, token);
  },

  async getAll(date?: string, token?: string): Promise<ApiResponse<Payslip[]>> {
    return this.list(1, 100, date ? { date } : undefined, token);
  },

  async generate(
    payload: GeneratePayslipPayload,
    token?: string,
  ): Promise<ApiResponse<unknown>> {
    requireLoadedPermission("generate-payslip");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    return requestJson<ApiResponse<unknown>>(
      "/generate-payslip",
      {
        method: "POST",
        headers: getHeaders(authToken),
        body: JSON.stringify(payload),
      },
      "Failed to generate payslip",
    );
  },

  async generateForEmployee(
    employeeId: number | string,
    month: number,
    year: number,
    token?: string,
  ): Promise<ApiResponse<unknown>> {
    return this.generate({ employee_id: employeeId, month, year }, token);
  },

  async generateForAll(
    month: number,
    year: number,
    token?: string,
  ): Promise<ApiResponse<unknown>> {
    return this.generate({ month, year }, token);
  },

  async bulkGenerate(
    employeeIds: Array<number | string>,
    year: number,
    month: number,
    token?: string,
  ): Promise<ApiResponse<unknown>[]> {
    return Promise.all(
      employeeIds.map((id) =>
        this.generate({ employee_id: id, year, month }, token),
      ),
    );
  },

  async getById(uuid: string, token?: string): Promise<ApiResponse<Payslip>> {
    requireLoadedPermission("show-payslip");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const raw = await requestJson<ApiResponse<unknown>>(
      `/show-payslip/${encodeURIComponent(uuid)}`,
      {
        method: "GET",
        headers: getHeaders(authToken),
      },
      "Failed to fetch payslip",
    );

    return {
      ...raw,
      data: extractPayslipItem(raw.data) as Payslip,
    };
  },

  async markAsPaid(
    uuid: string,
    token?: string,
  ): Promise<ApiResponse<unknown>> {
    requireSuperAdminPayslipMaintenance();
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    return requestJson<ApiResponse<unknown>>(
      `/mark-payslip-as-paid/${encodeURIComponent(uuid)}`,
      {
        method: "GET",
        headers: getHeaders(authToken),
      },
      "Failed to update payslip status",
    );
  },

  async markMultipleAsPaid(
    ids: number[],
    token?: string,
  ): Promise<ApiResponse<unknown>> {
    requireSuperAdminPayslipMaintenance();
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    return requestJson<ApiResponse<unknown>>(
      "/mark-multiple-payslips-as-paid",
      {
        method: "POST",
        headers: getHeaders(authToken),
        body: JSON.stringify({ ids }),
      },
      "Failed to mark payslips as paid",
    );
  },

  async download(
    uuid: string,
    filename?: string,
    token?: string,
  ): Promise<void> {
    await this.downloadMultiple(
      [uuid],
      token,
      filename || `payslip-${uuid}.pdf`,
    );
  },

  async downloadMultiple(
    uuids: string[],
    token?: string,
    fallbackFilename?: string,
  ): Promise<void> {
    requireLoadedPermission("download-payslip");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");
    const targetUuids = uuids.map((uuid) => uuid.trim()).filter(Boolean);
    if (targetUuids.length === 0) return;

    const response = await getDownloadablePayslipResponse(
      targetUuids,
      authToken,
    );

    await downloadResponseBlob(
      response,
      fallbackFilename ||
        (targetUuids.length === 1
          ? `payslip-${targetUuids[0]}.pdf`
          : `payslips-${Date.now()}.pdf`),
    );
  },

  async delete(uuid: string, token?: string): Promise<ApiResponse<unknown>> {
    requireSuperAdminPayslipMaintenance();
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    return requestJson<ApiResponse<unknown>>(
      `/delete-payslip/${encodeURIComponent(uuid)}`,
      {
        method: "DELETE",
        headers: getHeaders(authToken),
      },
      "Failed to delete payslip",
    );
  },
  async getEmployeesWithSalary(
    token: string,
    page: number = 1,
    perPage: number = 50,
    search?: string,
  ) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    if (search?.trim()) {
      params.set("search", search.trim());
    }

    const response = await fetch(
      `${getBaseUrl()}/employees-has-salary?${params.toString()}`,
      {
        method: "GET",
        headers: getHeaders(token),
      },
    );

    if (!response.ok) {
      await parseApiError(response, "Failed to fetch employees with salary");
    }

    return response.json();
  },

  async deleteMultiple(
    uuids: string[],
    token?: string,
  ): Promise<ApiResponse<unknown[]>> {
    const results = await Promise.all(
      uuids.map((uuid) => this.delete(uuid, token)),
    );
    return {
      success: true,
      message: "Payslips deleted successfully",
      status_code: 200,
      data: results.map((result) => result.data),
    };
  },

  filterByEmployee(payslips: Payslip[], employeeId: number) {
    return payslips.filter(
      (p) => Number(p.employee_id ?? p.employee?.id ?? 0) === employeeId,
    );
  },

  filterByMonth(payslips: Payslip[], year: number, month: number) {
    return payslips.filter((p) => {
      if (typeof p.month === "number")
        return p.year === year && p.month === month;
      const date = normalizeMonthToDate(p.month, p.year);
      return date === normalizeMonthToDate(month, year);
    });
  },

  getStats(payslips: Payslip[]) {
    return {
      total: payslips.length,
      paid: payslips.filter(
        (p) =>
          p.is_paid === true ||
          p.is_paid === 1 ||
          String(p.status).toLowerCase() === "paid",
      ).length,
      unpaid: payslips.filter(
        (p) =>
          !(
            p.is_paid === true ||
            p.is_paid === 1 ||
            String(p.status).toLowerCase() === "paid"
          ),
      ).length,
      totalNet: payslips.reduce(
        (sum, p) => sum + Number(p.amounts?.net_salary ?? p.net_salary ?? 0),
        0,
      ),
    };
  },

  toMonthNameEn(month: number) {
    return MONTH_NAMES_EN[month - 1] ?? "";
  },
};
