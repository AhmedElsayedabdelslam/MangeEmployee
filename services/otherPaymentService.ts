// Other Payment Service
// API service layer for other payment operations

import type { OtherPayment } from '~/types/payroll'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export interface OtherPaymentResponse {
  success: boolean
  message: string
  status_code?: number
  data: OtherPayment
}

export interface OtherPaymentListResponse {
  success: boolean
  message: string
  status_code?: number
  data: OtherPayment[]
  pagination?: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export const otherPaymentService = {
  /**
   * Get all other payments
   * GET /api/other-payments
   */
  async getAll(token?: string): Promise<OtherPayment[]> {
    requireLoadedPermission('other-payment-list')
    const response = await $fetch<OtherPaymentListResponse>('/api/other-payments', {
      method: 'GET',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      }
    })
    return response?.data || []
  },

  /**
   * Get other payments by employee ID
   * GET /api/other-payments?employee_id={id}
   */
  async getByEmployeeId(employeeId: string | number, token?: string): Promise<OtherPayment[]> {
    requireLoadedPermission('other-payment-list')
    const response = await $fetch<OtherPaymentListResponse>('/api/other-payments', {
      method: 'GET',
      query: { employee_id: employeeId },
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      }
    })
    return response?.data || []
  },

  /**
   * Get single other payment by ID
   * GET /api/other-payments/{id}
   */
  async getById(id: string | number, token?: string): Promise<OtherPayment | null> {
    requireLoadedPermission('other-payment-show')
    const response = await $fetch<OtherPaymentResponse>(`/api/other-payments/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      }
    })
    return response?.data || null
  },

  /**
   * Create other payment
   * POST /api/other-payments
   */
  async create(data: {
    title: string
    amount: number | string
    employee_id: string | number
  }, token?: string): Promise<OtherPayment> {
    requireLoadedPermission('other-payment-create')
    const formData = new FormData()
    formData.append('title', data.title)
    formData.append('amount', String(data.amount))
    formData.append('employee_id', String(data.employee_id))

    const response = await $fetch<OtherPaymentResponse>('/api/other-payments', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      }
    })
    return response?.data
  },

  /**
   * Update other payment
   * PUT /api/other-payments/{id}
   */
  async update(id: string | number, data: {
    title?: string
    amount?: number | string
    employee_id?: string | number
  }, token?: string): Promise<OtherPayment> {
    requireLoadedPermission('other-payment-edit')
    const formData = new FormData()
    if (data.title !== undefined) formData.append('title', data.title)
    if (data.amount !== undefined) formData.append('amount', String(data.amount))
    if (data.employee_id !== undefined) formData.append('employee_id', String(data.employee_id))

    const response = await $fetch<OtherPaymentResponse>(`/api/other-payments/${id}`, {
      method: 'PUT',
      body: formData,
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      }
    })
    return response?.data
  },

  /**
   * Delete other payment
   * DELETE /api/other-payments/{id}
   */
  async delete(id: string | number, token?: string): Promise<void> {
    requireLoadedPermission('other-payment-delete')
    await $fetch(`/api/other-payments/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      }
    })
  }
}
