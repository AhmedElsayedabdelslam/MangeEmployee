import { createApiError } from "~/utils/apiError";
import { entityApiKey, isEntityUuidKey } from "~/utils/entityApiKey";
import { requireLoadedPermission } from "~/utils/permissionAccess";

export interface ApiDesignation {
  id: string;
  uuid?: string;
  name: string;
  branch?: string;
  branch_name?: string;
  company?: string;
  branch_id?: string;
  department_id: string;
  department_name?: string;
  department?:
    | {
        id: string;
        uuid?: string;
        name: string;
        branch_id: string;
        branch_name?: string;
      }
    | string;
  employees_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateDesignationPayload {
  name: string;
  branch_id: string;
  department_id: string;
  branch?: string;
  department?: string;
}

export interface UpdateDesignationPayload {
  name: string;
  branch_id: string;
  department_id: string;
  branch?: string;
  department?: string;
}

function resolveUrl(path: string): string {
  const config = useRuntimeConfig();
  const base = config.public.apiUrl || "/api";
  if (base.startsWith("http")) return `${base}${path}`;
  if (typeof window !== "undefined") return `${base}${path}`;
  return `http://localhost:3000${base}${path}`;
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
    err.message ||
    (err.errors &&
      Object.values(err.errors as Record<string, string[]>).flat()[0]) ||
    fallback;
  throw createApiError(msg, response.status, err);
}

export const designationService = {
  async getAll(
    page: number = 1,
    perPage: number = 10,
    token: string,
    search?: string,
    departmentId?: string | null,
  ) {
    requireLoadedPermission("designation-list");
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (search?.trim()) params.set("search", search.trim());
    if (departmentId) params.set("department_id", String(departmentId));

    const response = await fetch(`${resolveUrl("/designations")}?${params}`, {
      method: "GET",
      headers: headers(token),
    });
    if (!response.ok)
      await handleError(response, "Failed to fetch designations");
    const json = await response.json();
    if (json.data === null || json.data === undefined) json.data = [];
    return json;
  },

  async getByBranchAndDepartment(
    branchId: string,
    departmentId: string,
    token: string,
    companyId?: string,
  ) {
    requireLoadedPermission("designation-list");
    const params = new URLSearchParams({
      branch_id: String(branchId),
      department_id: String(departmentId),
    });
    if (companyId) {
      params.set("company_id", String(companyId));
    }

    const response = await fetch(
      `${resolveUrl("/get-by-branch-and-department")}?${params.toString()}`,
      {
        method: "GET",
        headers: headers(token),
      },
    );
    if (!response.ok)
      await handleError(response, "Failed to fetch designations");
    const json = await response.json();
    if (json.data === null || json.data === undefined) json.data = [];
    return json;
  },

  async getById(id: string, token: string) {
    requireLoadedPermission("designation-show");
    const response = await fetch(resolveUrl(`/designations/${id}`), {
      method: "GET",
      headers: headers(token),
    });
    if (!response.ok)
      await handleError(response, "Failed to fetch designation");
    return response.json();
  },

  /**
   * PUT /designations/{uuid} matches Postman; resolve UUID when the list row only has numeric id.
   */
  async resolveUpdateRouteKey(
    entity: ApiDesignation,
    token: string,
  ): Promise<string> {
    const key = entityApiKey(entity);
    if (key && isEntityUuidKey(key)) return key;
    try {
      const detail = await designationService.getById(
        key || String(entity.id ?? ""),
        token,
      );
      const resolved = detail?.data?.data ?? detail?.data ?? detail;
      if (
        resolved &&
        typeof resolved === "object" &&
        !Array.isArray(resolved)
      ) {
        const row = resolved as ApiDesignation;
        const u = row.uuid != null ? String(row.uuid).trim() : "";
        if (u && isEntityUuidKey(u)) return u;
        const idStr = row.id != null ? String(row.id).trim() : "";
        if (idStr && isEntityUuidKey(idStr)) return idStr;
      }
    } catch {
      /* fall through */
    }
    return key;
  },

  async create(payload: CreateDesignationPayload, token: string) {
    requireLoadedPermission("designation-create");
    const response = await fetch(resolveUrl("/designations"), {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(payload),
    });
    if (!response.ok)
      await handleError(response, "Failed to create designation");
    return response.json();
  },

  async update(id: string, payload: UpdateDesignationPayload, token: string) {
    requireLoadedPermission("designation-edit");
    const response = await fetch(
      resolveUrl(`/designations/${encodeURIComponent(id)}`),
      {
        method: "PUT",
        headers: headers(token),
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok)
      await handleError(response, "Failed to update designation");
    return response.json();
  },

  async delete(id: string, token: string) {
    requireLoadedPermission("designation-delete");
    const response = await fetch(resolveUrl(`/designations/${id}`), {
      method: "DELETE",
      headers: headers(token),
    });
    if (!response.ok)
      await handleError(response, "Failed to delete designation");
    return response.json();
  },
};
