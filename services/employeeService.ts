import type {
  ApiResponse,
  Employee,
  CreateEmployeePayload,
  UpdateEmployeePayload,
  ReplacementEmployee,
} from "~/types/employee";
import { createApiError } from "~/utils/apiError";
import { requireLoadedPermission } from "~/utils/permissionAccess";

export interface EmployeeListParams {
  page?: number;
  perPage?: number;
  search?: string;
  month?: number | string;
  year?: number | string;
  include_admins?: boolean;
}

export interface EmployeeListPagination {
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  nextPageUrl: string | null;
  prevPageUrl: string | null;
  hasPaginationMetadata: boolean;
}

export interface PaginatedEmployeesResult {
  items: Employee[];
  pagination: EmployeeListPagination;
}

function getBaseUrl() {
  const config = useRuntimeConfig();
  return config.public.apiUrl || "http://127.0.0.1:8000/api";
}
function sheBaseUrl() {
  const config = useRuntimeConfig();
  return config.public.apiShe || "http://127.0.0.1:8000/api";
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function multipartHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function employeeMatchesKey(employee: Employee, key: string): boolean {
  const raw = employee as Employee & Record<string, unknown>;
  const values = [
    raw.uuid,
    raw.employee_uuid,
    employee.id,
    employee.employee_id,
    raw.employee_code,
    raw.code,
  ];
  return values.some((value) => value != null && String(value) === key);
}

function employeeUuid(employee: Employee): string {
  const raw = employee as Employee & Record<string, unknown>;
  return String(raw.uuid ?? raw.employee_uuid ?? employee.id);
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function nullableUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeReplacementEmployee(
  raw: unknown,
): ReplacementEmployee | null {
  const item = asRecord(raw);
  if (!item) return null;

  const numericId = Number(item.id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;

  return {
    id: numericId,
    uuid: String(item.uuid ?? ""),
    name: String(item.name ?? `Employee #${numericId}`),
  };
}

function hasPaginationFields(
  value: Record<string, any> | null,
): value is Record<string, any> {
  if (!value) return false;
  return [
    "total",
    "per_page",
    "current_page",
    "last_page",
    "total_pages",
    "next_page_url",
  ].some((key) => value[key] != null);
}

export function normalizePaginatedEmployees(
  payload: unknown,
  fallback: Required<Pick<EmployeeListParams, "page" | "perPage">>,
): PaginatedEmployeesResult {
  const root = asRecord(payload);
  const dataContainer = asRecord(root?.data);
  const nestedData = dataContainer?.data;

  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.data)
      ? root.data
      : Array.isArray(nestedData)
        ? nestedData
        : [];

  const items = rawItems.filter((item): item is Employee =>
    Boolean(item && typeof item === "object"),
  );

  const rootMeta = asRecord(root?.meta);
  const dataMeta = asRecord(dataContainer?.meta);
  const paginationCandidates = [
    asRecord(rootMeta?.pagination),
    asRecord(dataMeta?.pagination),
    asRecord(root?.pagination),
    asRecord(dataContainer?.pagination),
    dataContainer,
    root,
  ];
  const paginationSource =
    paginationCandidates.find(hasPaginationFields) ?? null;
  const hasPaginationMetadata = paginationSource != null;

  const total = nonNegativeInteger(paginationSource?.total, items.length);
  const perPage = positiveInteger(paginationSource?.per_page, fallback.perPage);
  const currentPage = positiveInteger(
    paginationSource?.current_page,
    fallback.page,
  );
  const derivedLastPage = Math.max(1, Math.ceil(total / perPage));
  const lastPage = Math.max(
    currentPage,
    positiveInteger(
      paginationSource?.last_page ?? paginationSource?.total_pages,
      derivedLastPage,
    ),
  );
  const links = asRecord(paginationSource?.links);

  return {
    items,
    pagination: {
      total,
      perPage,
      currentPage,
      lastPage,
      nextPageUrl: nullableUrl(paginationSource?.next_page_url ?? links?.next),
      prevPageUrl: nullableUrl(paginationSource?.prev_page_url ?? links?.prev),
      hasPaginationMetadata,
    },
  };
}

async function requestEmployeePage(
  token: string,
  params: Required<Pick<EmployeeListParams, "page" | "perPage">> &
    Pick<EmployeeListParams, "search" | "month" | "year" | "include_admins">,
): Promise<{
  payload: Record<string, any> | null;
  result: PaginatedEmployeesResult;
}> {
  requireLoadedPermission("employee-list");

  const query = new URLSearchParams({
    page: String(params.page),
    per_page: String(params.perPage),
  });
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.month != null && String(params.month).trim())
    query.set("month", String(params.month).trim());
  if (params.year != null && String(params.year).trim())
    query.set("year", String(params.year).trim());

  // Defaults include_admins to true if undefined; sets 'false' when false, otherwise 'true'
  const includeAdmins = params.include_admins ?? true;
  query.set("include_admins", String(includeAdmins));

  const response = await fetch(`${getBaseUrl()}/employees?${query}`, {
    method: "GET",
    headers: headers(token),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw createApiError(
      (err as { message?: string }).message || "Failed to fetch employees",
      response.status,
      err,
    );
  }

  const payload = await response.json();
  return {
    payload: asRecord(payload),
    result: normalizePaginatedEmployees(payload, params),
  };
}

export const employeeService = {
  async importFromExcel(
    file: File,
    token: string,
  ): Promise<{ message: string }> {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`${getBaseUrl()}/employees/import`, {
      method: "POST",
      headers: multipartHeaders(token),
      body,
    });
    const payload = await response.json().catch(() => null);
    if (
      !response.ok ||
      payload?.success === false ||
      payload?.status === false
    ) {
      throw createApiError(
        typeof payload?.message === "string"
          ? payload.message
          : "Unable to import employees. Please try again.",
        response.status,
        payload,
      );
    }
    if (!payload && response.status !== 204) {
      throw new Error(
        "The server returned an unexpected response. Check the employee list before trying again.",
      );
    }
    return {
      message:
        typeof payload?.message === "string"
          ? payload.message
          : "Employees imported successfully.",
    };
  },

  async downloadImportTemplate(
    token: string,
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`${getBaseUrl()}/employees/export`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || /json|text\/html/i.test(contentType)) {
      const error = await response.json().catch(() => null);
      throw createApiError(
        typeof error?.message === "string"
          ? error.message
          : "Unable to download the template. Please try again.",
        response.status,
        error,
      );
    }
    const blob = await response.blob();
    if (!blob.size)
      throw new Error("The downloaded template is empty. Please try again.");

    const disposition = response.headers.get("content-disposition") || "";
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    let filename =
      disposition
        .match(/filename="([^"]+)"|filename=([^;]+)/i)
        ?.slice(1)
        .find(Boolean)
        ?.trim() || "employees-template.xlsx";
    if (encodedName) {
      try {
        filename = decodeURIComponent(encodedName.trim());
      } catch {
        /* Keep the fallback filename. */
      }
    }
    filename = filename.replace(/[\\/\u0000-\u001f\u007f]/g, "_");
    return { blob, filename };
  },

  async getPage(
    token: string,
    params: EmployeeListParams = {},
  ): Promise<PaginatedEmployeesResult> {
    const page = positiveInteger(params.page, 1);
    const perPage = positiveInteger(params.perPage, 10);
    const { result } = await requestEmployeePage(token, {
      page,
      perPage,
      search: params.search,
      month: params.month,
      year: params.year,
      include_admins: params.include_admins ?? true,
    });
    return result;
  },

  async getAll(
    token: string,
    page: number = 1,
    perPage: number = 10,
    search?: string,
    period?: Pick<EmployeeListParams, "month" | "year">,
    include_admins: boolean = true,
  ): Promise<ApiResponse<Employee[]>> {
    const normalizedPage = positiveInteger(page, 1);
    const normalizedPerPage = positiveInteger(perPage, 10);
    const { payload, result } = await requestEmployeePage(token, {
      page: normalizedPage,
      perPage: normalizedPerPage,
      search,
      month: period?.month,
      year: period?.year,
      include_admins,
    });

    return {
      success: payload?.success !== false,
      message: typeof payload?.message === "string" ? payload.message : "",
      status_code: Number(payload?.status_code) || 200,
      data: result.items,
      meta: {
        pagination: {
          total: result.pagination.total,
          count: result.items.length,
          per_page: result.pagination.perPage,
          current_page: result.pagination.currentPage,
          total_pages: result.pagination.lastPage,
          last_page: result.pagination.lastPage,
          next_page_url: result.pagination.nextPageUrl,
          prev_page_url: result.pagination.prevPageUrl,
        },
      },
    };
  },

  async getAssignmentList(
    token: string,
  ): Promise<ApiResponse<Employee[]> | Employee[]> {
    requireLoadedPermission("employee-list");
    const response = await fetch(`${getBaseUrl()}/assign-employee-list`, {
      method: "GET",
      headers: headers(token),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message ||
          "Failed to fetch assignment employees",
        response.status,
        err,
      );
    }
    return response.json();
  },

  async getReplacementEmployees(
    employeeId: string | number,
    token: string,
  ): Promise<ApiResponse<ReplacementEmployee[]>> {
    const normalizedEmployeeId = String(employeeId ?? "").trim();
    const numericEmployeeId = Number(normalizedEmployeeId);

    if (
      !normalizedEmployeeId ||
      !/^\d+$/.test(normalizedEmployeeId) ||
      !Number.isInteger(numericEmployeeId) ||
      numericEmployeeId <= 0
    ) {
      const message =
        "A valid employee ID is required to load replacement employees.";
      throw createApiError(message, 400, { message });
    }

    const params = new URLSearchParams({
      employee_id: normalizedEmployeeId,
    });
    const response = await fetch(
      `${getBaseUrl()}/employee-replacement-list?${params.toString()}`,
      {
        method: "GET",
        headers: headers(token),
      },
    );

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const errorRecord = asRecord(errorPayload);
      throw createApiError(
        typeof errorRecord?.message === "string"
          ? errorRecord.message
          : "Failed to fetch replacement employees.",
        response.status,
        errorPayload,
      );
    }

    const payload = await response.json();
    const payloadRecord = asRecord(payload) ?? {};
    const nestedData = asRecord(payloadRecord.data);
    const rawRows = Array.isArray(payloadRecord.data)
      ? payloadRecord.data
      : Array.isArray(nestedData?.data)
        ? nestedData.data
        : [];
    const data = rawRows
      .map(normalizeReplacementEmployee)
      .filter((employee): employee is ReplacementEmployee => employee !== null);

    return {
      success: payloadRecord.success !== false,
      message:
        typeof payloadRecord.message === "string" ? payloadRecord.message : "",
      status_code: Number(payloadRecord.status_code) || response.status,
      data,
    };
  },

  async getByUuid(uuid: string, token: string): Promise<ApiResponse<Employee>> {
    requireLoadedPermission("employee-show");

    const response = await fetch(`${getBaseUrl()}/employees/${uuid}`, {
      method: "GET",
      headers: headers(token),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message || "Failed to fetch employee",
        response.status,
        err,
      );
    }
    return response.json();
  },

  async getById(id: string, token: string): Promise<ApiResponse<Employee>> {
    requireLoadedPermission("employee-show");

    console.warn(
      "employeeService.getById is deprecated; use getByUuid instead.",
    );
    const key = String(id ?? "").trim();
    if (!key)
      throw createApiError("Invalid employee ID", 400, {
        message: "Invalid employee ID",
      });
    if (isUuid(key)) return this.getByUuid(key, token);

    const listResponse = await this.getAll(token, 1, 1000);
    const employees = Array.isArray(listResponse.data)
      ? listResponse.data
      : Array.isArray((listResponse.data as { data?: Employee[] })?.data)
        ? (listResponse.data as { data: Employee[] }).data
        : [];
    const employee = employees.find((item) => employeeMatchesKey(item, key));
    if (!employee) {
      throw createApiError("Employee UUID not found for this ID", 404, {
        message: "Employee UUID not found for this ID",
      });
    }

    return this.getByUuid(employeeUuid(employee), token);
  },

  /**
   * Current user's employee row.
   * Backend may treat /employees/me as /employees/{id}, so we bypass that route.
   */
  async getMyProfile(
    token: string,
    employeeUuid?: string,
  ): Promise<ApiResponse<Employee>> {
    const normalizedId =
      typeof employeeUuid === "string" ? employeeUuid.trim() : "";
    if (normalizedId) {
      return isUuid(normalizedId)
        ? this.getByUuid(normalizedId, token)
        : this.getById(normalizedId, token);
    }

    throw createApiError(
      "Cannot fetch employee profile. The /employees/me endpoint is not supported by the backend.",
      404,
      { message: "Endpoint not supported" },
    );
  },

  async create(
    payload: CreateEmployeePayload,
    token: string,
  ): Promise<ApiResponse<Employee>> {
    requireLoadedPermission("employee-create");

    const response = await fetch(`${getBaseUrl()}/employees`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message || "Failed to create employee",
        response.status,
        err,
      );
    }
    return response.json();
  },
    async createAdmin(
    payload: CreateEmployeePayload,
    token: string,
  ): Promise<ApiResponse<Employee>> {
    // requireLoadedPermission("employee-create");
    const response = await fetch(`${getBaseUrl()}/subadmin`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message || "Failed to create Admin",
        response.status,
        err,
      );
    }
    return response.json();
  },

  async uploadDocuments(
    employeeId: string,
    formData: FormData,
    token: string,
  ): Promise<ApiResponse<unknown>> {
    requireLoadedPermission("employee-document-create");
    const response = await fetch(
      `${getBaseUrl()}/employees/${employeeId}/documents`,
      {
        method: "POST",
        headers: multipartHeaders(token),
        body: formData,
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message ||
          "Failed to upload employee documents",
        response.status,
        err,
      );
    }
    return response.json();
  },

  async update(
    id: string,
    payload: Partial<UpdateEmployeePayload>,
    token: string,
  ): Promise<ApiResponse<Employee>> {
    requireLoadedPermission("employee-edit");

    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    const fd = new FormData();
    Object.entries(cleanPayload).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (value instanceof File) {
        fd.append(key, value);
      } else if (typeof value === "object") {
        fd.append(key, JSON.stringify(value));
      } else {
        fd.append(key, String(value));
      }
    });

    if (process.dev && (cleanPayload.branch_id || cleanPayload.department_id)) {
      console.log("[Employee Update] Sending branch/department:", {
        branch_id: cleanPayload.branch_id,
        department_id: cleanPayload.department_id,
        branch_ids: cleanPayload.branch_ids,
        department_ids: cleanPayload.department_ids,
      });
    }

    const response = await fetch(`${getBaseUrl()}/employees/${id}`, {
      method: "PUT",
      headers: multipartHeaders(token),
      body: fd,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message || "Failed to update employee",
        response.status,
        err,
      );
    }
    return response.json();
  },
  async updateAdmin(
    id: string,
    payload: Partial<UpdateEmployeePayload>,
    token: string,
  ): Promise<ApiResponse<Employee>> {
    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    const fd = new FormData();
    Object.entries(cleanPayload).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (value instanceof File) {
        fd.append(key, value);
      } else if (typeof value === "object") {
        fd.append(key, JSON.stringify(value));
      } else {
        fd.append(key, String(value));
      }
    });

    const response = await fetch(`${getBaseUrl()}/subadmin`, {
      method: "PUT",
      headers: multipartHeaders(token),
      body: fd,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message || "Failed to update admin",
        response.status,
        err,
      );
    }
    return response.json();
  },

  async delete(id: string, token: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission("employee-delete");

    const response = await fetch(`${getBaseUrl()}/employees/${id}`, {
      method: "DELETE",
      headers: headers(token),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message || "Failed to delete employee",
        response.status,
        err,
      );
    }
    return response.json();
  },

  async verifyImportCredentials(
    email: string,
    password: string,
    token: string,
    companyName?: string,
    companyEmail?: string,
    domain?: string,
  ): Promise<ApiResponse<{ valid: boolean; user?: any }>> {
    const response = await fetch(
      `${sheBaseUrl()}/integrations/bhu/auth/token`,
      {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          email,
          password,
          company_name: companyName,
          company_email: companyEmail,
          domain: domain,
        }),
      },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message || "Failed to verify credentials",
        response.status,
        err,
      );
    }

    return response.json();
  },

  async getHiredFromSHE(
    token: string,
    page: number = 1,
    perPage: number = 10,
    search?: string,
  ): Promise<ApiResponse<Employee[]>> {
    requireLoadedPermission("employee-list");

    const query = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (search?.trim()) query.set("search", search.trim());

    const response = await fetch(
      `${sheBaseUrl()}/integrations/bhu/hired-applicants/export?${query}`,
      {
        method: "GET",
        headers: headers(token),
      },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message ||
          "Failed to fetch hired employees from SHE",
        response.status,
        err,
      );
    }

    const payload = await response.json();
    const payloadRecord = asRecord(payload) ?? {};
    const rawData = Array.isArray(payloadRecord.data)
      ? payloadRecord.data
      : Array.isArray(payloadRecord)
        ? payloadRecord
        : [];

    const meta = payloadRecord.meta.pagination || {};
    const links = payloadRecord.links || {};

    return {
      success: payloadRecord.success !== false,
      message:
        typeof payloadRecord.message === "string" ? payloadRecord.message : "",
      status_code: Number(payloadRecord.status_code) || response.status,
      data: rawData,
      meta: {
        pagination: {
          total: Number(meta.total) || rawData.length,
          count: rawData.length,
          per_page: Number(meta.per_page) || perPage,
          current_page: Number(meta.current_page) || page,
          total_pages:
            Number(meta.last_page) ||
            Math.ceil((Number(meta.total) || rawData.length) / perPage),
          last_page:
            Number(meta.last_page) ||
            Math.ceil((Number(meta.total) || rawData.length) / perPage),
          next_page_url: links.next || null,
          prev_page_url: links.prev || null,
        },
      },
    };
  },

  async importFromSHE(
    employees: { employees: any[] },
    token: string,
  ): Promise<
    ApiResponse<{
      employees: any[];
      failures: Array<{
        she_employee_id: number;
        email: string;
        phone: string;
        error: string;
      }>;
    }>
  > {
    requireLoadedPermission("employee-create");

    const response = await fetch(`${getBaseUrl()}/import-employees`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(employees),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message ||
          "Failed to import employees from SHE",
        response.status,
        err,
      );
    }

    return response.json();
  },

  async LogoutShe(token: string): Promise<Response> {
    requireLoadedPermission("employee-list");

    try {
      const response = await fetch(`${sheBaseUrl()}/integrations/bhu/logout`, {
        method: "POST",
        headers: headers(token),
      });

      if (!response.ok) {
        let err: any = {};
        try {
          err = await response.json();
        } catch {
          err = {};
        }

        throw createApiError(
          (err as { message?: string }).message || "Failed to logout from SHE",
          response.status,
          err,
        );
      }

      return response;
    } catch (error: any) {
      console.error("LogoutShe error:", error);

      if (error.status_code) {
        throw error;
      }

      throw createApiError(
        error?.message || "An error occurred during logout",
        500,
        error,
      );
    }
  },

  async getAlreadyHiredSheEmployees(
    token: string,
  ): Promise<ApiResponse<Array<{ she_employee_id: number; email: string }>>> {
    requireLoadedPermission("employee-list");

    const response = await fetch(`${getBaseUrl()}/get-she-employees`, {
      method: "GET",
      headers: headers(token),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message ||
          "Failed to fetch already hired SHE employees",
        response.status,
        err,
      );
    }

    return response.json();
  },

  async uploadAvatar(
    employeeId: string | number,
    file: File,
    token: string,
  ): Promise<ApiResponse<{ avatar_url?: string; avatar?: string }>> {
    requireLoadedPermission("employee-edit");

    const normalizedId = String(employeeId ?? "").trim();
    if (!normalizedId) {
      throw createApiError("Employee ID is required to upload avatar", 400, {
        message: "Employee ID is required",
      });
    }
    if (!(file instanceof File)) {
      throw createApiError("A valid image file is required", 400, {
        message: "A valid image file is required",
      });
    }

    const body = new FormData();
    body.append("avatar", file);

    const response = await fetch(`${getBaseUrl()}/employees/avatar`, {
      method: "POST",
      headers: multipartHeaders(token),
      body,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message ||
          "Failed to upload employee avatar",
        response.status,
        err,
      );
    }

    return response.json();
  },

  async deleteAvatar(
    employeeId: string | number,
    token: string,
  ): Promise<ApiResponse<unknown>> {
    requireLoadedPermission("employee-edit");

    const normalizedId = String(employeeId ?? "").trim();
    if (!normalizedId) {
      throw createApiError("Employee ID is required to delete avatar", 400, {
        message: "Employee ID is required",
      });
    }

    const response = await fetch(`${getBaseUrl()}/employees/avatar`, {
      method: "DELETE",
      headers: headers(token),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        (err as { message?: string }).message ||
          "Failed to delete employee avatar",
        response.status,
        err,
      );
    }

    return response.json();
  },
};
