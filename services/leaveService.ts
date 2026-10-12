import type { ApiResponse } from "~/types/api";
import { createApiError } from "~/utils/apiError";
import { requireLoadedPermission } from "~/utils/permissionAccess";

export interface Leave {
  id: string;
  uuid: string;
  employee_id: string;
  leave_type_id: string;
  leaveTypeTitle: string;
  replacement_employee_id?: string;
  replacement_employee_name?: string | null;
  start_date: string;
  end_date: string;
  total_leave_days: number;
  leave_reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  applied_on: string;
  created_by: string;
}

export interface CreateLeavePayload {
  employee_id: string;
  leave_type_id: string;
  replacement_employee_id?: string | number;
  start_date: string;
  end_date: string;
  leave_reason: string;
  remark?: string;
}

export interface UpdateLeavePayload {
  leave_type_id?: string;
  replacement_employee_id?: string | number;
  start_date?: string;
  end_date?: string;
  leave_reason?: string;
}

function getBaseUrl() {
  const config = useRuntimeConfig();
  return config.public.apiUrl || "http://127.0.0.1:8000/api";
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}

function normalizeLeave(row: Leave): Leave {
  return {
    ...row,
    id: String(row.id),
    uuid: String(row.uuid ?? row.id),
    employee_id: String(row.employee_id),
    leave_type_id: String(row.leave_type_id),
    replacement_employee_id:
      row.replacement_employee_id != null
        ? String(row.replacement_employee_id)
        : undefined,
    replacement_employee_name: row.replacement_employee_name
      ? String(row.replacement_employee_name)
      : null,
    total_leave_days: Number(row.total_leave_days ?? 0),
  };
}

function extractLeaveRows(data: unknown): Leave[] {
  if (Array.isArray(data))
    return data.map((row) => normalizeLeave(row as Leave));
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { data?: Leave[] }).data)
  ) {
    return (data as { data: Leave[] }).data.map((row) => normalizeLeave(row));
  }
  return [];
}

export const leaveService = {
  async getAll(token?: string): Promise<ApiResponse<Leave[]>> {
    requireLoadedPermission("leave-list");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(`${getBaseUrl()}/leaves`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        err.message || "Failed to fetch leaves",
        response.status,
        err,
      );
    }
    const json = await response.json();
    json.data = extractLeaveRows(json.data);
    return json;
  },

  async getByUuid(uuid: string, token?: string): Promise<ApiResponse<Leave>> {
    requireLoadedPermission("leave-show");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(`${getBaseUrl()}/leaves/${uuid}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        err.message || "Failed to fetch leave",
        response.status,
        err,
      );
    }
    const json = await response.json();
    if (json.data) json.data = normalizeLeave(json.data);
    return json;
  },

  async create(
    payload: CreateLeavePayload,
    token?: string,
  ): Promise<ApiResponse<Leave>> {
    requireLoadedPermission("leave-create");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const totalDays = calculateDays(payload.start_date, payload.end_date);

    const response = await fetch(`${getBaseUrl()}/leaves`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        ...payload,
        total_leave_days: totalDays,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        err.message || "Failed to create leave",
        response.status,
        err,
      );
    }
    const json = await response.json();
    if (json.data) json.data = normalizeLeave(json.data);
    return json;
  },

  async updateByUuid(
    uuid: string,
    payload: UpdateLeavePayload,
    token?: string,
  ): Promise<ApiResponse<Leave>> {
    requireLoadedPermission("leave-edit");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const updatePayload: any = { ...payload };
    if (payload.start_date && payload.end_date) {
      updatePayload.total_leave_days = calculateDays(
        payload.start_date,
        payload.end_date,
      );
    }

    const response = await fetch(`${getBaseUrl()}/leaves/${uuid}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(updatePayload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        err.message || "Failed to update leave",
        response.status,
        err,
      );
    }
    const json = await response.json();
    if (json.data) json.data = normalizeLeave(json.data);
    return json;
  },

  async deleteByUuid(
    uuid: string,
    token?: string,
  ): Promise<ApiResponse<unknown>> {
    requireLoadedPermission("leave-delete");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(`${getBaseUrl()}/leaves/${uuid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        err.message || "Failed to delete leave",
        response.status,
        err,
      );
    }
    const json = await response.json();
    if (json.data) json.data = normalizeLeave(json.data);
    return json;
  },

  async approveByUuid(
    uuid: string,
    token?: string,
  ): Promise<ApiResponse<Leave>> {
    requireLoadedPermission("approve-leave");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(`${getBaseUrl()}/approve-leave/${uuid}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        err.message || "Failed to approve leave",
        response.status,
        err,
      );
    }
    const json = await response.json();
    if (json.data) json.data = normalizeLeave(json.data);
    return json;
  },

  async rejectByUuid(
    uuid: string,
    token?: string,
  ): Promise<ApiResponse<Leave>> {
    requireLoadedPermission("reject-leave");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(`${getBaseUrl()}/reject-leave/${uuid}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        err.message || "Failed to reject leave",
        response.status,
        err,
      );
    }
    const json = await response.json();
    if (json.data) json.data = normalizeLeave(json.data);
    return json;
  },

  async cancelByUuid(
    uuid: string,
    token?: string,
  ): Promise<ApiResponse<unknown>> {
    requireLoadedPermission("cancel-leave");
    const authToken = token || getAuthToken();
    if (!authToken) throw new Error("Authentication required");

    const response = await fetch(`${getBaseUrl()}/cancel-leave/${uuid}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createApiError(
        err.message || "Failed to cancel leave",
        response.status,
        err,
      );
    }
    const json = await response.json();
    if (json.data) json.data = normalizeLeave(json.data);
    return json;
  },

  async checkOverlap(
    employeeId: string,
    startDate: string,
    endDate: string,
    token?: string,
  ): Promise<boolean> {
    const result = await this.getAll(token);
    const approvedLeaves = extractLeaveRows(result.data).filter(
      (leave) =>
        String(leave.employee_id) === String(employeeId) &&
        leave.status === "approved",
    );

    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);

    return approvedLeaves.some((leave) => {
      const leaveStart = new Date(leave.start_date);
      const leaveEnd = new Date(leave.end_date);
      return newStart <= leaveEnd && newEnd >= leaveStart;
    });
  },
};
