import { defineStore } from "pinia";
import {
  roleService,
  type Role,
  type Permission,
  type RoleScope,
} from "~/services/roleService";
import { useAuthStore } from "~/stores/auth";
import { createApiError, type ApiError } from "~/utils/apiError";
import { hasLoadedPermission, requireLoadedPermission } from "~/utils/permissionAccess";

type PermissionCatalogStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "error"
  | "denied";
type AuthRequestFence = {
  token: string;
  accountId: string;
  key: string;
};

type PermissionCatalogRequest = {
  fenceKey: string;
  promise: Promise<Permission[]>;
};

const PERMISSION_PAGE_SIZE = 100;
const MAX_PERMISSION_PAGES = 50;

let roleLoadSequence = 0;
let permissionsRequestSequence = 0;
let permissionsRequest: PermissionCatalogRequest | null = null;
let permissionsLoadedFenceKey: string | null = null;

function currentAuthFence(): AuthRequestFence {
  const authStore = useAuthStore();
  if (!authStore.token || !authStore.user) {
    throw createApiError("Authentication required", 401);
  }

  const accountId = String(
    authStore.user.id || authStore.user.uuid || authStore.user.email,
  );

  return {
    token: authStore.token,
    accountId,
    key: `${accountId}\u0000${authStore.token}`,
  };
}

function isCurrentAuthFence(fence: AuthRequestFence): boolean {
  const authStore = useAuthStore();
  if (!authStore.token || !authStore.user) return false;

  const accountId = String(
    authStore.user.id || authStore.user.uuid || authStore.user.email,
  );

  return authStore.token === fence.token && accountId === fence.accountId;
}

function permissionPagination(
  meta:
    | {
        pagination?: {
          total?: unknown;
          per_page?: unknown;
          current_page?: unknown;
          last_page?: unknown;
        };
      }
    | undefined,
  firstPageCount: number,
): { total: number; lastPage: number } {
  const pagination = meta?.pagination;
  if (!pagination) {
    return { total: firstPageCount, lastPage: 1 };
  }

  const total = Number(pagination.total);
  const perPage = Number(pagination.per_page);
  const currentPage = Number(pagination.current_page);
  const lastPage = Number(pagination.last_page);

  if (!Number.isSafeInteger(total) || total < 0) {
    throw createApiError("Permission total is invalid.", 502);
  }
  if (!Number.isSafeInteger(perPage) || perPage <= 0) {
    throw createApiError("Permission page size is invalid.", 502);
  }
  if (currentPage !== 1) {
    throw createApiError("Permission catalog did not return page 1.", 502);
  }
  if (!Number.isSafeInteger(lastPage) || lastPage < 1) {
    throw createApiError("Permission page count is invalid.", 502);
  }
  if (lastPage > MAX_PERMISSION_PAGES) {
    throw createApiError(
      `Permission catalog exceeds the ${MAX_PERMISSION_PAGES}-page safety limit.`,
      502,
    );
  }

  const expectedLastPage = Math.max(1, Math.ceil(total / perPage));
  if (expectedLastPage !== lastPage) {
    throw createApiError(
      "Permission pagination metadata is inconsistent.",
      502,
    );
  }

  return { total, lastPage };
}

function deduplicatePermissions(rows: Permission[]): Permission[] {
  const ids = new Set<number>();
  const names = new Set<string>();

  return rows.flatMap((permission) => {
    const id = Number(permission.id);
    const name = String(permission.name ?? "").trim();
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !name ||
      ids.has(id) ||
      names.has(name)
    ) {
      return [];
    }

    ids.add(id);
    names.add(name);
    return [
      {
        ...permission,
        id,
        name,
      },
    ];
  });
}

function isGlobalRole(role: Role | null | undefined): boolean {
  return String(role?.scope ?? role?.scope_type ?? "").trim().toLowerCase() === "global";
}

function findKnownRole(roles: Role[], currentRole: Role | null, uuid: string): Role | null {
  return roles.find((role) => role.uuid === uuid) ?? (currentRole?.uuid === uuid ? currentRole : null);
}

function requireRoleEditPermission(role: Role | null): void {
  if (hasLoadedPermission("role-edit")) return;
  if (isGlobalRole(role) && hasLoadedPermission("global-role-edit")) return;
  requireLoadedPermission("role-edit");
}

function requireRoleDeletePermission(role: Role | null): void {
  if (hasLoadedPermission("role-delete")) return;
  if (isGlobalRole(role) && hasLoadedPermission("global-role-edit")) return;
  requireLoadedPermission("role-delete");
}

export const useRoleStore = defineStore("roles", {
  state: () => ({
    roles: [] as Role[],
    currentRole: null as Role | null,
    loading: false,
    error: null as string | null,
    pagination: {
      current_page: 1,
      per_page: 15,
      total: 0,
      last_page: 1,
    },
    filters: {
      company_id: "",
      scope: "" as "" | RoleScope,
    },
    searchQuery: "",
    sortBy: "id",
    sortOrder: "desc" as "desc" | "asc",
    allPermissions: [] as Permission[],
    selectedPermissions: [] as number[],
    loadingPermissions: false,
    permissionsAccessDenied: false,
    permissionsError: null as string | null,
    permissionCatalogStatus: "idle" as PermissionCatalogStatus,
    permissionCatalogTotal: null as number | null,
    permissionCatalogLoadedCount: 0,
    permissionCatalogAccountId: null as string | null,
    savingPermissions: false,
    permissionSaveError: null as string | null,
  }),

  getters: {
    filteredRoles: (state) => {
      if (!state.searchQuery.trim()) return state.roles;
      const q = state.searchQuery.toLowerCase();
      return state.roles.filter((role) => role.name.toLowerCase().includes(q));
    },
    totalRoles: (state) => state.pagination.total || state.roles.length,
    isLoading: (state) => state.loading,
    hasError: (state) => state.error !== null,
    assignedPermissionCount: (state) =>
      state.currentRole?.permissions?.length ?? 0,
    permissionsByCategory: (state): Record<string, Permission[]> => {
      const grouped: Record<string, Permission[]> = {};
      for (const perm of state.allPermissions) {
        // "role-list" → category "Role", "user-create" → "User"
        const parts = perm.name.split("-");
        const raw = parts.length > 1 ? parts.slice(0, -1).join("-") : perm.name;
        const key = raw.charAt(0).toUpperCase() + raw.slice(1);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(perm);
      }
      return grouped;
    },
  },

  actions: {
    async fetchRoles(page = 1) {
      const requestId = ++roleLoadSequence;
      let fence: AuthRequestFence | null = null;
      this.loading = true;
      this.error = null;
      try {
       requireLoadedPermission("role-list", "role-select");
        fence = currentAuthFence();
        const response = await roleService.listRoles(
          {
            page,
            per_page: this.pagination.per_page,
            order_by: this.sortBy,
            order: this.sortOrder,
            company_id: this.filters.company_id || undefined,
            scope: this.filters.scope || undefined,
          },
          fence.token,
        );

        if (requestId !== roleLoadSequence || !isCurrentAuthFence(fence))
          return [];

        this.roles = response.data || [];
        if (response.meta?.pagination) {
          this.pagination = {
            current_page: response.meta.pagination.current_page,
            per_page: response.meta.pagination.per_page,
            total: response.meta.pagination.total,
            last_page: response.meta.pagination.last_page,
          };
        }
        return this.roles;
      } catch (err) {
        if (
          requestId !== roleLoadSequence ||
          (fence && !isCurrentAuthFence(fence))
        )
          return [];
        const apiErr = err as ApiError;
        this.error = apiErr.message || "Failed to fetch roles";
        return [];
      } finally {
        if (requestId === roleLoadSequence) {
          this.loading = false;
        }
      }
    },

    async fetchRoleById(uuid: string) {
      const requestId = ++roleLoadSequence;
      let fence: AuthRequestFence | null = null;
      this.loading = true;
      this.error = null;
      try {
        requireLoadedPermission("role-show");
        fence = currentAuthFence();
        const response = await roleService.getRoleById(uuid, fence.token);
        if (requestId !== roleLoadSequence || !isCurrentAuthFence(fence))
          return null;

        const roleData = response.data;

        this.currentRole = roleData;
        const listIdx = this.roles.findIndex((r) => r.uuid === uuid);
        if (listIdx !== -1) this.roles[listIdx] = roleData;
        return roleData;
      } catch (err) {
        if (
          requestId !== roleLoadSequence ||
          (fence && !isCurrentAuthFence(fence))
        )
          return null;
        const apiErr = err as ApiError;
        this.error = apiErr.message || "Failed to fetch role";
        return null;
      } finally {
        if (requestId === roleLoadSequence) {
          this.loading = false;
        }
      }
    },

    async createRole(name: string, scope?: RoleScope) {
      requireLoadedPermission("role-create");
      const fence = currentAuthFence();
      const response = await roleService.createRole(
        { name, allowed_to_delete: 1, scope },
        fence.token,
      );
      if (!isCurrentAuthFence(fence)) {
        throw createApiError(
          "The signed-in account changed before the role was created.",
          409,
        );
      }

      const createdRole = {
        ...response.data,
        allowed_to_delete: response.data.allowed_to_delete ?? 1,
      };
      this.roles.unshift(createdRole);
      return createdRole;
    },

    async updateRole(uuid: string, name: string, scope?: RoleScope) {
      const knownRole = findKnownRole(this.roles, this.currentRole, uuid);
      requireRoleEditPermission(knownRole);
      const fence = currentAuthFence();
      const response = await roleService.updateRole(
        uuid,
        { name, scope },
        fence.token,
      );
      if (!isCurrentAuthFence(fence)) {
        throw createApiError(
          "The signed-in account changed before the role was updated.",
          409,
        );
      }

      const index = this.roles.findIndex((r) => r.uuid === uuid);
      const existing =
        index !== -1
          ? this.roles[index]
          : this.currentRole?.uuid === uuid
            ? this.currentRole
            : null;
      const updatedRole: Role = {
        ...(existing ?? response.data),
        ...response.data,
        permissions: response.data.permissions ?? existing?.permissions ?? [],
      };

      if (index !== -1) this.roles[index] = updatedRole;
      if (this.currentRole?.uuid === uuid) this.currentRole = updatedRole;
      return updatedRole;
    },

    async deleteRole(uuid: string) {
      const knownRole = findKnownRole(this.roles, this.currentRole, uuid);
      requireRoleDeletePermission(knownRole);
      const fence = currentAuthFence();
      await roleService.deleteRole(uuid, fence.token);
      if (!isCurrentAuthFence(fence)) {
        throw createApiError(
          "The signed-in account changed before the role was deleted.",
          409,
        );
      }

      this.roles = this.roles.filter((r) => r.uuid !== uuid);
      if (this.currentRole?.uuid === uuid) this.currentRole = null;
    },

    setSearchQuery(query: string) {
      this.searchQuery = query;
    },

    setFilter(key: "company_id" | "scope", value: string) {
      if (key === "scope") {
        this.filters.scope = value as "" | RoleScope;
      } else {
        this.filters.company_id = value;
      }
      this.pagination.current_page = 1;
    },

    setPerPage(perPage: number) {
      this.pagination.per_page = perPage;
      this.pagination.current_page = 1;
    },

    clearError() {
      this.error = null;
    },

    resetPermissionCatalog() {
      permissionsRequestSequence += 1;
      permissionsRequest = null;
      permissionsLoadedFenceKey = null;
      this.allPermissions = [];
      this.selectedPermissions = [];
      this.loadingPermissions = false;
      this.permissionsAccessDenied = false;
      this.permissionsError = null;
      this.permissionCatalogStatus = "idle";
      this.permissionCatalogTotal = null;
      this.permissionCatalogLoadedCount = 0;
      this.permissionCatalogAccountId = null;
      this.savingPermissions = false;
      this.permissionSaveError = null;
    },

    async fetchAllPermissions(
      options: { force?: boolean } = {},
    ): Promise<Permission[]> {
      try {
        requireLoadedPermission("permission-list");
      } catch {
        this.resetPermissionCatalog();
        this.permissionsAccessDenied = true;
        this.permissionCatalogStatus = "denied";
        return [];
      }

      const fence = currentAuthFence();
      if (permissionsRequest?.fenceKey === fence.key) {
        return permissionsRequest.promise;
      }
      if (
        !options.force &&
        permissionsLoadedFenceKey === fence.key &&
        this.permissionCatalogStatus === "loaded"
      ) {
        return this.allPermissions;
      }

      const requestId = ++permissionsRequestSequence;
      this.allPermissions = [];
      this.loadingPermissions = true;
      this.permissionsAccessDenied = false;
      this.permissionsError = null;
      this.permissionCatalogStatus = "loading";
      this.permissionCatalogTotal = null;
      this.permissionCatalogLoadedCount = 0;
      this.permissionCatalogAccountId = fence.accountId;
      permissionsLoadedFenceKey = null;

      let request: PermissionCatalogRequest;
      const promise = (async (): Promise<Permission[]> => {
        try {
          const first = await roleService.getAllPermissions(fence.token, {
            page: 1,
            per_page: PERMISSION_PAGE_SIZE,
            order_by: "id",
            order: "asc",
          });
          const collected: Permission[] = [...(first.data || [])];
          const { total, lastPage } = permissionPagination(
            first.meta,
            collected.length,
          );

          if (lastPage > 1) {
            const extraPages = Array.from(
              { length: lastPage - 1 },
              (_, index) => index + 2,
            );
            const extra = await Promise.all(
              extraPages.map((page) =>
                roleService.getAllPermissions(fence.token, {
                  page,
                  per_page: PERMISSION_PAGE_SIZE,
                  order_by: "id",
                  order: "asc",
                }),
              ),
            );

            extra.forEach((response, index) => {
              const expectedPage = extraPages[index];
              const pagination = response.meta?.pagination;
              if (!pagination) {
                throw createApiError(
                  `Permission page ${expectedPage} is missing pagination metadata.`,
                  502,
                );
              }
              if (
                Number(pagination.current_page) !== expectedPage ||
                Number(pagination.total) !== total ||
                Number(pagination.last_page) !== lastPage
              ) {
                throw createApiError(
                  `Permission page ${expectedPage} returned inconsistent metadata.`,
                  502,
                );
              }
              collected.push(...(response.data || []));
            });
          }

          const deduplicated = deduplicatePermissions(collected);
          const loadedTotal = deduplicated.length;

          if (
            requestId !== permissionsRequestSequence ||
            !isCurrentAuthFence(fence)
          ) {
            return [];
          }

          this.allPermissions = deduplicated;
          this.permissionCatalogTotal = loadedTotal;
          this.permissionCatalogLoadedCount = loadedTotal;
          this.permissionCatalogStatus = "loaded";
          permissionsLoadedFenceKey = fence.key;
          console.log("🚀 ~ this.allPermissions:", this.allPermissions);
          console.log("🚀 ~ deduplicated:", deduplicated);
          return deduplicated;
        } catch (err) {
          if (
            requestId !== permissionsRequestSequence ||
            !isCurrentAuthFence(fence)
          ) {
            return [];
          }

          const apiErr = err as ApiError;
          this.allPermissions = [];
          this.permissionCatalogTotal = null;
          this.permissionCatalogLoadedCount = 0;
          if (apiErr.status === 403) {
            this.permissionsAccessDenied = true;
            this.permissionCatalogStatus = "denied";
          } else {
            this.permissionsError =
              apiErr.message || "Failed to fetch permissions";
            this.permissionCatalogStatus = "error";
          }
          return [];
        } finally {
          if (
            requestId === permissionsRequestSequence &&
            isCurrentAuthFence(fence)
          ) {
            this.loadingPermissions = false;
          }
          if (permissionsRequest === request) {
            permissionsRequest = null;
          }
        }
      })();

      request = {
        fenceKey: fence.key,
        promise,
      };
      permissionsRequest = request;
      return promise;
    },

    async assignPermissionsToRole(roleUuid: string, permissionIds: number[]) {
      requireLoadedPermission("permission-list");
      requireLoadedPermission("assign-permission");
      requireLoadedPermission("role-show");
      if (this.permissionCatalogStatus !== "loaded") {
        throw createApiError(
          "The complete permission catalog must be loaded before saving.",
          409,
        );
      }

      const intendedPermissionIds = Array.from(new Set(permissionIds));
      if (
        intendedPermissionIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
      ) {
        throw createApiError("The selected permission set is invalid.", 422);
      }
      const catalogIds = new Set(
        this.allPermissions.map((permission) => permission.id),
      );
      if (intendedPermissionIds.some((id) => !catalogIds.has(id))) {
        throw createApiError(
          "The selected permission set is not present in the loaded catalog.",
          409,
        );
      }

      const fence = currentAuthFence();
      this.savingPermissions = true;
      this.permissionSaveError = null;
      try {
        await roleService.assignPermissionsToRole(
          roleUuid,
          intendedPermissionIds,
          fence.token,
        );
        if (!isCurrentAuthFence(fence)) {
          throw createApiError(
            "The signed-in account changed before permissions were saved.",
            409,
          );
        }

        const refreshed = await roleService.getRoleById(roleUuid, fence.token);
        if (!isCurrentAuthFence(fence)) {
          throw createApiError(
            "The signed-in account changed before role details were refreshed.",
            409,
          );
        }

        const updated = refreshed.data;
        const savedPermissionIds = new Set(
          (updated.permissions ?? []).map((permission) => permission.id),
        );
        if (
          savedPermissionIds.size !== intendedPermissionIds.length ||
          intendedPermissionIds.some((id) => !savedPermissionIds.has(id))
        ) {
          throw createApiError(
            "The backend did not return the complete saved permission set.",
            502,
          );
        }

        if (this.currentRole?.uuid === roleUuid) this.currentRole = updated;
        const index = this.roles.findIndex((r) => r.uuid === roleUuid);
        if (index !== -1) this.roles[index] = updated;
        return updated;
      } catch (err) {
        const apiErr = err as ApiError;
        this.permissionSaveError =
          apiErr.message || "Failed to assign permissions";
        throw err;
      } finally {
        this.savingPermissions = false;
      }
    },

    setSelectedPermissions(permissionIds: number[]) {
      this.selectedPermissions = Array.from(
        new Set(
          permissionIds.filter((id) => Number.isSafeInteger(id) && id > 0),
        ),
      );
    },

    togglePermission(permissionId: number) {
      // Use full array replacement — splice/push on a Pinia reactive array
      // doesn't always trigger computed re-evaluation in all Vue 3 versions.
      if (this.selectedPermissions.includes(permissionId)) {
        this.selectedPermissions = this.selectedPermissions.filter(
          (id) => id !== permissionId,
        );
      } else {
        this.selectedPermissions = [...this.selectedPermissions, permissionId];
      }
    },
  },
});
