import { defineStore } from "pinia";
import { ticketService } from "~/services/ticketService";
import { useAuthStore } from "~/stores/auth";
import { requireLoadedPermission } from "~/utils/permissionAccess";
import type { ApiResponse } from "~/types/api";
import type {
  Ticket,
  CreateTicketPayload,
  UpdateTicketPayload,
  TicketDisplay,
  TicketStatistics,
  TicketFilterParams,
  TicketAttachment,
  TicketSlaStatus,
  TicketStatus,
} from "~/types/ticket";
import {
  formatTicketPriorityLabel,
  formatTicketStatusLabel,
  normalizeTicketPriority,
  normalizeTicketStatus,
} from "~/types/ticket";

function parseNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractAttachment(
  raw: Record<string, any>,
): string | TicketAttachment | null {
  if (raw.attachment != null) return raw.attachment;
  if (Array.isArray(raw.attachments) && raw.attachments.length > 0) {
    return raw.attachments[0];
  }
  return null;
}

function resolveSlaStatus(api: Ticket): {
  status: TicketSlaStatus;
  label: string;
} {
  if (api.resolve_status === "in_time")
    return { status: "in_time", label: "On Time" };
  if (api.resolve_status === "over_due")
    return { status: "over_due", label: "Overdue" };

  const endDate = api.end_date ? new Date(api.end_date) : null;
  if (
    normalizeTicketStatus(api.status) !== "closed" &&
    endDate &&
    !Number.isNaN(endDate.getTime())
  ) {
    endDate.setHours(23, 59, 59, 999);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (today > endDate) {
      return { status: "over_due", label: "Overdue" };
    }
  }

  return { status: "pending", label: "Pending" };
}

function mapApiTicketToDisplay(api: Ticket): TicketDisplay {
  const raw = api as Ticket & Record<string, any>;
  const employeeId =
    parseNumericId(api.employee_id) ??
    parseNumericId(raw.employee_id) ??
    parseNumericId(raw.employee?.id) ??
    parseNumericId(raw.employee?.employee_id);

  const rawEmployee = raw.employee as Record<string, any> | null | undefined;
  const employeeName =
    api.employee_name ??
    raw.employee_name ??
    rawEmployee?.name ??
    rawEmployee?.full_name ??
    null;

  const employeeCode =
    raw.employee?.employee_id != null
      ? String(raw.employee.employee_id)
      : undefined;

  const uuid =
    typeof raw.uuid === "string" && raw.uuid.trim()
      ? raw.uuid.trim()
      : undefined;

  const sla = resolveSlaStatus(api);

  return {
    id: Number(api.id),
    uuid,
    title: api.title ?? "",
    ticketCode: String(api.ticket_code ?? raw.ticketCode ?? api.id),
    priority: normalizeTicketPriority(api.priority),
    priorityLabel: formatTicketPriorityLabel(api.priority),
    status: normalizeTicketStatus(api.status),
    statusLabel: formatTicketStatusLabel(api.status),
    slaStatus: sla.status,
    slaStatusLabel: sla.label,
    employeeId,
    employeeCode,
    employee: employeeName ?? undefined,
    description: api.description ?? "",
    attachment: extractAttachment(raw),
    createdAt: api.created_at ?? undefined,
    updatedAt: api.updated_at ?? undefined,
    endDate: api.end_date ?? "",
    createdBy: api.created_by ?? undefined,
    raw: api,
  };
}

function sortTicketsByDate(tickets: TicketDisplay[]) {
  return [...tickets].sort((a, b) => {
    const aTime = new Date(
      a.createdAt ?? a.updatedAt ?? a.endDate ?? 0,
    ).getTime();
    const bTime = new Date(
      b.createdAt ?? b.updatedAt ?? b.endDate ?? 0,
    ).getTime();
    return bTime - aTime;
  });
}

function buildStatistics(tickets: TicketDisplay[]): TicketStatistics {
  return {
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === "open").length,
    in_progress: tickets.filter((ticket) => ticket.status === "in_progress")
      .length,
    closed: tickets.filter((ticket) => ticket.status === "closed").length,
  };
}

function isEmptyTicketsMessage(message: unknown) {
  if (typeof message !== "string") return false;
  const normalized = message.trim().toLowerCase();
  return (
    /no\s+tickets?\s+found/.test(normalized) ||
    /tickets?\s+not\s+found/.test(normalized)
  );
}

function isEmptyTicketsResponse(response: ApiResponse<Ticket[]>) {
  return !response.success && isEmptyTicketsMessage(response.message);
}

function isEmptyTicketsError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const error = err as { message?: unknown; status?: unknown; data?: unknown };
  if (isEmptyTicketsMessage(error.message)) return true;
  if (error.status === 404) {
    const data = error.data as { message?: unknown } | undefined;
    return isEmptyTicketsMessage(data?.message);
  }
  return false;
}

export const useTicketStore = defineStore("tickets", {
  state: () => ({
    tickets: [] as TicketDisplay[],
    loading: false,
    error: null as string | null,
  }),

  getters: {
    statistics: (state): TicketStatistics =>
      buildStatistics(state?.tickets ?? []),

    statisticsFor:
      () =>
      (tickets: TicketDisplay[]): TicketStatistics =>
        buildStatistics(tickets),

    sortedTickets: (state) => sortTicketsByDate(state?.tickets ?? []),

    ticketsByStatus: (state) => (status: string) => {
      return (state?.tickets ?? []).filter(
        (ticket) => ticket.status === normalizeTicketStatus(status),
      );
    },

    getTicketById: (state) => (id: string | number) => {
      const key = String(id);

      return (state?.tickets ?? []).find(
        (ticket) => String(ticket.id) === key || ticket.uuid === key,
      );
    },
  },

  actions: {
    setTickets(tickets: Ticket[]) {
      this.tickets = sortTicketsByDate(tickets.map(mapApiTicketToDisplay));
    },

    upsertTicket(ticket: Ticket) {
      const normalized = mapApiTicketToDisplay(ticket);
      const existingIndex = this.tickets.findIndex(
        (item) => item.id === normalized.id,
      );
      if (existingIndex === -1) {
        this.tickets = sortTicketsByDate([...this.tickets, normalized]);
      } else {
        const next = [...this.tickets];
        next.splice(existingIndex, 1, normalized);
        this.tickets = sortTicketsByDate(next);
      }
      return normalized;
    },

    async fetchTickets(params?: TicketFilterParams) {
      requireLoadedPermission("ticket-list");
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();
        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        const response = await ticketService.getAll(authStore.token, params);
        if (isEmptyTicketsResponse(response)) {
          this.setTickets([]);
          return this.tickets;
        }

        if (!response.success || !Array.isArray(response.data)) {
          throw new Error(response.message || "Failed to fetch tickets");
        }

        this.setTickets(response.data);
        return this.tickets;
      } catch (err: any) {
        if (isEmptyTicketsError(err)) {
          this.setTickets([]);
          return this.tickets;
        }

        this.error = err.message || "Failed to fetch tickets";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async fetchTicketById(
      id: string | number,
      requiredPermission: "ticket-show" | "ticket-edit" = "ticket-show",
    ) {
      requireLoadedPermission(requiredPermission);
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();
        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        const response = await ticketService.getById(id, authStore.token);
        if (!response.success) {
          throw new Error(response.message || "Failed to fetch ticket");
        }

        return this.upsertTicket(response.data);
      } catch (err: any) {
        this.error = err.message || "Failed to fetch ticket";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async createTicket(payload: CreateTicketPayload) {
      requireLoadedPermission("ticket-create");
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();
        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        const response = await ticketService.create(payload, authStore.token);
        if (!response.success) {
          throw new Error(response.message || "Failed to create ticket");
        }

        return this.upsertTicket(response.data);
      } catch (err: any) {
        this.error = err.message || "Failed to create ticket";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async updateTicket(id: string | number, payload: UpdateTicketPayload) {
      requireLoadedPermission("ticket-edit");
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();
        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        const response = await ticketService.update(
          id,
          payload,
          authStore.token,
        );
        if (!response.success) {
          throw new Error(response.message || "Failed to update ticket");
        }

        return this.upsertTicket(response.data);
      } catch (err: any) {
        this.error = err.message || "Failed to update ticket";
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async deleteTicket(id: string | number) {
      requireLoadedPermission("ticket-delete");
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();
        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        const response = await ticketService.delete(id, authStore.token);
        if (!response.success) {
          throw new Error(response.message || "Failed to delete ticket");
        }

        const key = String(id);
        this.tickets = this.tickets.filter(
          (ticket) => String(ticket.id) !== key && ticket.uuid !== key,
        );

        return response.data;
      } catch (err: any) {
        this.error = err.message || "Failed to delete ticket";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async changeTicketStatus(id: string | number, status: TicketStatus) {
      requireLoadedPermission("ticket-edit");
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();
        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        const key = String(id);
        const ticket = this.tickets.find(
          (item) => String(item.id) === key || item.uuid === key,
        );
        if (!ticket) {
          throw new Error("Ticket not found");
        }

        const normalizedStatus = normalizeTicketStatus(status);
        const uuid = String(ticket.uuid || key);
        const response = await ticketService.changeStatus(
          uuid,
          normalizedStatus,
          authStore.token,
        );
        if (!response.success) {
          throw new Error(response.message || "Failed to change ticket status");
        }

        return this.upsertTicket(response.data);
      } catch (err: any) {
        this.error = err.message || "Failed to change ticket status";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async addComment(ticketId: string, formData: FormData) {
      requireLoadedPermission("ticket-edit");
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();

        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        formData.set("ticket_id", ticketId);

        const response = await ticketService.addComment(
          formData,
          authStore.token,
        );

        if (!response.success) {
          throw new Error(response.message || "Failed to add comment");
        }

        const ticket = this.tickets.find(
          (t) => String(t.id) === ticketId || t.uuid === ticketId,
        );

        if (ticket) {
          if (!ticket.comments) {
            ticket.comments = [];
          }

          ticket.comments.unshift(response.data);
        }

        return response.data;
      } catch (err: any) {
        this.error = err.message || "Failed to add comment";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async fetchTicketComments(ticketId: string) {
      requireLoadedPermission("ticket-show");
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();
        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        const response = await ticketService.getTicketComments(
          ticketId,
          authStore.token,
        );
        if (!response.success) {
          throw new Error(response.message || "Failed to fetch comments");
        }

        const ticket = this.tickets.find(
          (t) => String(t.id) === ticketId || t.uuid === ticketId,
        );
        if (ticket) {
          ticket.comments = response.data;
        }

        return response.data;
      } catch (err: any) {
        this.error = err.message || "Failed to fetch comments";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async updateComment(commentId: string, formData: FormData) {
      requireLoadedPermission("ticket-edit");
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();
        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        const response = await ticketService.updateComment(
          commentId,
          formData,
          authStore.token,
        );
        if (!response.success) {
          throw new Error(response.message || "Failed to update comment");
        }

        this.tickets.forEach((ticket) => {
          if (ticket.comments) {
            const index = ticket.comments.findIndex(
              (c) => c.uuid === commentId || c.id === commentId,
            );
            if (index !== -1) {
              ticket.comments[index] = response.data;
            }
          }
        });

        return response.data;
      } catch (err: any) {
        this.error = err.message || "Failed to update comment";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async deleteComment(commentId: string) {
      requireLoadedPermission("ticket-delete");
      this.loading = true;
      this.error = null;

      try {
        const authStore = useAuthStore();
        if (!authStore.token) {
          throw new Error("Not authenticated");
        }

        const response = await ticketService.deleteComment(
          commentId,
          authStore.token,
        );
        if (!response.success) {
          throw new Error(response.message || "Failed to delete comment");
        }

        this.tickets.forEach((ticket) => {
          if (ticket.comments) {
            ticket.comments = ticket.comments.filter(
              (c) => c.uuid !== commentId && c.id !== commentId,
            );
          }
        });
      } catch (err: any) {
        this.error = err.message || "Failed to delete comment";
        throw err;
      } finally {
        this.loading = false;
      }
    },

    upsertTicketWithComments(ticket: TicketDisplay) {
      const existingIndex = this.tickets.findIndex(
        (item) => item.id === ticket.id || item.uuid === ticket.uuid,
      );
      if (existingIndex === -1) {
        this.tickets = sortTicketsByDate([...this.tickets, ticket]);
      } else {
        const next = [...this.tickets];
        next.splice(existingIndex, 1, ticket);
        this.tickets = sortTicketsByDate(next);
      }
      return ticket;
    },
  },
});
