import type { ApiResponse } from '~/types/api'
import type { LoginData, LoginCredentials, User } from '~/types/auth'
import { mockAuthService } from './mockAuthService'

const useMockMode = () => {
  const config = useRuntimeConfig()
  return String(config.public.useMockAuth || 'false') === 'true'
}

function resolveUrl(baseUrl: string, path: string): string {
  if (baseUrl.startsWith('http')) return `${baseUrl}${path}`
  if (typeof window !== 'undefined') return `${baseUrl}${path}`
  return `http://localhost:3000${baseUrl}${path}`
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<ApiResponse<LoginData>> {
    if (useMockMode()) return mockAuthService.login(credentials)

    const config = useRuntimeConfig()
    const baseUrl = config.public.apiUrl
    const url = resolveUrl(baseUrl, '/login')

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(credentials)
      })

      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')

      if (!response.ok) {
        const err = isJson ? await response.json().catch(() => ({})) : {}
        const msg =
          err.message ||
          (err.errors && Object.values(err.errors as Record<string, string[]>).flat()[0]) ||
          `Request failed (${response.status})`
        throw new Error(msg)
      }

      if (!isJson) {
        throw new Error('Backend did not return JSON. Is the proxy running and is the backend online?')
      }

      return response.json()
    } catch (error: any) {
      const msg: string = error?.message || ''
      if (
        msg.includes('Failed to fetch') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed') ||
        msg.includes('network')
      ) {
        throw new Error('Cannot reach the backend server. Make sure Laravel is running on http://127.0.0.1:8000 and then restart the Nuxt dev server.')
      }
      throw error
    }
  },

  async logout(token: string): Promise<ApiResponse<null>> {
    if (useMockMode()) return mockAuthService.logout(token)

    const config = useRuntimeConfig()
    const url = resolveUrl(config.public.apiUrl, '/logout')

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ token })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.message || 'Logout failed')
      }

      return response.json()
    } catch (error: any) {
      throw new Error(error.message || 'Logout failed.')
    }
  },
  async forgotPassword(email: string): Promise<any> {
    if (useMockMode()) {
      return {
        success: true,
        message: 'Password reset link sent to your email.'
      }
    }

    const config = useRuntimeConfig()
    const baseUrl = config.public.apiUrl
    const url = resolveUrl(baseUrl, '/forgot-password')

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ email })
      })

      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')

      if (!response.ok) {
        const err = isJson ? await response.json().catch(() => ({})) : {}
        const msg =
          err.message ||
          (err.errors && Object.values(err.errors as Record<string, string[]>).flat()[0]) ||
          `Request failed (${response.status})`
        throw new Error(msg)
      }

      if (!isJson) {
        throw new Error('Backend did not return JSON. Is the backend online?')
      }

      return response.json()
    } catch (error: any) {
      const msg: string = error?.message || ''
      if (
        msg.includes('Failed to fetch') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed') ||
        msg.includes('network')
      ) {
        throw new Error('Cannot reach the backend server. Please try again later.')
      }
      throw error
    }
  },

    async resetPassword(
    token: string,
    email: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<any> {
    if (useMockMode()) {
      return {
        success: true,
        message: 'Password reset successfully.'
      }
    }

    const config = useRuntimeConfig()
    const baseUrl = config.public.apiUrl
    const url = resolveUrl(baseUrl, '/reset-password')

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ 
          email: email,
          token: token,
          password: newPassword,
          password_confirmation: confirmPassword
        })
      })

      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')

      if (!response.ok) {
        const err = isJson ? await response.json().catch(() => ({})) : {}
        const msg =
          err.message ||
          (err.errors && Object.values(err.errors as Record<string, string[]>).flat()[0]) ||
          `Request failed (${response.status})`
        throw new Error(msg)
      }

      if (!isJson) {
        throw new Error('Backend did not return JSON. Is the backend online?')
      }

      return response.json()
    } catch (error: any) {
      const msg: string = error?.message || ''
      if (
        msg.includes('Failed to fetch') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed') ||
        msg.includes('network')
      ) {
        throw new Error('Cannot reach the backend server. Please try again later.')
      }
      throw error
    }
  },

  async me(token: string): Promise<ApiResponse<User>> {
      const disableMeRequest = true
      if (disableMeRequest) {
        return {
          success: true,
          data: null as unknown as User,
        }
      }
    if (useMockMode()) {
      throw new Error('Current user refresh is not available in mock auth mode.')
    }

    const config = useRuntimeConfig()
    const url = resolveUrl(config.public.apiUrl, '/me')

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
      })

      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')

      if (!response.ok) {
        const err = isJson ? await response.json().catch(() => ({})) : {}
        throw new Error(err.message || `Request failed (${response.status})`)
      }

      if (!isJson) {
        throw new Error('Backend did not return JSON. Is the backend online?')
      }

      return response.json()
    } catch (error: any) {
      throw new Error(error.message || 'Failed to refresh current user.')
    }
  },

  // TODO: Remove the separate permissions bootstrap request after
  // login/current-user responses consistently include getAllPermissions().
  async permissionsByUser(token: string): Promise<unknown> {
    if (useMockMode()) {
      return {
        success: true,
        data: []
      }
    }

    const config = useRuntimeConfig()
    const url = resolveUrl(config.public.apiUrl, '/permissions-by-user')

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })

    const contentType = response.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')
    const payload = isJson
      ? await response.json().catch(() => ({}))
      : null

    if (!response.ok) {
      const message =
        (payload as { message?: string } | null)?.message ||
        `Failed to load permissions (${response.status})`
      const error = new Error(message) as Error & {
        status?: number
        payload?: unknown
      }

      error.status = response.status
      error.payload = payload
      throw error
    }

    if (!isJson) {
      throw new Error('Permissions endpoint did not return JSON.')
    }

    return payload
  }
}
