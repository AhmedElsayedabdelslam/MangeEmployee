import type { ApiResponse } from "~/types/api";
import { createApiError } from "~/utils/apiError";
import { hasLoadedPermission, requireLoadedPermission } from "~/utils/permissionAccess";

export type PermissionGroup = "module" | "system-setting" | null;
export type RoleScope = "self" | "branch" | "department" | "company" | "global";

export interface Permission {
  id: number;
  name: string;
  guard_name?: string;
  group: PermissionGroup;
  category?: string;
}

export interface Role {
  id: number;
  uuid: string;
  name: string;
  guard_name: string;
  scope_type?: RoleScope | string;
  scope?: RoleScope | string;
  company_name?: string;
  count_permissions?: number;
  is_default?: boolean | 0 | 1 | "0" | "1";
  allowed_to_delete?: 0 | 1 | "0" | "1" | boolean;
  permissions?: Permission[];
}

export interface ListRolesParams {
  page?: number;
  per_page?: number;
  order_by?: string;
  order?: "asc" | "desc";
  company_id?: string | number;
  scope?: RoleScope | string;
}

function resolveUrl(path: string): string {
  const config = useRuntimeConfig();
  const base = config.public.apiUrl || "http://127.0.0.1:8001/api";
  return `${base}${path}`;
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function normalizePermissionGroup(value: unknown): PermissionGroup {
  return value === "module" || value === "system-setting" ? value : null;
}

function normalizePermission(value: unknown): Permission {
  const permission = (
    value && typeof value === "object" ? value : {}
  ) as Record<string, unknown>;

  return {
    id: Number(permission.id),
    name: String(permission.name ?? "").trim(),
    ...(typeof permission.guard_name === "string"
      ? { guard_name: permission.guard_name }
      : {}),
    group: normalizePermissionGroup(permission.group),
    ...(typeof permission.category === "string"
      ? { category: permission.category }
      : {}),
  };
}

function isPermissionGroupContainer(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as Record<string, unknown>).permissions);
}

function normalizePermissionCatalog(data: unknown): {
  permissions: Permission[];
  grouped: boolean;
} {
  if (!Array.isArray(data)) return { permissions: [], grouped: false };

  const grouped = data.some(isPermissionGroupContainer);

  const permissions = data.flatMap((item) => {
    const row =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    if (Array.isArray(row.permissions)) {
      return row.permissions.map(normalizePermission);
    }

    return [normalizePermission(item)];
  });

  return { permissions, grouped };
}

function normalizeRole(value: unknown): Role {
  const role = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const { permissions, ...roleFields } = role;

  return {
    ...roleFields,
    id: Number(role.id),
    uuid: String(role.uuid ?? ""),
    name: String(role.name ?? ""),
    guard_name: String(role.guard_name ?? ""),
    ...(typeof role.company_name === "string"
      ? { company_name: role.company_name }
      : {}),
    ...(Array.isArray(permissions)
      ? { permissions: permissions.map(normalizePermission) }
      : {}),
  } as Role;
}

function requireAnyLoadedPermission(permissions: string[]): void {
  if (permissions.some((permission) => hasLoadedPermission(permission))) return;
  requireLoadedPermission(permissions[0] || "");
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

export const roleService = {
  async listRoles(
    params: ListRolesParams = {},
    token?: string,
  ): Promise<ApiResponse<Role[]>> {
    requireLoadedPermission("role-list", "role-select");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const query = new URLSearchParams();
    if (params.page) query.append("page", String(params.page));
    if (params.per_page) query.append("per_page", String(params.per_page));
    if (params.order_by) query.append("order_by", params.order_by);
    if (params.order) query.append("order", params.order);
    if (params.company_id != null && String(params.company_id).trim()) {
      query.append("company_id", String(params.company_id).trim());
    }
    if (params.scope?.trim()) query.append("scope", params.scope.trim());

    const response = await fetch(`${resolveUrl("/roles")}?${query}`, {
      method: "GET",
      headers: headers(authToken),
    });
    if (!response.ok) await handleError(response, "Failed to fetch roles");
    const payload = (await response.json()) as ApiResponse<unknown[]>;
    return {
      ...payload,
      data: Array.isArray(payload.data) ? payload.data.map(normalizeRole) : [],
    };
  },

  async getRoleById(uuid: string, token?: string): Promise<ApiResponse<Role>> {
    requireLoadedPermission("role-show");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(resolveUrl(`/roles/${uuid}?order=asc`), {
      method: "GET",
      headers: headers(authToken),
    });
    if (!response.ok) await handleError(response, "Failed to fetch role");
    const payload = (await response.json()) as ApiResponse<unknown>;
    return {
      ...payload,
      data: normalizeRole(payload.data),
    };
  },

  async createRole(
    data: { name: string; allowed_to_delete: 0 | 1; scope?: RoleScope },
    token?: string,
  ): Promise<ApiResponse<Role>> {
    requireLoadedPermission("role-create");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(resolveUrl("/roles"), {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify(data),
    });
    if (!response.ok) await handleError(response, "Failed to create role");
    const payload = (await response.json()) as ApiResponse<unknown>;
    return {
      ...payload,
      data: normalizeRole(payload.data),
    };
  },

  async updateRole(
    uuid: string,
    data: { name: string; scope?: RoleScope },
    token?: string,
  ): Promise<ApiResponse<Role>> {
    requireAnyLoadedPermission(["role-edit", "global-role-edit"]);
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(resolveUrl(`/roles/${uuid}`), {
      method: "PUT",
      headers: headers(authToken),
      body: JSON.stringify(data),
    });
    if (!response.ok) await handleError(response, "Failed to update role");
    const payload = (await response.json()) as ApiResponse<unknown>;
    return {
      ...payload,
      data: normalizeRole(payload.data),
    };
  },

  async deleteRole(
    uuid: string,
    token?: string,
  ): Promise<ApiResponse<unknown>> {
    requireAnyLoadedPermission(["role-delete", "global-role-edit"]);
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(resolveUrl(`/roles/${uuid}`), {
      method: "DELETE",
      headers: headers(authToken),
    });
    if (!response.ok) await handleError(response, "Failed to delete role");
    return response.json();
  },

  async getAllPermissions(
    token?: string,
    params: {
      page?: number;
      per_page?: number;
      order_by?: string;
      order?: "asc" | "desc";
    } = {},
  ): Promise<ApiResponse<Permission[]>> {
    requireLoadedPermission("permission-list");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const query = new URLSearchParams();
    if (params.page) query.append("page", String(params.page));
    if (params.per_page) query.append("per_page", String(params.per_page));
    if (params.order_by) query.append("order_by", params.order_by);
    if (params.order) query.append("order", params.order);

    const url = query.toString()
      ? `${resolveUrl("/permissions")}?${query}`
      : resolveUrl("/permissions");

    const response = await fetch(url, {
      method: "GET",
      headers: headers(authToken),
    });
    if (!response.ok)
      await handleError(response, "Failed to fetch permissions");
    const payload = (await response.json()) as ApiResponse<unknown[]>;
    const catalog = normalizePermissionCatalog(payload.data);

    return {
      ...payload,
      ...(catalog.grouped ? { meta: undefined } : {}),
      data: catalog.permissions,
    };
  },

  async assignPermissionsToRole(
    roleUuid: string,
    permissionIds: number[],
    token?: string,
  ): Promise<ApiResponse<Role>> {
    requireLoadedPermission("permission-list");
    requireLoadedPermission("assign-permission");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(resolveUrl("/assign-permissions-to-role"), {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify({
        role_uuid: roleUuid,
        permission_ids: permissionIds,
      }),
    });
    if (!response.ok)
      await handleError(response, "Failed to assign permissions");
    const payload = (await response.json()) as ApiResponse<unknown>;
    return {
      ...payload,
      data: normalizeRole(payload.data),
    };
  },
};
