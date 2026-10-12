import { createApiError } from "~/utils/apiError";
import { requireLoadedPermission } from "~/utils/permissionAccess";
import type {
  CreateSalaryPayload,
  PayrollAccount,
  PayrollCompany,
  PayrollEmployee,
  PayrollItemResponse,
  PayrollListResponse,
  PayrollPagination,
  Salary,
  SalaryListResponse,
  SalaryResponse,
  UpdateSalaryPayload,
  PayslipType,
  SalaryNote,
  SalaryNoteAttachment,
  SalaryNoteResponse,
  UpdateSalaryNotePayload,
} from "~/types/payroll";

export type {
  CreateSalaryPayload,
  PayrollAccount,
  PayrollCompany,
  PayrollEmployee,
  Salary,
  SalaryListResponse,
  SalaryResponse,
  UpdateSalaryPayload,
  PayslipType,
  SalaryNote,
  SalaryNoteAttachment,
  SalaryNoteResponse,
  UpdateSalaryNotePayload,
} from "~/types/payroll";

export interface SalaryListFilters {
  employee_id?: number | string;
  company_id?: number | string;
  month?: string | number;
  year?: number | string;
}

function getBaseUrl() {
  const config = useRuntimeConfig();
  return config.public.apiUrl || "http://127.0.0.1:8000/api";
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

function requireToken(token?: string) {
  const authToken = token || getAuthToken();
  if (!authToken) throw new Error("Authentication required");
  return authToken;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
}

async function handleError(
  response: Response,
  fallback: string,
): Promise<never> {
  const err = await response.json().catch(() => ({}));

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      window.location.href = "/login";
    }
    throw createApiError("Session expired. Please log in again.", 401, err);
  }

  const msg =
    (err as { message?: string }).message ||
    ((err as { errors?: Record<string, string[]> }).errors &&
      Object.values(
        (err as { errors?: Record<string, string[]> }).errors ?? {},
      ).flat()[0]) ||
    fallback;

  throw createApiError(msg, response.status, err);
}

function requestUrl(path: string, params?: URLSearchParams) {
  const query = params?.toString();
  return `${getBaseUrl()}${path}${query ? `?${query}` : ""}`;
}

async function requestJson<T>(
  path: string,
  options: RequestInit & { token?: string; fallback?: string } = {},
): Promise<T> {
  const authToken = requireToken(options.token);
  const response = await fetch(requestUrl(path), {
    ...options,
    headers: {
      ...headers(authToken),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok)
    await handleError(response, options.fallback || "Request failed");
  return response.json();
}

function extractRows<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (!raw || typeof raw !== "object") return [];

  const root = raw as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data as T[];

  if (root.data && typeof root.data === "object") {
    const inner = root.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) return inner.data as T[];
    if ("id" in inner || "uuid" in inner) return [inner as T];
  }

  if ("id" in root || "uuid" in root) return [root as T];
  return [];
}

function extractPagination(raw: unknown): PayrollPagination | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const root = raw as Record<string, unknown>;
  if (root.pagination && typeof root.pagination === "object")
    return root.pagination as PayrollPagination;

  const meta = root.meta;
  if (meta && typeof meta === "object") {
    const pagination = (meta as Record<string, unknown>).pagination;
    if (pagination && typeof pagination === "object")
      return pagination as PayrollPagination;
  }

  const data = root.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = data as Record<string, unknown>;
    if (inner.pagination && typeof inner.pagination === "object")
      return inner.pagination as PayrollPagination;

    const innerMeta = inner.meta;
    if (innerMeta && typeof innerMeta === "object") {
      const pagination = (innerMeta as Record<string, unknown>).pagination;
      if (pagination && typeof pagination === "object")
        return pagination as PayrollPagination;
    }
  }

  return undefined;
}

function extractItem<T>(raw: unknown): T {
  const rows = extractRows<T>(raw);
  if (rows.length > 0) return rows[0];
  const root = raw as Record<string, unknown>;
  return (root?.data ?? raw) as T;
}

function withNormalizedRows<T>(
  raw: unknown,
  rows: T[],
): PayrollListResponse<T> {
  const response = (
    raw && typeof raw === "object" ? raw : {}
  ) as PayrollListResponse<T>;
  return {
    success: response.success ?? true,
    message: response.message ?? "",
    status_code: response.status_code,
    data: rows,
    pagination: response.pagination,
    meta: response.meta,
  };
}

function withNormalizedItem<T>(raw: unknown, item: T): PayrollItemResponse<T> {
  const response = (
    raw && typeof raw === "object" ? raw : {}
  ) as PayrollItemResponse<T>;
  return {
    success: response.success ?? true,
    message: response.message ?? "",
    status_code: response.status_code,
    data: item,
  };
}

function toNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown) {
  const parsed = toNumber(value);
  return parsed > 0 ? parsed : undefined;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function lastPageFrom(pagination?: PayrollPagination) {
  const direct = toNumber(pagination?.last_page ?? pagination?.total_pages);
  if (direct > 0) return direct;

  const total = toNumber(pagination?.total);
  const perPage = toNumber(pagination?.per_page);
  if (total > 0 && perPage > 0) return Math.max(1, Math.ceil(total / perPage));

  return 1;
}

function uniqueById<T extends { id: number | string; uuid?: string }>(
  rows: T[],
) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = String(row.uuid ?? row.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectEmployeeCompanyIds(row: Record<string, unknown>): number[] {
  const ids = new Set<number>();
  const add = (value: unknown) => {
    const numeric = toNumber(value);
    if (numeric > 0) ids.add(numeric);
  };

  add(row.company_id);
  const company = row.company;
  if (company && typeof company === "object")
    add((company as Record<string, unknown>).id);

  const branch = row.branch;
  if (branch && typeof branch === "object")
    add((branch as Record<string, unknown>).company_id);

  if (Array.isArray(row.branches)) {
    row.branches.forEach((item) => {
      if (item && typeof item === "object")
        add((item as Record<string, unknown>).company_id);
    });
  }

  return [...ids];
}

function normalizeEmployee(raw: unknown): PayrollEmployee {
  if (!raw || typeof raw !== "object") return { id: 0, name: "" };
  const row = raw as Record<string, unknown>;
  const id = toNumber(row.id);
  const company_ids = collectEmployeeCompanyIds(row);
  return {
    id,
    uuid: row.uuid != null ? String(row.uuid) : undefined,
    name: firstText(
      row.name,
      row.employee_name,
      row.full_name,
      [row.first_name, row.last_name].filter(Boolean).join(" "),
    ),
    email: row.email != null ? String(row.email) : undefined,
    employee_id: row.employee_id != null ? String(row.employee_id) : undefined,
    employee_code:
      firstText(row.employee_code, row.employee_code_id, row.code) || undefined,
    code: row.code != null ? String(row.code) : undefined,
    role: Array.isArray(row.role) ? row.role.map(String) : [],
    company_ids: company_ids.length ? company_ids : undefined,
  };
}

function normalizeCompany(raw: unknown): PayrollCompany {
  if (!raw || typeof raw !== "object") return { id: 0, name: "" };
  const row = raw as Record<string, unknown>;
  return {
    id: toNumber(row.id),
    uuid: row.uuid != null ? String(row.uuid) : undefined,
    name: firstText(row.name, row.company_name),
  };
}

function normalizePayslipType(raw: unknown): PayslipType {
  if (!raw || typeof raw !== "object") return { id: 0, name: "" };
  const row = raw as Record<string, unknown>;
  return {
    id: toNumber(row.id),
    uuid: row.uuid != null ? String(row.uuid) : undefined,
    name: firstText(row.name, row.title, row.type),
  };
}

function normalizeAccount(raw: unknown): PayrollAccount {
  if (!raw || typeof raw !== "object") return { id: 0, name: "" };
  const row = raw as Record<string, unknown>;
  const name = firstText(row.name, row.account_name, row.title);
  return {
    id: toNumber(row.id),
    uuid: row.uuid != null ? String(row.uuid) : undefined,
    name,
    account_name: name,
  };
}

function normalizeSalaryDeductions(raw: unknown): Salary["deductions"] {
  if (Array.isArray(raw)) return raw as Salary["deductions"];
  if (!raw || typeof raw !== "object") return undefined;

  const deductions = raw as Record<string, unknown>;
  const loan = (
    deductions.loan && typeof deductions.loan === "object"
      ? deductions.loan
      : {}
  ) as Record<string, unknown>;
  const saturation = (
    deductions.saturation && typeof deductions.saturation === "object"
      ? deductions.saturation
      : {}
  ) as Record<string, unknown>;

  return {
    loan: {
      monthly_deduction: toNumber(loan.monthly_deduction ?? loan.monthly),
      original_amount: toNumber(loan.original_amount ?? loan.amount),
      remaining_total: toNumber(loan.remaining_total),
    },
    saturation: {
      monthly_regular: toNumber(saturation.monthly_regular),
      one_time_total: toNumber(saturation.one_time_total),
      remaining_total: toNumber(saturation.remaining_total),
    },
    total: toNumber(deductions.total),
  };
}

function normalizeSalary(raw: unknown): Salary {
  const row = (raw ?? {}) as Record<string, unknown>;
  const employee = row.employee ? normalizeEmployee(row.employee) : undefined;
  const company = row.company ? normalizeCompany(row.company) : undefined;
  const payslipType =
    row.payslip_type || row.payslipType
      ? normalizePayslipType(row.payslip_type ?? row.payslipType)
      : undefined;
  const account = row.account ? normalizeAccount(row.account) : undefined;

  return {
    id: toNumber(row.id),
    uuid: row.uuid != null ? String(row.uuid) : undefined,
    employee_id:
      row.employee_id != null ? String(row.employee_id) : (employee?.id ?? ""),
       employee_uuid:
      row.employee_uuid != null
        ? String(row.employee_uuid)
        : employee?.uuid,
    employee_name: firstText(row.employee_name, employee?.name) || undefined,
    employee_code:
      firstText(
        row.employee_code,
        row.code,
        employee?.employee_code,
        employee?.employee_id,
      ) || undefined,
    company_id:
      row.company_id != null ? String(row.company_id) : (company?.id ?? ""),
    company_name: firstText(row.company_name, company?.name) || undefined,
    payslip_type_id:
      row.payslip_type_id != null
        ? String(row.payslip_type_id)
        : payslipType?.id,
    payslip_type_name:
      firstText(row.payslip_type_name, payslipType?.name) || undefined,
    account_id: row.account_id != null ? String(row.account_id) : account?.id,
    account_name:
      firstText(row.account_name, account?.name, account?.account_name) ||
      undefined,
    base_salary: row.base_salary != null ? String(row.base_salary) : 0,
    total_additions:
      row.total_additions != null ? String(row.total_additions) : undefined,
    net_salary: row.net_salary != null ? String(row.net_salary) : undefined,
    month: (row.month ?? new Date().getMonth() + 1) as string | number,
    year: toNumber(row.year) || new Date().getFullYear(),
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
    employee,
    company,
    payslip_type: payslipType,
    account,
    additions: Array.isArray(row.additions)
      ? (row.additions as Salary["additions"])
      : undefined,
    deductions: normalizeSalaryDeductions(row.deductions),
  };
}

function normalizeMonthNumber(value: string | number): number | null {
  if (typeof value === "number")
    return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;

  const normalized = value.trim();
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12)
    return numeric;

  const monthIndex = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].findIndex((month) => month === normalized.toLowerCase());

  return monthIndex >= 0 ? monthIndex + 1 : null;
}

function normalizeNoteAttachment(raw: unknown): SalaryNoteAttachment | null {
  if (typeof raw === 'string') {
    const url = raw.trim();
    if (!url) return null;
    const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '') || 'attachment';
    return {
      id: url,          
      name: fileName,
      url,
    };
  }
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = firstText(row.id, row.uuid);
  const url = firstText(row.url, row.file_url, row.path);
  if (!id || !url) return null;

  return {
    id,
    uuid: row.uuid != null ? String(row.uuid) : undefined,
    name: firstText(row.name, row.file_name, row.original_name) || 'attachment',
    url,
    size: toNullableNumber(row.size ?? row.file_size),
    mime_type: row.mime_type != null ? String(row.mime_type) : undefined,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
  };
}

function normalizeSalaryNote(raw: unknown): SalaryNote {
  const row = (raw ?? {}) as Record<string, unknown>;
  const attachmentsRaw = Array.isArray(row.attachments)
    ? row.attachments
    : Array.isArray((row as Record<string, unknown>).files)
      ? ((row as Record<string, unknown>).files as unknown[])
      : [];

  return {
    uuid: row.uuid != null ? String(row.uuid) : undefined,
    note: firstText(row.note, row.notes) || "",
    attachments: attachmentsRaw
      .map(normalizeNoteAttachment)
      .filter((a): a is SalaryNoteAttachment => a !== null),
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
  };
}

function salaryMatchesFilters(salary: Salary, filters: SalaryListFilters) {
  if (
    filters.employee_id != null &&
    Number(salary.employee_id) !== Number(filters.employee_id)
  )
    return false;
  if (
    filters.company_id != null &&
    Number(salary.company_id) !== Number(filters.company_id)
  )
    return false;
  if (filters.year != null && Number(salary.year) !== Number(filters.year))
    return false;

  if (filters.month != null) {
    const salaryMonth = normalizeMonthNumber(salary.month);
    const filterMonth = normalizeMonthNumber(filters.month);
    if (
      salaryMonth == null ||
      filterMonth == null ||
      salaryMonth !== filterMonth
    )
      return false;
  }

  return true;
}

function buildListParams(
  page: number,
  perPage: number,
  search?: string,
  filters?: SalaryListFilters,
  orderBy?: string,
  order?: string,
) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (search?.trim()) params.set("search", search.trim());
  if (filters?.employee_id != null)
    params.set("employee_id", String(filters.employee_id));
  if (filters?.company_id != null)
    params.set("company_id", String(filters.company_id));
  if (filters?.month != null) params.set("month", String(filters.month));
  if (filters?.year != null) params.set("year", String(filters.year));
  if (orderBy?.trim()) params.set("order_by", orderBy.trim());
  if (order?.trim()) params.set("order", order.trim());
  return params;
}

async function getList<T>(
  path: string,
  token: string | undefined,
  normalizer: (row: unknown) => T,
  fallback: string,
  params?: URLSearchParams,
): Promise<PayrollListResponse<T>> {
  const raw = await requestJson<unknown>(
    `${path}${params?.toString() ? `?${params.toString()}` : ""}`,
    { token, fallback },
  );
  return withNormalizedRows(raw, extractRows<unknown>(raw).map(normalizer));
}

async function getAllPagedRows<
  T extends { id: number | string; uuid?: string },
>(
  path: string,
  token: string | undefined,
  normalizer: (row: unknown) => T,
  fallback: string,
) {
  const perPage = 1000;
  const fetchPage = async (page: number) => {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    return requestJson<unknown>(`${path}?${params.toString()}`, {
      token,
      fallback,
    });
  };

  const firstRaw = await fetchPage(1);
  const rows = extractRows<unknown>(firstRaw).map(normalizer);
  const lastPage = lastPageFrom(extractPagination(firstRaw));

  if (lastPage > 1) {
    const pages = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
    const remaining = await Promise.all(pages.map(fetchPage));
    rows.push(
      ...remaining.flatMap((raw) => extractRows<unknown>(raw).map(normalizer)),
    );
  }

  return uniqueById(rows);
}

export const salaryService = {
  async getAll(
    page: number = 1,
    perPage: number = 10,
    token?: string,
    search?: string,
    orderByOrFilters?: string | SalaryListFilters,
    order?: string,
  ): Promise<SalaryListResponse> {
    requireLoadedPermission("salary-list");
    const filters =
      typeof orderByOrFilters === "object" ? orderByOrFilters : undefined;
    const orderBy =
      typeof orderByOrFilters === "string" ? orderByOrFilters : undefined;
    const params = buildListParams(
      page,
      perPage,
      search,
      filters,
      orderBy,
      order,
    );
    return getList(
      "/salaries",
      token,
      normalizeSalary,
      "Failed to fetch salaries",
      params,
    );
  },

  async getByUuid(uuid: string, token?: string): Promise<SalaryResponse> {
    requireLoadedPermission("salary-show");
    const raw = await requestJson<unknown>(
      `/salaries/${encodeURIComponent(uuid)}`,
      {
        token,
        fallback: "Failed to fetch salary",
      },
    );
    return withNormalizedItem(raw, normalizeSalary(extractItem<unknown>(raw)));
  },

  async getById(
    uuid: string | number,
    token?: string,
  ): Promise<SalaryResponse> {
    requireLoadedPermission("salary-show");
    return this.getByUuid(String(uuid), token);
  },

  async getByEmployeeId(
    employeeId: number,
    token?: string,
  ): Promise<SalaryListResponse> {
    requireLoadedPermission("salary-list");
    const params = buildListParams(
      1,
      1000,
      undefined,
      { employee_id: employeeId },
      "id",
      "desc",
    );
    return getList(
      "/salaries",
      token,
      normalizeSalary,
      "Failed to fetch employee salaries",
      params,
    );
  },

  async getByEmployeeMonthYear(
    employeeId: number,
    month: string | number,
    year: number,
    token?: string,
    companyId?: number,
  ): Promise<Salary | null> {
    requireLoadedPermission("salary-list");
    try {
      const filters: SalaryListFilters = {
        employee_id: employeeId,
        month,
        year,
      };
      if (companyId != null) filters.company_id = companyId;

      const response = await this.getAll(1, 100, token, undefined, filters);
      const data = response.data.filter((salary) =>
        salaryMatchesFilters(salary, filters),
      );
      if (data[0]) return data[0];

      const fallback = await this.getByEmployeeId(employeeId, token);
      return (
        fallback.data.find((salary) => salaryMatchesFilters(salary, filters)) ??
        null
      );
    } catch {
      return null;
    }
  },

  async create(
    payload: CreateSalaryPayload,
    token?: string,
  ): Promise<SalaryResponse> {
    requireLoadedPermission("salary-create");
    const body = {
      ...payload,
      base_salary: Number(payload.base_salary).toFixed(2),
    };
    const raw = await requestJson<unknown>("/salaries", {
      method: "POST",
      token,
      body: JSON.stringify(body),
      fallback: "Failed to create salary",
    });
    return withNormalizedItem(raw, normalizeSalary(extractItem<unknown>(raw)));
  },

  async getNote(
    salaryUuid: string,
    token?: string,
  ): Promise<SalaryNoteResponse> {
    const raw = await requestJson<unknown>(
      `/salaries/${encodeURIComponent(salaryUuid)}/note`,
      {
        token,
        fallback: "Failed to fetch salary note",
      },
    );
    return withNormalizedItem(
      raw,
      normalizeSalaryNote(extractItem<unknown>(raw)),
    );
  },

 async saveNote(
  salaryUuid: string,
  payload: UpdateSalaryNotePayload,
  token?: string,
): Promise<SalaryNoteResponse> {
  const authToken = requireToken(token);

  const formData = new FormData();

  if (payload.note !== undefined) {
    formData.append("note", payload.note);
  }

  payload.attachments?.forEach((file) => {
    formData.append("attachments[]", file, file.name);
  });

  payload.remove_attachments?.forEach((path) => {
    formData.append("remove_attachments[]", path);
  });

  const response = await fetch(
    requestUrl(`/salaries/${encodeURIComponent(salaryUuid)}/note`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: formData,
    },
  );

  if (!response.ok) {
    await handleError(response, "Failed to save salary note");
  }

  const raw = await response.json();
  return withNormalizedItem(
    raw,
    normalizeSalaryNote(extractItem<unknown>(raw)),
  );
},
  async generate(
  employeeId: number | null,
  month: number | string,
  year: number,
  token?: string,
): Promise<{ success: boolean; message: string; data?: unknown }> {
  requireLoadedPermission("salary-payslip-generate");
  
  const body: Record<string, unknown> = {
    month,
    year,
  };
  if (employeeId != null) body.employee_id = employeeId;

  const raw = await requestJson<unknown>("/salaries/generate-payslips", {
    method: "POST",
    token,
    body: JSON.stringify(body),
    fallback: "Failed to generate salary",
  });

  return raw as { success: boolean; message: string; data?: unknown };
},

  // async deleteNoteAttachment(
  //   salaryUuid: string,
  //   attachmentId: string,
  //   token?: string,
  // ): Promise<void> {
  //   requireLoadedPermission("salary-edit");
  //   await requestJson<unknown>(
  //     `/salaries/${encodeURIComponent(salaryUuid)}/attachments/${encodeURIComponent(attachmentId)}`,
  //     {
  //       method: "DELETE",
  //       token,
  //       fallback: "Failed to delete attachment",
  //     },
  //   );
  // },

  async updateByUuid(
    uuid: string | number,
    payload: UpdateSalaryPayload,
    token?: string,
  ): Promise<SalaryResponse> {
    requireLoadedPermission("salary-edit");
    const body: Record<string, unknown> = { ...payload };
    if (payload.base_salary !== undefined)
      body.base_salary = Number(payload.base_salary).toFixed(2);

    const raw = await requestJson<unknown>(
      `/salaries/${encodeURIComponent(String(uuid))}`,
      {
        method: "PUT",
        token,
        body: JSON.stringify(body),
        fallback: "Failed to update salary",
      },
    );
    return withNormalizedItem(raw, normalizeSalary(extractItem<unknown>(raw)));
  },

  async update(
    uuid: string | number,
    payload: UpdateSalaryPayload,
    token?: string,
  ): Promise<SalaryResponse> {
    return this.updateByUuid(uuid, payload, token);
  },

  async deleteByUuid(uuid: string | number, token?: string): Promise<void> {
    requireLoadedPermission("salary-delete");
    await requestJson<unknown>(
      `/salaries/${encodeURIComponent(String(uuid))}`,
      {
        method: "DELETE",
        token,
        fallback: "Failed to delete salary",
      },
    );
  },

  async delete(uuid: string | number, token?: string): Promise<void> {
    return this.deleteByUuid(uuid, token);
  },

  async createOrUpdate(
    employeeId: number,
    companyId: number,
    baseSalary: number,
    month: string | number,
    year: number,
    token?: string,
    payslipTypeId?: number,
    accountId?: number,
  ): Promise<SalaryResponse> {
    const existing = await this.getByEmployeeMonthYear(
      employeeId,
      month,
      year,
      token,
      companyId,
    );
    const payload: CreateSalaryPayload = {
      employee_id: employeeId,
      company_id: companyId,
      base_salary: baseSalary,
      month,
      year,
      payslip_type_id: payslipTypeId ?? Number(existing?.payslip_type_id ?? 1),
      account_id: accountId ?? Number(existing?.account_id ?? 1),
    };
    return existing
      ? this.updateByUuid(existing.uuid ?? existing.id, payload, token)
      : this.create(payload, token);
  },

  async getEmployee(
    employeeId: number | string,
    token?: string,
  ): Promise<PayrollEmployee> {
    requireLoadedPermission("employee-show");
    const raw = await requestJson<unknown>(
      `/employees/${encodeURIComponent(String(employeeId))}`,
      {
        token,
        fallback: "Failed to fetch employee",
      },
    );
    return normalizeEmployee(extractItem<unknown>(raw));
  },

  async getAllCompanies(token?: string): Promise<PayrollCompany[]> {
    requireLoadedPermission("company-list");
    const rows = await getAllPagedRows(
      "/companies",
      token,
      normalizeCompany,
      "Failed to fetch companies",
    );
    return rows.filter((company) => company.id > 0);
  },
    async getTicketCompanies(token?: string): Promise<PayrollCompany[]> {
    requireLoadedPermission("company-list");
    const rows = await getAllPagedRows(
      "/company-list",
      token,
      normalizeCompany,
      "Failed to fetch companies",
    );
    return rows.filter((company) => company.id > 0);
  },

  async getAllEmployees(token?: string): Promise<PayrollEmployee[]> {
    requireLoadedPermission("employee-list");
    const rows = await getAllPagedRows(
      "/employees",
      token,
      normalizeEmployee,
      "Failed to fetch employees",
    );
    return rows.filter((employee) => employee.id > 0);
  },

  async getEmployeesByCompanyId(
    companyId: number,
    token?: string,
  ): Promise<PayrollEmployee[]> {
    requireLoadedPermission("employee-list");
    const id = toNumber(companyId);
    if (id <= 0) return [];

    const params = new URLSearchParams({
      company_id: String(id),
      page: "1",
      per_page: "1000",
    });
    const raw = await requestJson<unknown>(`/employees?${params}`, {
      token,
      fallback: "Failed to fetch employees for company",
    });

    return uniqueById(
      extractRows<unknown>(raw)
        .map(normalizeEmployee)
        .filter((employee) => employee.id > 0),
    );
  },
  async getEmployeesByCompany(
    companyId: number,
    token?: string,
    search = "",
  ): Promise<PayrollEmployee[]> {
    requireLoadedPermission("employee-list");

    const id = toNumber(companyId);
    if (id <= 0) return [];

    const params = new URLSearchParams({
      company_id: String(id),
      search,
    });

    const raw = await requestJson<unknown>(
      `/employee-list?${params.toString()}`,
      {
        token,
        fallback: "Failed to fetch employees for company",
      },
    );

    return uniqueById(
      extractRows<unknown>(raw)
        .map(normalizeEmployee)
        .filter((employee) => employee.id > 0),
    );
  },

  async getAllPayslipTypes(token?: string): Promise<PayslipType[]> {
    requireLoadedPermission("payslip-type-list");
    const rows = await getAllPagedRows(
      "/payslip-types",
      token,
      normalizePayslipType,
      "Failed to fetch payslip types",
    );
    return rows.filter((type) => type.id > 0);
  },

  async getAllAccounts(token?: string): Promise<PayrollAccount[]> {
    requireLoadedPermission("accountlist-list");
    const rows = await getAllPagedRows(
      "/account-lists",
      token,
      normalizeAccount,
      "Failed to fetch accounts",
    );
    return rows.filter((account) => account.id > 0);
  },
};
