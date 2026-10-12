import { defineStore } from "pinia";
import {
  payslipService,
  type Payslip as ApiPayslip,
  type PayslipListFilters,
} from "~/services/payslipService";
import {
  hydratePayslipCollectionWithSalaryBreakdown,
  hydratePayslipWithSalaryBreakdown,
} from "~/utils/payslipAmounts";
import { useAuthStore } from "~/stores/auth";
import { getEmployeeProfileIdentifiersFromUser } from "~/utils/authEmployee";
import { createApiError } from "~/utils/apiError";
import {
  hasLoadedPermission,
  requireLoadedPermission,
} from "~/utils/permissionAccess";
import type { Employee } from "~/types";

export interface Payslip {
  id: number | string;
  uuid: string;
  employeeId: string;
  employeeCode?: string;
  employeeRecordId?: number;
  employeeName: string;
  payrollType: string;
  grossSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: "Paid" | "Unpaid";
  isPaid: boolean;
  month: string;
  year: number;
  generatedDate: string;
  periodLabel?: string;
  periodFrom?: string;
  periodTo?: string;
  companyName?: string;
  salaryId?: number;
  employeeUuid?: string;
}

interface PayslipFilters {
  date: string | null;
  employee_id: number | null;
  status: "paid" | "unpaid" | null;
  search: string;
}

interface PayslipSorting {
  order_by: string;
  order: "asc" | "desc";
}

interface PayslipPagination {
  currentPage: number;
  perPage: number;
  total: number;
  lastPage: number;
  from: number;
  to: number;
}

const MONTH_NAMES_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const MONTH_FULL_TO_ABBR: Record<string, string> = {
  january: "JAN",
  february: "FEB",
  march: "MAR",
  april: "APR",
  may: "MAY",
  june: "JUN",
  july: "JUL",
  august: "AUG",
  september: "SEP",
  october: "OCT",
  november: "NOV",
  december: "DEC",
};

function requireSuperAdminPayslipMaintenance(): void {
  if (useAuthStore().isSuperAdmin) return;

  throw createApiError(
    "You do not have permission to maintain payslips.",
    403,
    {
      requiredRole: "Super-Admin",
      blockedBy: "frontend-business-rule",
      backendPermissionMiddleware: "missing",
    },
  );
}

function defaultFilters(): PayslipFilters {
  return {
    date: null,
    employee_id: null,
    status: null,
    search: "",
  };
}

function defaultPagination(): PayslipPagination {
  return {
    currentPage: 1,
    perPage: 10,
    total: 0,
    lastPage: 1,
    from: 0,
    to: 0,
  };
}

function responseLastPage(response: {
  meta?: {
    pagination?: {
      last_page?: number;
      total_pages?: number;
      total?: number;
      per_page?: number;
    };
  };
}) {
  const pagination = response.meta?.pagination;
  const direct = Number(pagination?.last_page ?? pagination?.total_pages ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const total = Number(pagination?.total ?? 0);
  const perPage = Number(pagination?.per_page ?? 0);
  if (
    Number.isFinite(total) &&
    Number.isFinite(perPage) &&
    total > 0 &&
    perPage > 0
  ) {
    return Math.max(1, Math.ceil(total / perPage));
  }

  return 1;
}

function uniqueRawPayslips(rows: ApiPayslip[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = String(
      row.uuid ||
        row.id ||
        `${row.employee_id}-${row.salary_id}-${row.generated_at}`,
    );
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchAllPayslipRows(
  filters: PayslipListFilters & { page?: number; per_page?: number },
  token: string,
) {
  const firstResponse = await payslipService.listWithFilters(filters, token);
  const rows = Array.isArray(firstResponse.data) ? [...firstResponse.data] : [];
  const lastPage = responseLastPage(firstResponse);
  const startPage =
    Number(filters.page ?? firstResponse.meta?.pagination?.current_page ?? 1) ||
    1;

  if (lastPage > startPage) {
    const remainingPages = Array.from(
      { length: lastPage - startPage },
      (_, index) => startPage + index + 1,
    );

    const remainingResponses = await Promise.all(
      remainingPages.map((page) =>
        payslipService.listWithFilters({ ...filters, page }, token),
      ),
    );

    rows.push(
      ...remainingResponses.flatMap((response) =>
        Array.isArray(response.data) ? response.data : [],
      ),
    );
  }

  return uniqueRawPayslips(rows);
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const parsed = parseFloat(String(value ?? 0));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toNumericId(value: unknown): number | null {
  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value.trim()))
    return null;
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toDirectUuid(value: unknown): string | null {
  const uuid = normalizeUuid(value);
  return uuid && isUuidLike(uuid) ? uuid : null;
}

function isUuidLike(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function normalizeDisplayCode(value: unknown): string {
  if (value == null) return "";
  const text = String(value).trim();
  return text && !isUuidLike(text) ? text : "";
}

function resolveEmployeeDisplayCode(api: ApiPayslip): string {
  return (
    normalizeDisplayCode(api.employee?.employee_code) ||
    normalizeDisplayCode(api.employee?.code) ||
    normalizeDisplayCode(api.employee?.employee_id) ||
    normalizeDisplayCode(api.employee_id) ||
    normalizeDisplayCode(api.employee?.id)
  );
}

function resolveEmployeeUuid(api: ApiPayslip): string | undefined {
  const employee = api.employee as
    | (ApiPayslip["employee"] & Record<string, unknown>)
    | undefined;
  const raw = api as ApiPayslip & Record<string, unknown>;
  return (
    normalizeUuid(raw.employee_uuid) ??
    normalizeUuid(employee?.employee_uuid) ??
    normalizeUuid(employee?.uuid) ??
    undefined
  );
}

function identityKey(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.toLowerCase() : null;
}

function identityKeys(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values.map(identityKey).filter((value): value is string => value != null),
    ),
  );
}

function payslipEmployeeIdentityKeys(payslip: Payslip): string[] {
  return identityKeys([
    payslip.employeeUuid,
    payslip.employeeRecordId,
    payslip.employeeId,
  ]);
}

function hasMatchingIdentity(left: string[], right: string[]): boolean {
  const keys = new Set(left);
  return right.some((key) => keys.has(key));
}

function resolvePayslipUuid(
  identifier: number | string,
  payslips: Payslip[],
  rawPayslips: ApiPayslip[],
): string | null {
  const directUuid = toDirectUuid(identifier);
  if (directUuid) return directUuid;

  const key = String(identifier).trim();
  const payslip = payslips.find((p) => String(p.id) === key || p.uuid === key);
  const payslipUuid = normalizeUuid(payslip?.uuid);
  if (payslipUuid) return payslipUuid;

  const rawPayslip = rawPayslips.find(
    (p) => String(p.id) === key || normalizeUuid(p.uuid) === key,
  );
  return normalizeUuid(rawPayslip?.uuid);
}

function resolvePayslipNumericId(
  identifier: number | string,
  payslips: Payslip[],
  rawPayslips: ApiPayslip[],
): number | null {
  const directId = toNumericId(identifier);
  if (directId != null) return directId;

  const key = String(identifier).trim();
  const payslip = payslips.find((p) => String(p.id) === key || p.uuid === key);
  const payslipId = toNumericId(payslip?.id);
  if (payslipId != null) return payslipId;

  const rawPayslip = rawPayslips.find(
    (p) => String(p.id) === key || normalizeUuid(p.uuid) === key,
  );
  return toNumericId(rawPayslip?.id);
}

function resolvePayslipUuids(
  identifiers: Array<number | string>,
  payslips: Payslip[],
  rawPayslips: ApiPayslip[],
): string[] {
  return identifiers.map((identifier) => {
    const uuid = resolvePayslipUuid(identifier, payslips, rawPayslips);
    if (!uuid) throw new Error(`Payslip UUID unavailable for ${identifier}`);
    return uuid;
  });
}

function parseFilterPeriod(
  value: string | null,
): { month: number; year: number } | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    return null;
  return { month, year };
}

function normalizeMonth(
  value: unknown,
  periodFrom?: string,
  periodLabel?: string,
): string {
  if (typeof value === "number" && value >= 1 && value <= 12) {
    return MONTH_NAMES_ABBR[value - 1] || "JAN";
  }

  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim();
    const upper = normalized.toUpperCase();
    if (MONTH_NAMES_ABBR.includes(upper)) return upper;

    const numeric = parseInt(normalized, 10);
    if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 12) {
      return MONTH_NAMES_ABBR[numeric - 1] || "JAN";
    }

    const full = MONTH_FULL_TO_ABBR[normalized.toLowerCase()];
    if (full) return full;
  }

  if (periodFrom) {
    const date = new Date(periodFrom);
    if (!Number.isNaN(date.getTime())) {
      return MONTH_NAMES_ABBR[date.getMonth()] || "JAN";
    }
  }

  if (periodLabel) {
    const label = periodLabel.toLowerCase();
    const full = Object.entries(MONTH_FULL_TO_ABBR).find(([monthName]) =>
      label.includes(monthName),
    );
    if (full) return full[1];
    const abbr = MONTH_NAMES_ABBR.find((month) =>
      label.includes(month.toLowerCase()),
    );
    if (abbr) return abbr;
  }

  return "JAN";
}

function normalizeYear(
  value: unknown,
  periodFrom?: string,
  periodLabel?: string,
): number {
  const numeric = parseNumber(value);
  if (numeric > 0) return numeric;

  if (periodFrom) {
    const date = new Date(periodFrom);
    if (!Number.isNaN(date.getTime())) {
      return date.getFullYear();
    }
  }

  if (periodLabel) {
    const match = periodLabel.match(/\b(19|20)\d{2}\b/);
    if (match) return parseInt(match[0], 10);
  }

  return new Date().getFullYear();
}

function resolvePaidStatus(api: ApiPayslip): boolean {
  return (
    api.is_paid === true ||
    api.is_paid === 1 ||
    String(api.is_paid ?? "") === "1" ||
    String(api.status ?? "").toLowerCase() === "paid"
  );
}

function compareString(left: string, right: string, order: "asc" | "desc") {
  const result = left.localeCompare(right, undefined, {
    sensitivity: "base",
    numeric: true,
  });
  return order === "asc" ? result : -result;
}

function compareNumber(left: number, right: number, order: "asc" | "desc") {
  const result = left - right;
  return order === "asc" ? result : -result;
}

function monthSortValue(month: string): number {
  const upper = month.trim().toUpperCase();
  const directIndex = MONTH_NAMES_ABBR.findIndex((name) => name === upper);
  if (directIndex >= 0) return directIndex + 1;

  const fullNameIndex = Object.keys(MONTH_FULL_TO_ABBR).findIndex(
    (name) => name.toUpperCase() === upper,
  );
  if (fullNameIndex >= 0) return fullNameIndex + 1;

  const numeric = parseInt(month, 10);
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  return 0;
}

function payslipMatchesPeriod(
  payslip: Payslip,
  period: { month: number; year: number },
): boolean {
  return (
    payslip.year === period.year &&
    monthSortValue(String(payslip.month ?? "")) === period.month
  );
}

function sortPayslips(items: Payslip[], sorting: PayslipSorting): Payslip[] {
  const orderBy = sorting.order_by || "id";
  const order = sorting.order || "desc";

  return [...items].sort((left, right) => {
    switch (orderBy) {
      case "employee_name":
        return compareString(
          left.employeeName ?? "",
          right.employeeName ?? "",
          order,
        );
      case "employee_id":
        return compareString(
          String(left.employeeId ?? ""),
          String(right.employeeId ?? ""),
          order,
        );
      case "period": {
        const leftKey =
          left.year * 100 + monthSortValue(String(left.month ?? ""));
        const rightKey =
          right.year * 100 + monthSortValue(String(right.month ?? ""));
        return compareNumber(leftKey, rightKey, order);
      }
      case "base_salary":
        return compareNumber(
          left.grossSalary ?? 0,
          right.grossSalary ?? 0,
          order,
        );
      case "net_salary":
        return compareNumber(left.netSalary ?? 0, right.netSalary ?? 0, order);
      case "is_paid":
        return compareNumber(left.isPaid ? 1 : 0, right.isPaid ? 1 : 0, order);
      case "generated_at": {
        const leftDate = new Date(left.generatedDate || 0).getTime();
        const rightDate = new Date(right.generatedDate || 0).getTime();
        return compareNumber(leftDate || 0, rightDate || 0, order);
      }
      case "id":
      default: {
        const leftId = parseNumber(left.id);
        const rightId = parseNumber(right.id);
        return compareNumber(leftId, rightId, order);
      }
    }
  });
}

function normalizePayslip(api: ApiPayslip): Payslip {
  const amounts = api.amounts;
  const period = api.period;
  const periodFrom = period?.from ?? api.effective_from;
  const periodTo = period?.to ?? api.effective_to;
  const month = normalizeMonth(api.month, periodFrom, period?.label);
  const year = normalizeYear(api.year, periodFrom, period?.label);
  const isPaid = resolvePaidStatus(api);

  return {
    id: api.id,
    uuid: normalizeUuid(api.uuid) ?? "",
    employeeId: resolveEmployeeDisplayCode(api),
    employeeCode: resolveEmployeeDisplayCode(api),
    employeeRecordId:
      toNumericId(api.employee?.id ?? api.employee_id) ?? undefined,
    employeeUuid: resolveEmployeeUuid(api),
    employeeName: api.employee?.name ?? "Unknown employee",
    payrollType: "Monthly",
    grossSalary: parseNumber(
      amounts?.base_salary ?? api.base_salary ?? api.grossSalary,
    ),
    allowances: parseNumber(amounts?.total_additions ?? api.total_additions),
    deductions: parseNumber(amounts?.total_deductions ?? api.total_deductions),
    netSalary: parseNumber(amounts?.net_salary ?? api.net_salary),
    status: isPaid ? "Paid" : "Unpaid",
    isPaid,
    month,
    year,
    generatedDate: api.generated_at ?? api.created_at ?? "",
    periodLabel: period?.label ?? `${month} ${year}`,
    periodFrom,
    periodTo,
    companyName: api.company?.name,
    salaryId: api.salary_id,
  };
}

let fetchPayslipsRequestId = 0;

export const usePayslipsStore = defineStore("payslips", {
  state: () => ({
    payslips: [] as Payslip[],
    rawPayslips: [] as ApiPayslip[],
    currentPayslipDetail: null as ApiPayslip | null,
    loading: false,
    detailLoading: false,
    error: null as string | null,
    filters: defaultFilters(),
    sorting: {
      order_by: "id",
      order: "desc",
    } as PayslipSorting,
    pagination: defaultPagination(),
    selectedIds: [] as number[],
    employeesWithSalary: [] as Employee[],
    employeesWithSalaryLoading: false,
    employeesWithSalaryError: null as string | null,
    employeesWithSalaryLoaded: false,
  }),

  getters: {
    filteredPayslips: (state) => {
      const sorted = sortPayslips(state.payslips, state.sorting);
      const start =
        (state.pagination.currentPage - 1) * state.pagination.perPage;
      const end = start + state.pagination.perPage;
      return sorted.slice(start, end);
    },

    statistics: (state) => {
      const payslips = state.payslips || [];
      return {
        total: payslips.length,
        paid: payslips.filter((p) => p.isPaid).length,
        unpaid: payslips.filter((p) => !p.isPaid).length,
        totalNetSalary: payslips.reduce((sum, p) => sum + p.netSalary, 0),
        totalGrossSalary: payslips.reduce((sum, p) => sum + p.grossSalary, 0),
      };
    },

    selectedPayslips: (state) =>
      state.payslips.filter((p) => {
        const id = toNumericId(p.id);
        return id != null && state.selectedIds.includes(id);
      }),

    selectedCount: (state) => state.selectedIds.length,

    hasSelection: (state) => state.selectedIds.length > 0,

    currentPayslipSummary: (state) =>
      state.currentPayslipDetail
        ? normalizePayslip(state.currentPayslipDetail)
        : null,

    findPayslipById: (state) => (id: number | string) =>
      state.payslips.find(
        (p) => String(p.id) === String(id) || p.uuid === String(id),
      ) ?? null,
  },

  actions: {
    updatePagination() {
      this.pagination.total = this.payslips.length;
      this.pagination.lastPage = Math.max(
        1,
        Math.ceil(this.pagination.total / this.pagination.perPage),
      );

      if (this.pagination.currentPage > this.pagination.lastPage) {
        this.pagination.currentPage = this.pagination.lastPage;
      }
      if (this.pagination.currentPage < 1) {
        this.pagination.currentPage = 1;
      }

      const from =
        this.payslips.length > 0
          ? (this.pagination.currentPage - 1) * this.pagination.perPage + 1
          : 0;
      this.pagination.from = from;
      this.pagination.to = Math.min(
        from + this.pagination.perPage - 1,
        this.pagination.total,
      );
    },

    resetData() {
      this.payslips = [];
      this.rawPayslips = [];
      this.currentPayslipDetail = null;
      this.pagination = defaultPagination();
      this.selectedIds = [];
    },

    async fetchPayslips() {
      const requestId = ++fetchPayslipsRequestId;
      const authStore = useAuthStore();
      if (!authStore.token) {
        this.resetData();
        return;
      }
      requireLoadedPermission("list-payslip");

      const isEmployeeUser = authStore.user?.type === "Employee";
      const employeeProfileIdentifiers = isEmployeeUser
        ? getEmployeeProfileIdentifiersFromUser(authStore.user)
        : [];

      if (isEmployeeUser && employeeProfileIdentifiers.length === 0) {
        this.resetData();
        return;
      }

      this.loading = true;
      this.error = null;

      try {
        const selectedPeriod = parseFilterPeriod(this.filters.date);
        const requestFilters: PayslipListFilters & {
          page?: number;
          per_page?: number;
        } = {
          page: 1,
          per_page: 1000,
          month: selectedPeriod?.month,
          year: selectedPeriod?.year,
          order_by: "id",
          order: "desc",
          employee_id: this.filters.employee_id ?? undefined,
          status: this.filters.status ?? undefined,
          // search: this.filters.search || undefined,
        };

        const rawPayslips = await fetchAllPayslipRows(
          requestFilters,
          authStore.token,
        );
        const hydratedPayslips =
          await hydratePayslipCollectionWithSalaryBreakdown(
            rawPayslips,
            authStore.token,
          );
        let processedPayslips = hydratedPayslips.map(normalizePayslip);

        if (selectedPeriod) {
          processedPayslips = processedPayslips.filter((payslip) =>
            payslipMatchesPeriod(payslip, selectedPeriod),
          );
        }

        const targetEmployeeIdentifiers = isEmployeeUser
          ? employeeProfileIdentifiers
          : this.filters.employee_id != null
            ? [this.filters.employee_id]
            : [];
        const targetEmployeeKeys = identityKeys(targetEmployeeIdentifiers);
        if (targetEmployeeKeys.length > 0) {
          processedPayslips = processedPayslips.filter((payslip) => {
            return hasMatchingIdentity(
              payslipEmployeeIdentityKeys(payslip),
              targetEmployeeKeys,
            );
          });
        }

        if (this.filters.status) {
          const paidTarget = this.filters.status === "paid";
          processedPayslips = processedPayslips.filter(
            (payslip) => payslip.isPaid === paidTarget,
          );
        }

        // const searchQuery = this.filters.search.trim().toLowerCase();
        // if (searchQuery) {
        //   processedPayslips = processedPayslips.filter(
        //     (payslip) =>
        //       payslip.employeeName.toLowerCase().includes(searchQuery) ||
        //       String(payslip.employeeId).toLowerCase().includes(searchQuery) ||
        //       String(payslip.employeeRecordId ?? "")
        //         .toLowerCase()
        //         .includes(searchQuery),
        //   );
        // }
        const searchQuery = this.filters.search.trim().toLowerCase();
        if (searchQuery) {
          processedPayslips = processedPayslips.filter((payslip) => {
            const name = String(payslip.employeeName ?? "").toLowerCase();
            const code = String(payslip.employeeCode ?? "").toLowerCase();
            return name.includes(searchQuery) || code.includes(searchQuery);
          });
        }

        if (requestId !== fetchPayslipsRequestId) return;

        this.rawPayslips = hydratedPayslips;
        this.payslips = processedPayslips;
        this.updatePagination();
      } catch (err) {
        if (requestId !== fetchPayslipsRequestId) return;
        this.error =
          err instanceof Error ? err.message : "Failed to fetch payslips";
        this.payslips = [];
        this.rawPayslips = [];
        this.pagination.total = 0;
        this.pagination.lastPage = 1;
        this.pagination.from = 0;
        this.pagination.to = 0;
        throw err;
      } finally {
        if (requestId === fetchPayslipsRequestId) {
          this.loading = false;
        }
      }
    },

    async fetchPayslipDetail(identifier: number | string) {
      const authStore = useAuthStore();
      if (!authStore.token) throw new Error("Authentication required");
      requireLoadedPermission("show-payslip");

      this.detailLoading = true;
      this.error = null;

      try {
        const uuid = resolvePayslipUuid(
          identifier,
          this.payslips,
          this.rawPayslips,
        );
        if (!uuid)
          throw new Error(`Payslip UUID unavailable for ${identifier}`);

        const response = await payslipService.getById(uuid, authStore.token);
        this.currentPayslipDetail = await hydratePayslipWithSalaryBreakdown(
          response.data,
          authStore.token,
        );
        return this.currentPayslipDetail;
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to fetch payslip detail";
        throw err;
      } finally {
        this.detailLoading = false;
      }
    },

    clearPayslipDetail() {
      this.currentPayslipDetail = null;
    },

    async setFilters(filters: Partial<PayslipFilters>, refresh = true) {
      this.filters = { ...this.filters, ...filters };
      this.pagination.currentPage = 1;
      this.deselectAll();
      if (refresh) await this.fetchPayslips();
    },

    async resetFilters() {
      this.filters = defaultFilters();
      this.pagination.currentPage = 1;
      this.deselectAll();
      await this.fetchPayslips();
    },

    async setSorting(orderBy: string, order: "asc" | "desc") {
      this.sorting.order_by = orderBy;
      this.sorting.order = order;
      this.pagination.currentPage = 1;
      this.deselectAll();
      this.updatePagination();
    },

    async setPage(page: number) {
      const nextPage = Math.max(1, page);
      if (nextPage === this.pagination.currentPage) return;

      this.pagination.currentPage = nextPage;
      this.deselectAll();
      this.updatePagination();
    },

    async setPerPage(perPage: number) {
      if (perPage === this.pagination.perPage) return;

      this.pagination.perPage = perPage;
      this.pagination.currentPage = 1;
      this.deselectAll();
      this.updatePagination();
    },

    toggleSelection(id: number) {
      const index = this.selectedIds.indexOf(id);
      if (index > -1) this.selectedIds.splice(index, 1);
      else this.selectedIds.push(id);
    },

    selectAll() {
      this.selectedIds = this.filteredPayslips
        .map((p) => toNumericId(p.id))
        .filter((id): id is number => id != null);
    },

    deselectAll() {
      this.selectedIds = [];
    },

    async markMultipleAsPaid(ids?: number[]) {
      const authStore = useAuthStore();
      if (!authStore.token) throw new Error("Authentication required");
      requireSuperAdminPayslipMaintenance();
      const targetIds = ids ?? this.selectedIds;
      if (targetIds.length === 0) return;

      this.loading = true;
      this.error = null;

      try {
        await payslipService.markMultipleAsPaid(targetIds, authStore.token);

        const currentDetailId = toNumericId(this.currentPayslipDetail?.id);
        const currentDetailUuid =
          normalizeUuid(this.currentPayslipDetail?.uuid) ??
          (currentDetailId != null
            ? resolvePayslipUuid(
                currentDetailId,
                this.payslips,
                this.rawPayslips,
              )
            : null);
        if (
          currentDetailId != null &&
          targetIds.includes(currentDetailId) &&
          currentDetailUuid
        ) {
          await this.fetchPayslipDetail(currentDetailUuid);
        }

        await this.fetchPayslips();
        this.selectedIds = this.selectedIds.filter(
          (id) => !targetIds.includes(id),
        );
      } catch (err) {
        this.error =
          err instanceof Error
            ? err.message
            : "Failed to update payslip status";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async togglePaid(identifier: number | string) {
      const authStore = useAuthStore();
      if (!authStore.token) throw new Error("Authentication required");
      requireSuperAdminPayslipMaintenance();

      this.loading = true;
      this.error = null;

      try {
        const uuid = resolvePayslipUuid(
          identifier,
          this.payslips,
          this.rawPayslips,
        );
        if (!uuid)
          throw new Error(`Payslip UUID unavailable for ${identifier}`);

        const response = await payslipService.markAsPaid(uuid, authStore.token);
        if (normalizeUuid(this.currentPayslipDetail?.uuid) === uuid) {
          await this.fetchPayslipDetail(uuid);
        }

        await this.fetchPayslips();
        return response.data;
      } catch (err) {
        this.error =
          err instanceof Error
            ? err.message
            : "Failed to update payslip status";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async downloadMultiple(ids?: Array<number | string>) {
      const authStore = useAuthStore();
      if (!authStore.token) throw new Error("Authentication required");
      requireLoadedPermission("download-payslip");
      const targetIds = ids ?? this.selectedIds;
      if (targetIds.length === 0) return;

      this.loading = true;
      this.error = null;

      try {
        const targetUuids = resolvePayslipUuids(
          targetIds,
          this.payslips,
          this.rawPayslips,
        );
        await payslipService.downloadMultiple(targetUuids, authStore.token);
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to download payslips";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async downloadSingle(identifier: number | string) {
      const authStore = useAuthStore();
      if (!authStore.token) throw new Error("Authentication required");
      requireLoadedPermission("download-payslip");

      this.loading = true;
      this.error = null;

      try {
        const uuid = resolvePayslipUuid(
          identifier,
          this.payslips,
          this.rawPayslips,
        );
        if (!uuid)
          throw new Error(`Payslip UUID unavailable for ${identifier}`);

        await payslipService.download(uuid, undefined, authStore.token);
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to download payslip";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async deleteMultiple(ids?: Array<number | string>) {
      const authStore = useAuthStore();
      if (!authStore.token) throw new Error("Authentication required");
      requireSuperAdminPayslipMaintenance();
      const targetIds = ids ?? this.selectedIds;
      if (targetIds.length === 0) return;

      this.loading = true;
      this.error = null;

      try {
        const targetUuids = resolvePayslipUuids(
          targetIds,
          this.payslips,
          this.rawPayslips,
        );
        const targetNumericIds = targetIds
          .map((id) =>
            resolvePayslipNumericId(id, this.payslips, this.rawPayslips),
          )
          .filter((id): id is number => id != null);

        await payslipService.deleteMultiple(targetUuids, authStore.token);

        const currentDetailId = toNumericId(this.currentPayslipDetail?.id);
        const currentDetailUuid = normalizeUuid(
          this.currentPayslipDetail?.uuid,
        );
        if (
          (currentDetailId != null &&
            targetNumericIds.includes(currentDetailId)) ||
          (currentDetailUuid != null && targetUuids.includes(currentDetailUuid))
        ) {
          this.currentPayslipDetail = null;
        }

        this.selectedIds = this.selectedIds.filter(
          (id) => !targetNumericIds.includes(id),
        );
        await this.fetchPayslips();
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to delete payslips";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async deleteSingle(identifier: number | string) {
      await this.deleteMultiple([identifier]);
    },

    async generatePayslip(
      employeeId: number | null,
      month: number,
      year: number,
      refreshAfterGenerate = true,
    ) {
      const authStore = useAuthStore();
      if (!authStore.token) throw new Error("Authentication required");
      requireLoadedPermission("generate-payslip");

      this.loading = true;
      this.error = null;

      try {
        const response =
          employeeId != null
            ? await payslipService.generateForEmployee(
                employeeId,
                month,
                year,
                authStore.token,
              )
            : await payslipService.generateForAll(month, year, authStore.token);

        if (
          refreshAfterGenerate &&
          hasLoadedPermission("list-payslip") &&
          !/started/i.test(response.message ?? "")
        ) {
          await this.fetchPayslips();
        }

        return response;
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to generate payslip";
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async fetchEmployeesWithSalary(search?: string) {
      if (!hasLoadedPermission("employee-list")) {
        this.employeesWithSalary = [];
        this.employeesWithSalaryError = null;
        return;
      }

      this.employeesWithSalaryLoading = true;
      this.employeesWithSalaryError = null;
      const authStore = useAuthStore();
      if (!authStore.token) {
        this.employeesWithSalary = [];
        this.employeesWithSalaryLoading = false;
        return;
      }

      try {
        const s = search ?? this.filters.search;
        const response = await payslipService.getEmployeesWithSalary(
          authStore.token,
        );

        if (response.success && Array.isArray(response.data)) {
          this.employeesWithSalary = response.data.map((item: any) => ({
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            email: item.email,
            employeeCode: item.employee_code,
            employeeId: item.employee_id,
          })) as Employee[];
          this.employeesWithSalaryLoaded = true;
          this.employeesWithSalaryError = null;
        } else {
          this.employeesWithSalary = [];
          this.employeesWithSalaryLoaded = false;
        }
      } catch (err) {
        const apiErr = err as ApiError;
        if (apiErr.status === 403) {
          this.employeesWithSalary = [];
          this.employeesWithSalaryError = null;
          return;
        }
        this.employeesWithSalaryError =
          err instanceof Error
            ? err.message
            : "Failed to fetch employees with salary";
        this.employeesWithSalary = [];
        this.employeesWithSalaryLoaded = false;
      } finally {
        this.employeesWithSalaryLoading = false;
      }
    },
  },
});
