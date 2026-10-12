import { defineStore } from "pinia";
import { employeeService } from "~/services/employeeService";
import { useAuthStore } from "~/stores/auth";
import type {
  Employee,
  FilterOptions,
  SortOptions,
  PaginationMeta,
} from "~/types";
import type {
  Employee as ApiEmployee,
  CreateEmployeePayload,
  UpdateEmployeePayload,
} from "~/types/employee";
import type { ApiError } from "~/utils/apiError";
import type { User } from "~/types/auth";
import {
  buildEmployeeDisplayFromAuthUser,
  getEmployeeProfileIdFromUser,
} from "~/utils/authEmployee";
import { dedupeEmployees } from "~/utils/employeeOptions";
import { formatRoleNames } from "~/utils/roles";
import {
  hasLoadedPermission,
  requireLoadedPermission,
} from "~/utils/permissionAccess";

type EmployeeDocuments = NonNullable<Employee["documents"]>;
type EmployeeDocumentKey = keyof EmployeeDocuments;
type EmployeePermissionSkip = {
  skipped: true;
  reason: "missing-permission";
};

const EMPLOYEE_OPTIONS_PAGE_SIZE = 50;
const MAX_EMPLOYEE_OPTION_PAGES = 100;

function missingPermissionSkip(): EmployeePermissionSkip {
  return {
    skipped: true,
    reason: "missing-permission",
  };
}

const DOCUMENT_KEY_ALIASES: Record<string, EmployeeDocumentKey> = {
  passport: "passport",
  nationalid: "nationalId",
  nationalidentity: "nationalId",
  nationalidentitycard: "nationalId",
  nationalidcard: "nationalId",
  visa: "visa",
  id: "nationalId",
  identity: "nationalId",
  identitycard: "nationalId",
  bankaccount: "bankAccount",
  bankstatement: "bankAccount",
  certificateofbirth: "certificateOfBirth",
  birthcertificate: "certificateOfBirth",
  certificatebirth: "certificateOfBirth",
  certificate: "certificate",
  criminalrecord: "criminalRecord",
  criminalrecords: "criminalRecord",
  policerecord: "criminalRecord",
  policeclearance: "criminalRecord",
  workingpermit: "workingPermit",
  workpermit: "workingPermit",
  workpermission: "workingPermit",
  militarystatus: "militaryStatus",
  military: "militaryStatus",
  others: "others",
  other: "others",
  form1: "form1",
  formone: "form1",
  form6: "form6",
  formsix: "form6",
};

function normalizeDocumentLookup(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function documentKeyFromValue(value: unknown): EmployeeDocumentKey | null {
  return DOCUMENT_KEY_ALIASES[normalizeDocumentLookup(value)] ?? null;
}

function firstStringField(
  raw: Record<string, any>,
  fields: string[],
): string | null {
  for (const field of fields) {
    const value = raw[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return null;
}

function documentUrlFromValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return null;

  return firstStringField(value as Record<string, any>, [
    "url",
    "document_url",
    "file_url",
    "full_url",
    "path",
    "document_path",
    "file_path",
    "attachment",
    "filename",
  ]);
}

function documentLabelFromRecord(record: Record<string, any>): unknown {
  const documentType = record.document_type;
  if (documentType && typeof documentType === "object") {
    return (
      (documentType as Record<string, any>).title ??
      (documentType as Record<string, any>).name ??
      (documentType as Record<string, any>).key
    );
  }

  return (
    record.type ??
    record.document_type ??
    record.document_type_name ??
    record.documentType ??
    record.name ??
    record.title ??
    record.label ??
    record.key
  );
}

function looksLikeDocumentRecord(value: Record<string, any>): boolean {
  return [
    "url",
    "document_url",
    "file_url",
    "full_url",
    "path",
    "document_path",
    "file_path",
    "type",
    "document_type",
    "document_type_name",
    "documentType",
    "title",
    "label",
  ].some((field) => value[field] != null);
}

function assignDocument(
  documents: EmployeeDocuments,
  key: EmployeeDocumentKey | null,
  url: string | null,
) {
  if (!url) return;
  const targetKey = key ?? "others";
  if (!documents[targetKey]) {
    documents[targetKey] = url;
  }
}

function collectDocumentsFromSource(
  source: unknown,
  documents: EmployeeDocuments,
  fallbackKey?: EmployeeDocumentKey | null,
) {
  if (Array.isArray(source)) {
    source.forEach((item) =>
      collectDocumentsFromSource(item, documents, fallbackKey),
    );
    return;
  }

  if (typeof source === "string") {
    assignDocument(documents, fallbackKey ?? null, source.trim() || null);
    return;
  }

  if (!source || typeof source !== "object") return;

  const raw = source as Record<string, any>;
  if (looksLikeDocumentRecord(raw)) {
    const key =
      documentKeyFromValue(documentLabelFromRecord(raw)) ?? fallbackKey ?? null;
    assignDocument(documents, key, documentUrlFromValue(raw));
    return;
  }

  Object.entries(raw).forEach(([entryKey, entryValue]) => {
    const key = documentKeyFromValue(entryKey);
    collectDocumentsFromSource(entryValue, documents, key);
  });
}

function normalizeEmployeeDocuments(
  raw: Record<string, any>,
): EmployeeDocuments | undefined {
  const documents: EmployeeDocuments = {};
  collectDocumentsFromSource(raw.documents, documents);
  collectDocumentsFromSource(raw.attachments, documents);
  collectDocumentsFromSource(raw.employee_documents, documents);
  collectDocumentsFromSource(raw.employeeDocuments, documents);

  return Object.keys(documents).length > 0 ? documents : undefined;
}

function companyNamesFromRecords(source: unknown): string {
  if (!Array.isArray(source)) return "";

  const names = source
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const name = (item as Record<string, any>).name;
      return typeof name === "string" ? name.trim() : "";
    })
    .filter(Boolean);

  return [...new Set(names)].join(", ");
}

function employeeListErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (/syntax\s+error|unexpected\s+token/i.test(message)) {
    return "Failed to fetch employees. The employee API returned a server error.";
  }
  return message || "Failed to fetch employees";
}

function numberFromFields(
  raw: Record<string, any>,
  fields: string[],
): number | null {
  for (const field of fields) {
    const value = raw[field];
    if (value == null || value === "") continue;
    const parsed =
      typeof value === "number" ? value : parseFloat(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function mapApiEmployeeToDisplay(api: ApiEmployee): Employee {
  const raw = api as ApiEmployee & Record<string, any>;
  const documents = normalizeEmployeeDocuments(raw);
  const branchRows = api.branches ?? [];
  const resolvedEmployeeRouteId =
    raw.uuid ?? api.uuid ?? raw.employee_uuid ?? raw.employee?.uuid ?? api.id;
  const designationDepartmentId =
    raw.designation?.department_id ??
    raw.designation?.department?.id ??
    raw.designation_department_id;
  const designationDepartmentName =
    raw.designation?.department_name ??
    (typeof raw.designation?.department === "string"
      ? raw.designation?.department
      : undefined) ??
    raw.designation?.department?.name;
  const designationBranchId =
    raw.designation?.branch_id ?? raw.designation?.department?.branch_id;
  const designationBranchName =
    raw.designation?.branch_name ??
    (typeof raw.designation?.branch === "string"
      ? raw.designation?.branch
      : undefined) ??
    raw.designation?.department?.branch_name;

  const resolvedBranchId =
    api.branch_id ??
    raw.branch_id ??
    designationBranchId ??
    (branchRows[0]?.id != null ? String(branchRows[0].id) : undefined);

  const resolvedDepartmentId =
    api.department_id ??
    raw.department_id ??
    designationDepartmentId ??
    (api.departments?.[0]?.id != null
      ? String(api.departments[0].id)
      : undefined);

  const allBranchNames = api.branches?.map((b) => b.name).filter(Boolean) || [];
  const allDepartmentNames =
    api.departments?.map((d) => d.name).filter(Boolean) || [];

  const resolvedBranchRecord =
    (resolvedBranchId &&
      branchRows.find((b) => String(b.id) === String(resolvedBranchId))) ||
    branchRows[0];

  const branchCompany =
    typeof resolvedBranchRecord?.company === "string"
      ? resolvedBranchRecord.company
      : resolvedBranchRecord?.company?.name;
  const companyFromArray =
    Array.isArray(raw.company) && raw.company.length > 0
      ? raw.company[0]?.name || ""
      : "";

  const primaryCompany =
    raw.company_name ||
    (typeof raw.company === "string" ? raw.company : raw.company?.name) ||
    companyFromArray ||
    companyNamesFromRecords(raw.hr_companies) ||
    companyNamesFromRecords(raw.company) ||
    resolvedBranchRecord?.company_name ||
    branchCompany ||
    "";

  const primaryBranch =
    resolvedBranchRecord?.name ||
    designationBranchName ||
    raw.branch ||
    raw.branch_name ||
    "";

  const primaryDepartment =
    (resolvedDepartmentId &&
      api.departments?.find(
        (d) => String(d.id) === String(resolvedDepartmentId),
      )?.name) ||
    api.departments?.[0]?.name ||
    designationDepartmentName ||
    raw.department ||
    raw.department_name ||
    "";

  const primaryDesignation =
    raw.designation?.name ||
    raw.designation_name ||
    raw.designation ||
    raw.designation_title ||
    raw.designationTitle;

  const resolvedDesignationId =
    raw.designation?.uuid ?? api.designation_uuid ?? raw.designation_uuid;

  const phone =
    api.phone ?? raw.phone_number ?? raw.mobile ?? raw.mobile_number ?? "";

  const birthDate = api.birth_date ?? raw.date_of_birth ?? raw.dob ?? "";

  const salaryTypeRaw =
    api.salary_type ?? raw.salaryType ?? raw.salary_type_name ?? raw.pay_type;

  const salaryType =
    salaryTypeRaw === "hourly" ||
    salaryTypeRaw === "monthly" ||
    salaryTypeRaw === "annual"
      ? salaryTypeRaw
      : undefined;

  const accountTypeRaw =
    api.account_type ??
    raw.accountType ??
    raw.account_type_name ??
    raw.account_type;

  const accountType =
    accountTypeRaw === "bank" || accountTypeRaw === "cash"
      ? accountTypeRaw
      : typeof accountTypeRaw === "string" && accountTypeRaw.trim()
        ? accountTypeRaw
        : undefined;

  return {
    id: String(resolvedEmployeeRouteId),
    uuid: String(resolvedEmployeeRouteId),
    numericId: String(api.id),
    name: api.name ?? "",
    firstName: api.first_name ?? raw.firstName,
    lastName: api.last_name ?? raw.lastName,
    email: api.email ?? "",
    phone,
    company: primaryCompany,
    branch:
      allBranchNames.length > 0 ? allBranchNames.join(", ") : primaryBranch,
    department:
      allDepartmentNames.length > 0
        ? allDepartmentNames.join(", ")
        : primaryDepartment,
    allBranches: allBranchNames.join(", "),
    allDepartments: allDepartmentNames.join(", "),
    branchesList: api.branches || [],
    departmentsList: api.departments || [],

    team: raw.team ?? raw.employee_team ?? raw.employeeTeam ?? "",
    role: raw.role ?? raw.user?.role,
    roles: raw.roles ?? raw.user?.roles,
    role_name: raw.role_name ?? raw.user?.role_name,
    roleName: raw.roleName ?? raw.user?.roleName,
    assigned_role: raw.assigned_role ?? raw.user?.assigned_role,
    assignedRole: raw.assignedRole ?? raw.user?.assignedRole,
    designation: primaryDesignation ?? api.type ?? "",
    position: api.position,
    dateOfJoining: api.company_doj ?? "",
    hiredDate: api.hired_date ?? "",
    status: raw.status === "completed" ? "completed" : "incomplete",
    time_zone: raw.time_zone || raw.timeZone || "",
    address:
      api.address ??
      raw.current_address ??
      raw.home_address ??
      raw.full_address,
    employeeId: api.employee_id,
    birthDate,
    dateOfBirth: birthDate,
    gender: api.gender ?? raw.sex,
    salary: numberFromFields(raw, ["salary", "base_salary", "employee_salary"]),
    salaryType,
    remainingSalary:
      numberFromFields(raw, [
        "remaining_salary",
        "remainingSalary",
        "net_salary",
        "netSalary",
      ]) ?? 0,
    accountType,
    accountHolderName: api.account_holder_name,
    accountNumber: api.account_number,
    bankName: api.bank_name,
    swiftCode: api.bank_identifier_code,
    avatar: raw.avatar ?? raw.avatar_url ?? api.avatar ?? undefined,
    // avatar_url: raw.avatar_url ?? raw.avatar ?? api.avatar_url ?? api.avatar ?? undefined,
    branchCode: api.branch_location,
    taxPayerId: api.tax_payer_id ?? undefined,
    branchId: resolvedBranchId,
    departmentId: resolvedDepartmentId,
    designationId:
      resolvedDesignationId != null ? String(resolvedDesignationId) : undefined,
    branches: api.branches,
    departments: api.departments,
    emergencyName: api.emergency_name ?? api.emergency_contact?.name,
    emergencyRelation:
      api.emergency_relation ?? api.emergency_contact?.relation,
    emergencyEmail: api.emergency_email ?? api.emergency_contact?.email,
    emergencyPhone:
      api.emergency_phone_number ??
      api.emergency_contact?.phone ??
      api.emergency_contact?.phone_number,
    employeeCode:
      (api as { employee_code?: string }).employee_code != null
        ? String((api as { employee_code?: string }).employee_code)
        : undefined,
    ...(documents ? { documents } : {}),
  };
}

function compareValues(
  aVal: unknown,
  bVal: unknown,
  direction: "asc" | "desc",
): number {
  const dir = direction === "asc" ? 1 : -1;

  if (aVal == null && bVal == null) return 0;
  if (aVal == null) return 1;
  if (bVal == null) return -1;

  const aStr = String(aVal).trim();
  const bStr = String(bVal).trim();

  const aNum = Number(aStr);
  const bNum = Number(bStr);
  const bothNumeric =
    aStr !== "" &&
    bStr !== "" &&
    Number.isFinite(aNum) &&
    Number.isFinite(bNum);

  if (bothNumeric) {
    if (aNum === bNum) return 0;
    return aNum > bNum ? dir : -dir;
  }

  const aDate = Date.parse(aStr);
  const bDate = Date.parse(bStr);
  const bothDateLike = Number.isFinite(aDate) && Number.isFinite(bDate);

  if (bothDateLike) {
    if (aDate === bDate) return 0;
    return aDate > bDate ? dir : -dir;
  }

  const cmp = aStr.localeCompare(bStr, undefined, {
    sensitivity: "base",
    numeric: true,
  });
  if (cmp === 0) return 0;
  return cmp * dir;
}

type EmployeePaginationResponse = {
  total?: number;
  per_page?: number;
  current_page?: number;
  total_pages?: number;
  last_page?: number;
};

function toPositiveIntegerValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toNonNegativeIntegerValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizePagination(
  meta: EmployeePaginationResponse | undefined,
  fallback: { page: number; perPage: number; count: number },
) {
  const totalItems = toNonNegativeIntegerValue(meta?.total, fallback.count);
  const itemsPerPage = toPositiveIntegerValue(meta?.per_page, fallback.perPage);
  const fallbackTotalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const totalPages = toPositiveIntegerValue(
    meta?.total_pages ?? meta?.last_page,
    fallbackTotalPages,
  );
  const currentPage = Math.min(
    toPositiveIntegerValue(meta?.current_page, fallback.page),
    totalPages,
  );

  return {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
  };
}

function normalizeLookupKey(value: unknown): string {
  return String(value ?? "").trim();
}

function employeeMatchesLookup(employee: Employee, key: string): boolean {
  const normalized = normalizeLookupKey(key);
  if (!normalized) return false;
  return [
    employee.id,
    employee.uuid,
    employee.numericId,
    employee.employeeId,
    employee.employeeCode,
  ].some((value) => normalizeLookupKey(value) === normalized);
}

function employeeRouteKey(employee: Employee): string {
  return employee.uuid || employee.id;
}

function idMatches(value: unknown, target: string): boolean {
  return normalizeLookupKey(value) === target;
}

function employeeMatchesCompanyFilter(
  employee: Employee,
  companyId: string,
  companyName?: string,
): boolean {
  if (!companyId) return true;

  const branchCompanyMatch = employee.branches?.some((branch) =>
    idMatches(branch.company_id, companyId),
  );
  if (branchCompanyMatch) return true;

  const selectedCompanyName = normalizeLookupKey(companyName);
  if (
    selectedCompanyName &&
    normalizeLookupKey(employee.company) === selectedCompanyName
  )
    return true;

  // Legacy fallback for any older in-memory filter value that still carries a company name.
  return normalizeLookupKey(employee.company) === companyId;
}

function employeeMatchesBranchFilter(
  employee: Employee,
  branchId: string,
): boolean {
  if (!branchId) return true;
  return (
    idMatches(employee.branchId, branchId) ||
    Boolean(employee.branches?.some((branch) => idMatches(branch.id, branchId)))
  );
}

function employeeMatchesDepartmentFilter(
  employee: Employee,
  departmentId: string,
): boolean {
  if (!departmentId) return true;
  return (
    idMatches(employee.departmentId, departmentId) ||
    Boolean(
      employee.departments?.some((department) =>
        idMatches(department.id, departmentId),
      ),
    )
  );
}

export const useEmployeesStore = defineStore("employees", {
  state: () => ({
    employees: [] as Employee[],
    currentEmployee: null as ApiEmployee | null,
    loading: false,
    error: null as string | null,
    employeeOptionsLoading: false,
    employeeOptionsLoaded: false,
    employeeOptionsLoadedForUserId: null as string | null,
    employeeOptionsError: null as string | null,
    employeeOptionsCurrentPage: 0,
    employeeOptionsLastPage: 1,
    employeeOptionsTotal: 0,
    filters: {
      search: "",
      company: "",
      branch: "",
      department: "",
      status: "",
    } as FilterOptions,
    sort: {
      column: "employeeCode",
      direction: "asc",
    } as SortOptions,
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      itemsPerPage: 50,
    } as PaginationMeta,
    filterLabels: {
      companiesById: {} as Record<string, string>,
    },
    useBackendPagination: true,
  }),

  getters: {
    filteredEmployees: (state) => {
      let result = [...state.employees];

      const search = state.filters.search?.trim().toLowerCase();
      if (search) {
        result = result.filter((emp) => {
          const fields = [
            emp.name,
            emp.email,
            emp.employeeCode,
            emp.employeeId,
            emp.numericId,
            emp.company,
            emp.branch,
            emp.department,
            emp.team,
            formatRoleNames(emp, { includeTypeFallback: true }),
            emp.designation,
          ];
          return fields.some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(search),
          );
        });
      }
      if (state.filters.company) {
        const companyId = normalizeLookupKey(state.filters.company);
        const companyName = state.filterLabels.companiesById[companyId];
        result = result.filter((emp) =>
          employeeMatchesCompanyFilter(emp, companyId, companyName),
        );
      }
      if (state.filters.branch) {
        const branchId = normalizeLookupKey(state.filters.branch);
        result = result.filter((emp) =>
          employeeMatchesBranchFilter(emp, branchId),
        );
      }
      if (state.filters.department) {
        const departmentId = normalizeLookupKey(state.filters.department);
        result = result.filter((emp) =>
          employeeMatchesDepartmentFilter(emp, departmentId),
        );
      }
      if (state.filters.team) {
        result = result.filter((emp) => emp.team === state.filters.team);
      }
      if (state.filters.status) {
        result = result.filter((emp) => emp.status === state.filters.status);
      }

      result.sort((a, b) => {
        const aVal = a[state.sort.column as keyof Employee];
        const bVal = b[state.sort.column as keyof Employee];
        return compareValues(aVal, bVal, state.sort.direction);
      });

      return result;
    },

    hasActiveLocalFilters: (state) => {
      return Boolean(
        state.filters.company ||
        state.filters.branch ||
        state.filters.department ||
        state.filters.team ||
        state.filters.status,
      );
    },

    paginatedEmployees(): Employee[] {
      if (this.useBackendPagination && !this.hasActiveLocalFilters) {
        return this.filteredEmployees;
      }
      const filtered = this.filteredEmployees;
      const start =
        (this.pagination.currentPage - 1) * this.pagination.itemsPerPage;
      const end = start + this.pagination.itemsPerPage;
      return filtered.slice(start, end);
    },

    totalPages(): number {
      const totalPages =
        this.useBackendPagination && !this.hasActiveLocalFilters
          ? this.pagination.totalPages
          : Math.ceil(
              this.filteredEmployees.length / this.pagination.itemsPerPage,
            );

      return toPositiveIntegerValue(totalPages, 1);
    },

    totalItems(): number {
      if (this.useBackendPagination && !this.hasActiveLocalFilters) {
        return this.pagination.totalItems;
      }
      return this.filteredEmployees.length;
    },

    companies: (state) => {
      const companies = new Set<string>();
      state.employees.forEach((emp) => {
        if (emp.company) companies.add(emp.company);
      });
      return Array.from(companies).sort();
    },

    branches: (state) => {
      const branches = new Set<string>();
      state.employees.forEach((emp) => {
        if (emp.branch) branches.add(emp.branch);
      });
      return Array.from(branches).sort();
    },

    departments: (state) => {
      const departments = new Set<string>();
      state.employees.forEach((emp) => {
        if (emp.department) departments.add(emp.department);
      });
      return Array.from(departments).sort();
    },

    teams: (state) => {
      return [
        ...new Set(state.employees.map((emp) => emp.team).filter(Boolean)),
      ];
    },
  },

  actions: {
    setSearch(search: string) {
      this.filters.search = search;
      this.pagination.currentPage = 1;
    },

    setFilter(key: keyof FilterOptions, value: string) {
      this.filters[key] = value;
      this.pagination.currentPage = 1;
    },

    setCompanyFilterLabels(labels: Record<string, string>) {
      this.filterLabels.companiesById = labels;
    },

    setSort(column: string) {
      if (this.sort.column === column) {
        this.sort.direction = this.sort.direction === "asc" ? "desc" : "asc";
      } else {
        this.sort.column = column;
        this.sort.direction = "asc";
      }
    },

    setPage(page: number) {
      const nextPage = Math.min(
        Math.max(1, toPositiveIntegerValue(page, this.pagination.currentPage)),
        this.totalPages,
      );
      this.pagination.currentPage = nextPage;
    },

    setItemsPerPage(count: number) {
      this.pagination.itemsPerPage = count;
      this.pagination.currentPage = 1;
      this.pagination.totalPages = Math.max(
        1,
        Math.ceil(this.filteredEmployees.length / count),
      );
    },

    getEmployeeById(id: string): Employee | undefined {
      return this.employees.find((emp) => employeeMatchesLookup(emp, id));
    },

    async fetchEmployees(
      page?: number,
      perPage?: number,
      search?: string,
      period?: { month?: number | string; year?: number | string },
      include_admins?: boolean,
    ) {
      this.employeeOptionsLoaded = false;
      this.employeeOptionsLoadedForUserId = null;

      if (!hasLoadedPermission("employee-list")) {
        this.employees = [];
        this.error = null;
        this.employeeOptionsError = null;
        return missingPermissionSkip();
      }

      this.loading = true;
      this.error = null;
      const authStore = useAuthStore();
      if (!authStore.token) {
        this.employees = [];
        this.loading = false;
        return;
      }
      try {
        const p = page ?? this.pagination.currentPage;
        const pp = perPage ?? this.pagination.itemsPerPage;
        const s = search ?? this.filters.search;
        const status = this.filters.status || undefined;
        const response = await employeeService.getAll(
          authStore.token,
          p,
          pp,
          s || undefined,
          period,
          include_admins,
        );
        if (response.success && Array.isArray(response.data)) {
          this.employees = dedupeEmployees(
            response.data.map(mapApiEmployeeToDisplay),
          );
          const meta = response.meta?.pagination;
          if (meta) {
            const pagination = normalizePagination(meta, {
              page: p,
              perPage: pp,
              count: response.data.length,
            });
            this.pagination.currentPage = pagination.currentPage;
            this.pagination.totalPages = pagination.totalPages;
            this.pagination.totalItems = pagination.totalItems;
            this.pagination.itemsPerPage = pagination.itemsPerPage;
          } else {
            this.pagination.totalItems = response.data.length;
            this.pagination.totalPages = Math.max(
              1,
              Math.ceil(response.data.length / this.pagination.itemsPerPage),
            );
          }
        }
      } catch (err) {
        const apiErr = err as ApiError;
        if (apiErr.status === 403) {
          this.error = null;
          this.employees = [];
          return;
        }
        this.error = employeeListErrorMessage(err);
        this.employees = [];
      } finally {
        this.loading = false;
      }
    },

    async fetchAllEmployeeOptions(
      options: { force?: boolean; perPage?: number } = {},
    ): Promise<Employee[] | EmployeePermissionSkip> {
      if (!hasLoadedPermission("employee-list")) {
        this.employees = [];
        this.employeeOptionsLoaded = false;
        this.employeeOptionsLoadedForUserId = null;
        this.employeeOptionsError = null;
        return missingPermissionSkip();
      }

      const authStore = useAuthStore();
      if (!authStore.token) {
        throw new Error("Not authenticated");
      }

      const userId = String(authStore.user?.id ?? "").trim();
      const isSameUserCache =
        Boolean(userId) && this.employeeOptionsLoadedForUserId === userId;

      if (!options.force && this.employeeOptionsLoaded && isSameUserCache) {
        return this.employees;
      }
      if (this.employeeOptionsLoading && isSameUserCache) {
        return this.employees;
      }

      if (!isSameUserCache) {
        this.employees = [];
      }

      const perPage = toPositiveIntegerValue(
        options.perPage,
        EMPLOYEE_OPTIONS_PAGE_SIZE,
      );
      let page = 1;
      let requests = 0;
      let completed = false;
      let collected: Employee[] = [];

      this.employeeOptionsLoading = true;
      this.employeeOptionsLoaded = false;
      this.employeeOptionsLoadedForUserId = userId || null;
      this.employeeOptionsError = null;
      this.employeeOptionsCurrentPage = 0;
      this.employeeOptionsLastPage = 1;
      this.employeeOptionsTotal = 0;

      try {
        while (requests < MAX_EMPLOYEE_OPTION_PAGES) {
          requests += 1;
          const result = await employeeService.getPage(authStore.token, {
            page,
            perPage,
          });
          const mappedPage = result.items.map(mapApiEmployeeToDisplay);
          const previousCount = collected.length;
          collected = dedupeEmployees([...collected, ...mappedPage]);
          this.employees = collected;

          const pagination = result.pagination;
          this.employeeOptionsCurrentPage = pagination.currentPage;
          this.employeeOptionsLastPage = pagination.lastPage;
          this.employeeOptionsTotal = Math.max(
            pagination.total,
            collected.length,
          );

          if (pagination.hasPaginationMetadata) {
            if (pagination.currentPage >= pagination.lastPage) {
              completed = true;
              break;
            }

            const nextPage = Math.max(page + 1, pagination.currentPage + 1);
            if (nextPage <= page || collected.length === previousCount) {
              throw new Error(
                "Employee pagination did not advance to the next page",
              );
            }
            page = nextPage;
            continue;
          }

          // If metadata is absent, a short page is the only reliable end signal.
          // A full duplicate page means the backend ignored the page parameter.
          if (result.items.length < perPage) {
            completed = true;
            break;
          }
          if (collected.length === previousCount) {
            throw new Error(
              "Employee endpoint repeated a full page without pagination metadata",
            );
          }
          page += 1;
        }

        if (!completed) {
          throw new Error(
            `Employee pagination exceeded the ${MAX_EMPLOYEE_OPTION_PAGES}-page safety limit`,
          );
        }

        this.employeeOptionsLoaded = true;
        this.employeeOptionsTotal = Math.max(
          this.employeeOptionsTotal,
          collected.length,
        );
        return this.employees;
      } catch (err) {
        this.employeeOptionsLoaded = false;
        this.employeeOptionsError = employeeListErrorMessage(err);
        throw err;
      } finally {
        this.employeeOptionsLoading = false;
      }
    },

    async fetchMyProfile() {
      const authStore = useAuthStore();
      if (!authStore.token) return;

      this.loading = true;
      this.error = null;
      try {
        const employeeId =
          getEmployeeProfileIdFromUser(authStore.user) ??
          authStore.user?.employee_id ??
          authStore.user?.id;
        const response = await employeeService.getMyProfile(
          authStore.token,
          employeeId,
        );

        if (response.success && response.data) {
          this.currentEmployee = response.data;
        }
      } catch (err) {
        console.error("Failed to fetch my profile:", err);
        this.error =
          err instanceof Error ? err.message : "Failed to load profile";
      } finally {
        this.loading = false;
      }
    },

    async fetchEmployee(id: string): Promise<Employee> {
      requireLoadedPermission("employee-show");

      const authStore = useAuthStore();
      if (!authStore.token) {
        throw new Error("Not authenticated");
      }
      const normalizedId = normalizeLookupKey(id);
      if (!normalizedId) {
        throw new Error("Invalid employee ID");
      }
      const localEmployee = this.employees.find((emp) =>
        employeeMatchesLookup(emp, normalizedId),
      );
      const lookupKey = localEmployee
        ? employeeRouteKey(localEmployee)
        : normalizedId;
      const profileId = getEmployeeProfileIdFromUser(authStore.user);
      const isOwnProfile =
        authStore.user?.type === "Employee" &&
        profileId != null &&
        (normalizeLookupKey(profileId) === normalizedId ||
          (localEmployee
            ? employeeMatchesLookup(localEmployee, profileId)
            : false));

      if (isOwnProfile) {
        try {
          const response = await employeeService.getMyProfile(
            authStore.token,
            profileId,
          );
          const row = response?.data;
          if (row && typeof row === "object" && "id" in row) {
            return mapApiEmployeeToDisplay(row as ApiEmployee);
          }
        } catch {
          // GET .../employees/:id may be denied for some employee roles.
        }
        try {
          const response = await employeeService.getByUuid(
            lookupKey,
            authStore.token,
          );
          if (response?.success && response.data) {
            return mapApiEmployeeToDisplay(response.data);
          }
        } catch {
          // Some employee accounts only receive profile details in the login payload.
        }
        return buildEmployeeDisplayFromAuthUser(
          authStore.user as User,
          lookupKey,
        );
      }
      const response = localEmployee
        ? await employeeService.getByUuid(lookupKey, authStore.token)
        : await employeeService.getById(lookupKey, authStore.token);
      if (!response.success || !response.data) {
        throw new Error("Failed to fetch employee");
      }
      return mapApiEmployeeToDisplay(response.data);
    },

    async createEmployee(payload: CreateEmployeePayload): Promise<Employee> {
      requireLoadedPermission("employee-create");

      this.loading = true;
      this.error = null;
      const authStore = useAuthStore();
      if (!authStore.token) {
        throw new Error("Not authenticated");
      }
      try {
        const response = await employeeService.create(payload, authStore.token);
        if (!response.success || !response.data) {
          throw new Error("Failed to create employee");
        }
        const newEmployee = mapApiEmployeeToDisplay(response.data);
        this.employees.unshift(newEmployee);
        return newEmployee;
      } catch (err) {
        const apiErr = err as ApiError;
        this.error = apiErr.message || "Failed to create employee";
        if (apiErr.errors) {
          const first = Object.values(apiErr.errors)[0]?.[0];
          if (first) this.error = first;
        }
        throw err;
      } finally {
        this.loading = false;
      }
    },
   async createAdmin(payload: CreateEmployeePayload): Promise<Employee | null> {
    this.loading = true;
    this.error = null;
    const authStore = useAuthStore();
    if (!authStore.token) {
      throw new Error("Not authenticated");
    }
    try {
      const response = await employeeService.createAdmin(
        payload,
        authStore.token,
      );

      if (!response.success) {
        throw new Error(
          (response as any).message || "Failed to create Admin",
        );
      }

      if (!response.data) {
        return null;
      }

      const newEmployee = mapApiEmployeeToDisplay(response.data);
      this.employees.unshift(newEmployee);
      return newEmployee;
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || "Failed to create Admin";
      if (apiErr.errors) {
        const first = Object.values(apiErr.errors)[0]?.[0];
        if (first) this.error = first;
      }
      throw err;
    } finally {
      this.loading = false;
    }
  },

    async updateEmployee(
      id: string,
      payload: UpdateEmployeePayload,
      displayOverrides?: { branch?: string; department?: string },
    ): Promise<Employee> {
      requireLoadedPermission("employee-edit");

      this.loading = true;
      this.error = null;
      const authStore = useAuthStore();
      if (!authStore.token) {
        throw new Error("Not authenticated");
      }
      const normalizedId = String(id).trim();
      if (!normalizedId) {
        throw new Error("Invalid employee ID");
      }
      try {
        const response = await employeeService.update(
          normalizedId,
          payload,
          authStore.token,
        );
        if (!response.success || !response.data) {
          throw new Error("Failed to update employee");
        }
        const updated = mapApiEmployeeToDisplay(response.data);
        if (displayOverrides) {
          if (displayOverrides.branch) updated.branch = displayOverrides.branch;
          if (displayOverrides.department)
            updated.department = displayOverrides.department;
        }
        const index = this.employees.findIndex(
          (emp) => String(emp.id) === normalizedId,
        );
        if (index !== -1) {
          this.employees.splice(index, 1, updated);
        } else {
          this.employees.unshift(updated);
        }
        return updated;
      } catch (err) {
        const apiErr = err as ApiError;
        this.error = apiErr.message || "Failed to update employee";
        if (apiErr.errors) {
          const first = Object.values(apiErr.errors)[0]?.[0];
          if (first) this.error = first;
        }
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async updateAdmin(
      id: string,
      payload: UpdateEmployeePayload,
      displayOverrides?: { branch?: string; department?: string },
    ): Promise<Employee> {

      this.loading = true;
      this.error = null;
      const authStore = useAuthStore();
      if (!authStore.token) {
        throw new Error("Not authenticated");
      }
      const normalizedId = String(id).trim();
      if (!normalizedId) {
        throw new Error("Invalid Admin ID");
      }
      try {
        const response = await employeeService.updateAdmin(
          normalizedId,
          payload,
          authStore.token,
        );
        if (!response.success || !response.data) {
          throw new Error("Failed to update admin");
        }
        const updated = mapApiEmployeeToDisplay(response.data);
        if (displayOverrides) {
          if (displayOverrides.branch) updated.branch = displayOverrides.branch;
          if (displayOverrides.department)
            updated.department = displayOverrides.department;
        }
        const index = this.employees.findIndex(
          (emp) => String(emp.id) === normalizedId,
        );
        if (index !== -1) {
          this.employees.splice(index, 1, updated);
        } else {
          this.employees.unshift(updated);
        }
        return updated;
      } catch (err) {
        const apiErr = err as ApiError;
        this.error = apiErr.message || "Failed to update Admin";
        if (apiErr.errors) {
          const first = Object.values(apiErr.errors)[0]?.[0];
          if (first) this.error = first;
        }
        throw err;
      } finally {
        this.loading = false;
      }
    },
    

    async deleteEmployee(id: string): Promise<void | EmployeePermissionSkip> {
      if (!hasLoadedPermission("employee-delete")) {
        return missingPermissionSkip();
      }

      this.loading = true;
      this.error = null;
      const authStore = useAuthStore();
      if (!authStore.token) {
        throw new Error("Not authenticated");
      }
      const normalizedId = String(id).trim();
      if (!normalizedId) {
        throw new Error("Invalid employee ID");
      }
      try {
        await employeeService.delete(normalizedId, authStore.token);
        this.employees = this.employees.filter(
          (emp) => String(emp.id) !== normalizedId,
        );
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to delete employee";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async updateEmployeeSalary(id: string, salary: number) {
      return this.updateEmployee(id, { salary });
    },
  },
});
