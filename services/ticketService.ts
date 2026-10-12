import type { ApiResponse } from "~/types/api";
import type {
  Ticket,
  TicketStatus,
  CreateTicketPayload,
  UpdateTicketPayload,
  TicketFilterParams,
  TicketComment,
} from "~/types/ticket";
import { normalizeTicketStatus, serializeTicketStatus } from "~/types/ticket";
import { createApiError } from "~/utils/apiError";
import { requireLoadedPermission } from "~/utils/permissionAccess";

function getApiBaseUrl() {
  const config = useRuntimeConfig();
  return config.public.apiUrl || "http://127.0.0.1:8000/api";
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

function buildQuery(params?: TicketFilterParams) {
  const searchParams = new URLSearchParams();
  if (!params) return searchParams.toString();
  if (params.employee_id != null && String(params.employee_id).trim() !== "") {
    searchParams.set("employee_id", String(params.employee_id));
  }
  if (params.status?.trim()) {
    searchParams.set("status", normalizeTicketStatus(params.status.trim()));
  }
  if (params.search?.trim()) {
    searchParams.set("search", params.search.trim());
  }
  if (params.page != null) {
    searchParams.set("page", String(params.page));
  }
  if (params.per_page != null) {
    searchParams.set("per_page", String(params.per_page));
  }
  return searchParams.toString();
}

async function parseError(response: Response, fallbackMessage: string) {
  const err = await response.json().catch(() => ({}));
  throw createApiError(
    (err as { message?: string }).message || fallbackMessage,
    response.status,
    err,
  );
}

export const ticketService = {
  async getAll(
    token: string,
    params?: TicketFilterParams,
  ): Promise<ApiResponse<Ticket[]>> {
    requireLoadedPermission("ticket-list");
    const query = buildQuery(params);
    const url = query
      ? `${getApiBaseUrl()}/tickets?${query}`
      : `${getApiBaseUrl()}/tickets`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      await parseError(response, "Failed to fetch tickets");
    }

    return response.json();
  },

  async getById(
    id: string | number,
    token: string,
  ): Promise<ApiResponse<Ticket>> {
    requireLoadedPermission("ticket-show");
    const response = await fetch(
      `${getApiBaseUrl()}/tickets/${encodeURIComponent(String(id))}`,
      {
        method: "GET",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      await parseError(response, "Failed to fetch ticket");
    }

    return response.json();
  },

  async create(
    payload: CreateTicketPayload,
    token: string,
  ): Promise<ApiResponse<Ticket>> {
    requireLoadedPermission("ticket-create");
    const formData = new FormData();
    formData.append("title", payload.title);
    formData.append("priority", payload.priority);
    formData.append("employee_id", String(payload.employee_id));
    formData.append("status", serializeTicketStatus(payload.status));
    formData.append("description", payload.description);
    formData.append("end_date", payload.end_date);
    if (payload.ticket_code?.trim()) {
      formData.append("ticket_code", payload.ticket_code.trim());
    }
    if (payload.attachment) {
      formData.append("attachment", payload.attachment);
    }

    const response = await fetch(`${getApiBaseUrl()}/tickets`, {
      method: "POST",
      headers: authHeaders(token),
      body: formData,
    });

    if (!response.ok) {
      await parseError(response, "Failed to create ticket");
    }

    return response.json();
  },

  async update(
    id: string | number,
    payload: UpdateTicketPayload,
    token: string,
  ): Promise<ApiResponse<Ticket>> {
    requireLoadedPermission("ticket-edit");
    const formData = new FormData();
    formData.append("title", payload.title);
    formData.append("status", serializeTicketStatus(payload.status));
    formData.append("end_date", payload.end_date);
    formData.append("description", payload.description);
    formData.append("priority", payload.priority);
    if (payload.ticket_code?.trim()) {
      formData.append("ticket_code", payload.ticket_code.trim());
    }
    if (payload.attachment) {
      formData.append("attachment", payload.attachment);
    }

    const response = await fetch(
      `${getApiBaseUrl()}/tickets/${encodeURIComponent(String(id))}`,
      {
        method: "PUT",
        headers: authHeaders(token),
        body: formData,
      },
    );

    if (!response.ok) {
      await parseError(response, "Failed to update ticket");
    }

    return response.json();
  },

  async delete(
    id: string | number,
    token: string,
  ): Promise<ApiResponse<string>> {
    requireLoadedPermission("ticket-delete");
    const response = await fetch(
      `${getApiBaseUrl()}/tickets/${encodeURIComponent(String(id))}`,
      {
        method: "DELETE",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      await parseError(response, "Failed to delete ticket");
    }

    return response.json();
  },

  async changeStatus(
    uuid: string,
    status: TicketStatus,
    token: string,
  ): Promise<ApiResponse<Ticket>> {
    // Backend currently omits middleware on this endpoint. Keep the established
    // Ticket Edit rule enforced in every Frontend caller/service layer.
    requireLoadedPermission("ticket-edit");
    const response = await fetch(
      `${getApiBaseUrl()}/change-ticket-status/${encodeURIComponent(uuid)}`,
      {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: serializeTicketStatus(status) }),
      },
    );

    if (!response.ok) {
      await parseError(response, "Failed to change ticket status");
    }

    return response.json();
  },

  async getTicketComments(
    ticketId: string,
    token: string,
  ): Promise<ApiResponse<TicketComment[]>> {
    requireLoadedPermission("ticket-show");
    const response = await fetch(
      `${getApiBaseUrl()}/ticket-comments?ticket_id=${encodeURIComponent(ticketId)}`,
      {
        method: "GET",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      await parseError(response, "Failed to fetch comments");
    }

    return response.json();
  },

  async addComment(
    formData: FormData,
    token?: string,
  ): Promise<ApiResponse<TicketComment>> {
    requireLoadedPermission("ticket-edit");

    const response = await fetch(`${getApiBaseUrl()}/ticket-comments`, {
      method: "POST",
      headers: authHeaders(token!),
      body: formData,
    });

    if (!response.ok) {
      await parseError(response, "Failed to add comment");
    }

    return response.json();
  },

  async deleteComment(
    commentId: string,
    token?: string,
  ): Promise<ApiResponse<void>> {
    requireLoadedPermission("ticket-delete");
    const response = await fetch(
      `${getApiBaseUrl()}/ticket-comments/${encodeURIComponent(commentId)}`,
      {
        method: "DELETE",
        headers: {
          ...authHeaders(token!),
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      await parseError(response, "Failed to delete comment");
    }

    return response.json();
  },

  async updateComment(
    commentId: string,
    formData: FormData,
    token?: string,
  ): Promise<ApiResponse<TicketComment>> {
    requireLoadedPermission("ticket-edit");

    const response = await fetch(
      `${getApiBaseUrl()}/ticket-comments/${encodeURIComponent(commentId)}`,
      {
        method: "PUT",
        headers: authHeaders(token!),
        body: formData,
      },
    );

    if (!response.ok) {
      await parseError(response, "Failed to update comment");
    }

    return response.json();
  },
};
