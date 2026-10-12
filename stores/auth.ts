import { defineStore, getActivePinia } from 'pinia'
import { authService } from '~/services/authService'
import { useDebug } from '~/composables/useDebug'
import { useNotificationStore } from '~/stores/notifications'
import type { User, LoginCredentials, PermissionStatus } from '~/types/auth'
import {
  extractPermissionsFromResponse,
  normalizePermissionNames,
} from '~/utils/permissions'

type PermissionsRequest = {
  token: string
  userId: string
  promise: Promise<string[]>
}

let permissionsRequest: PermissionsRequest | null = null

/**
 * Business stores are scoped to the authenticated account. Disposing their
 * Pinia instances prevents cached rows from one account being rendered after
 * logout/login as another account. UI-only stores stay mounted so the logout
 * transition itself remains stable.
 */
function resetSessionScopedStores() {
  const pinia = getActivePinia() as any
  if (!pinia?._s || !pinia?.state?.value) return

  const persistentStoreIds = new Set(['auth', 'navigation', 'logoutModal'])
  for (const [storeId, store] of Array.from(pinia._s.entries()) as Array<[string, any]>) {
    if (persistentStoreIds.has(storeId)) continue
    store.$dispose?.()
    pinia._s.delete(storeId)
    delete pinia.state.value[storeId]
  }
}

function normalizeAuthUser(rawUser: unknown): User {
  const user = (rawUser && typeof rawUser === 'object' ? rawUser : {}) as Record<string, any>
  const permissions = normalizePermissionNames({
    permissions: user.permissions,
    permission_names: user.permission_names,
  })

  const name = user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.email

  return {
    ...user,
    name: name || user?.email,
    permissions,
  } as User
}

function persistAuth(token: string, user: User) {
  if (!process.client) return
  localStorage.setItem('auth_token', token)
  localStorage.setItem('auth_user', JSON.stringify(user))
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    token: null as string | null,
    isLoading: false,
    error: null as string | null,
    userHydrationUnavailable: false,
    permissionsStatus: 'idle' as PermissionStatus,
    permissionsError: null as string | null,
    permissionsLoadedAt: null as number | null,
    resetPasswordLoading: false,
    resetPasswordError: null as string | null,
    resetPasswordSuccess: false,
    forgotPasswordLoading: false,
    forgotPasswordError: null as string | null,
    forgotPasswordSuccess: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.token && !!state.user,
    userRole: (state) => state.user?.type || null,
    isSuperAdmin: (state) => state.user?.type === 'Super-Admin',
    currentUser: (state) => state.user,
    isLoggedIn: (state) => !!state.token && !!state.user,
    permissionsReady: (state) => state.permissionsStatus === 'loaded',
    permissionsLoading: (state) => state.permissionsStatus === 'loading',
  },

  actions: {
    init() {
      const debug = useDebug()

      if (process.client) {
        if (this.token && this.user) return

        const token = localStorage.getItem('auth_token')
        const userJson = localStorage.getItem('auth_user')
        debug.log('Auth initialization started', {
          hasToken: Boolean(token),
          hasStoredUser: Boolean(userJson)
        })
        if (token && userJson) {
          try {
            useNotificationStore().resetNotifications()
            const storedUser = normalizeAuthUser(JSON.parse(userJson))
            const user = normalizeAuthUser({
              ...storedUser,
              permissions: [],
              permission_names: [],
            })

            this.$patch({
              token,
              user,
              permissionsStatus: 'idle',
              permissionsError: null,
              permissionsLoadedAt: null,
              userHydrationUnavailable: false,
            })

            // Stored permissions are never trusted as the current backend truth.
            persistAuth(token, user)
            debug.info('Auth initialized from localStorage', {
              userId: this.user?.id,
              role: this.user?.type
            })
          } catch (error) {
            debug.warn('Stored auth user is invalid; clearing local auth state', error)
            this.clearAuth()
          }
        }
      }
    },

    initAuth() {
      this.init()
    },

    async login(credentials: LoginCredentials) {
      const debug = useDebug()

      permissionsRequest = null
      useNotificationStore().resetNotifications()
      resetSessionScopedStores()
      this.$patch({
        user: null,
        token: null,
        permissionsStatus: 'idle',
        permissionsError: null,
        permissionsLoadedAt: null,
        userHydrationUnavailable: false,
      })
      if (process.client) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
      }

      this.isLoading = true
      this.error = null
      debug.log('Login attempt', { email: credentials.email })

      try {
        const response = await authService.login(credentials) as any
        const token = response?.data?.token ?? response?.token
        const user = response?.data?.user ?? response?.user
        const ok = response?.success === true || (!!token && !!user)

        if (ok && token && user) {
          permissionsRequest = null
          const normalizedUser = normalizeAuthUser({
            ...user,
            permissions: [],
            permission_names: [],
          })

          // $patch batches the mutations into one Pinia commit so the
          // Echo plugin watcher fires exactly once with both token AND user.id
          // already set — no intermediate state where token is set but user is null.
          this.$patch({
            token,
            user: normalizedUser,
            userHydrationUnavailable: false,
            permissionsStatus: 'idle',
            permissionsError: null,
            permissionsLoadedAt: null,
          })

          persistAuth(token, normalizedUser)

          try {
            await this.refreshPermissions({
              force: true,
              clearBeforeFetch: true,
            })
          } catch (permissionsError: any) {
            debug.warn('Login succeeded but permissions could not be loaded', permissionsError)
            if (permissionsError?.status === 401 || !this.isAuthenticated) {
              const message = permissionsError?.message || 'Your session could not be verified.'
              this.error = message
              return { success: false, message }
            }
          }

          debug.info('Login successful', {
            userId: this.user?.id,
            role: this.user?.type
          })
          return { success: true, message: response?.message || 'Welcome!' }
        }

        const msg = response?.message || 'Invalid email or password.'
        this.error = msg
        debug.warn('Login rejected', {
          email: credentials.email,
          message: msg
        })
        return { success: false, message: msg }
      } catch (error: any) {
        const msg = error?.message || 'Login failed. Please try again.'
        this.error = msg
        debug.error('Login failed', {
          email: credentials.email,
          error
        })
        return { success: false, message: msg }
      } finally {
        this.isLoading = false
      }
    },

    async logout() {
      const debug = useDebug()
      const token = this.token
      const userId = this.user?.id
      const role = this.user?.type

      this.isLoading = true
      debug.log('Logout started', {
        userId,
        role
      })

      permissionsRequest = null
      useNotificationStore().resetNotifications()
      resetSessionScopedStores()
      this.$patch({
        user: null,
        token: null,
        error: null,
        userHydrationUnavailable: false,
        permissionsStatus: 'idle',
        permissionsError: null,
        permissionsLoadedAt: null,
      })
      if (process.client) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
      }

      try {
        if (token) {
          await authService.logout(token)
          debug.info('Logout request completed')
        }
      } catch (error) {
        debug.warn('Logout request failed; clearing local auth state anyway', error)
      } finally {
        this.isLoading = false
        debug.info('Local auth state cleared after logout')
      }
    },

    clearAuth() {
      const debug = useDebug()

      permissionsRequest = null
      useNotificationStore().resetNotifications()
      resetSessionScopedStores()
      this.user = null
      this.token = null
      this.error = null
      this.userHydrationUnavailable = false
      this.permissionsStatus = 'idle'
      this.permissionsError = null
      this.permissionsLoadedAt = null

      if (process.client) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
      }
      debug.warn('Auth state cleared')
    },

    async hydrateUserFromApi() {
      const debug = useDebug()
      if (!this.token || !this.user) {
        this.userHydrationUnavailable = true
        return
      }

      const requestToken = this.token
      const requestUserId = String(this.user.id)

      try {
        const response = await authService.me(requestToken) as any
        if (
          this.token !== requestToken ||
          String(this.user?.id ?? '') !== requestUserId
        ) {
          return
        }

        const rawUser = response?.data?.user ?? response?.data ?? response?.user
        if (!rawUser) {
          this.userHydrationUnavailable = true
          debug.warn('Current user endpoint returned no user payload')
          return
        }

        const permissions = normalizePermissionNames(this.user?.permissions)
        const normalizedUser = normalizeAuthUser({
          ...(this.user ?? {}),
          ...rawUser,
          permissions,
          permission_names: [],
        })

        this.user = normalizedUser
        this.userHydrationUnavailable = false

        if (process.client) {
          localStorage.setItem('auth_user', JSON.stringify(normalizedUser))
        }

        debug.info('Current user refreshed from API', {
          userId: normalizedUser.id,
          role: normalizedUser.type,
          permissions: normalizedUser.permissions?.length ?? 0,
        })
      } catch (error) {
        if (
          this.token !== requestToken ||
          String(this.user?.id ?? '') !== requestUserId
        ) {
          return
        }

        debug.warn('Current user hydration unavailable', error)
        this.userHydrationUnavailable = true
      }
    },

    async refreshPermissions(options: {
      force?: boolean
      clearBeforeFetch?: boolean
    } = {}): Promise<string[]> {
      if (!this.token || !this.user) {
        this.permissionsStatus = 'idle'
        this.permissionsError = null
        this.permissionsLoadedAt = null
        return []
      }

      if (this.permissionsStatus === 'loaded' && !options.force) {
        return normalizePermissionNames(this.user.permissions)
      }

      const requestToken = this.token
      const requestUserId = String(this.user.id)
      if (
        permissionsRequest?.token === requestToken &&
        permissionsRequest.userId === requestUserId
      ) {
        return permissionsRequest.promise
      }

      if (options.clearBeforeFetch) {
        this.user = normalizeAuthUser({
          ...this.user,
          permissions: [],
          permission_names: [],
        })
        persistAuth(requestToken, this.user)
      }

      this.permissionsStatus = 'loading'
      this.permissionsError = null

      const request = {
        token: requestToken,
        userId: requestUserId,
        promise: null as unknown as Promise<string[]>,
      }

      request.promise = (async () => {
        try {
          const response = await authService.permissionsByUser(requestToken)
          const permissions = extractPermissionsFromResponse(response)

          if (
            this.token !== requestToken ||
            String(this.user?.id ?? '') !== requestUserId
          ) {
            return []
          }

          const updatedUser = normalizeAuthUser({
            ...this.user,
            permissions,
            permission_names: [],
          })

          // The endpoint result replaces the previous list, including when it is empty.
          updatedUser.permissions = permissions
          this.user = updatedUser
          this.permissionsStatus = 'loaded'
          this.permissionsError = null
          this.permissionsLoadedAt = Date.now()
          persistAuth(requestToken, updatedUser)

          return permissions
        } catch (error: any) {
          if (
            this.token === requestToken &&
            String(this.user?.id ?? '') === requestUserId
          ) {
            this.permissionsStatus = 'error'
            this.permissionsError = error?.message || 'Failed to load user permissions.'
            this.permissionsLoadedAt = null

            if (!this.isSuperAdmin && this.user) {
              this.user = normalizeAuthUser({
                ...this.user,
                permissions: [],
                permission_names: [],
              })
              persistAuth(requestToken, this.user)
            }

            if (error?.status === 401) {
              this.clearAuth()
            }
          }

          throw error
        } finally {
          if (permissionsRequest === request) {
            permissionsRequest = null
          }
        }
      })()

      permissionsRequest = request
      return request.promise
    },

    async ensurePermissionsLoaded(): Promise<boolean> {
      if (this.permissionsStatus === 'loaded') {
        return true
      }
      if (!this.token || !this.user) {
        return false
      }
      if (this.permissionsStatus === 'error') {
        return false
      }

      try {
        await this.refreshPermissions({
          clearBeforeFetch: this.permissionsStatus === 'idle',
        })
        return this.permissionsStatus === 'loaded'
      } catch {
        return false
      }
    },
      async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
      const debug = useDebug()
      
      this.forgotPasswordLoading = true
      this.forgotPasswordError = null
      this.forgotPasswordSuccess = false
      
      debug.log('Forgot password request', { email })

      try {
        const response = await authService.forgotPassword(email) as any
        const success = response?.success === true || response?.status === 'success'
        const message = response?.message || 'Password reset link sent to your email.'
        
        if (success) {
          this.forgotPasswordSuccess = true
          this.forgotPasswordError = null
          debug.info('Password reset email sent', { email })
          return { success: true, message }
        } else {
          const errorMsg = response?.message || 'Failed to send reset link. Please try again.'
          this.forgotPasswordError = errorMsg
          this.forgotPasswordSuccess = false
          debug.warn('Forgot password failed', { email, message: errorMsg })
          return { success: false, message: errorMsg }
        }
      } catch (error: any) {
        const msg = error?.message || 'An error occurred. Please try again later.'
        this.forgotPasswordError = msg
        this.forgotPasswordSuccess = false
        debug.error('Forgot password error', { email, error })
        return { success: false, message: msg }
      } finally {
        this.forgotPasswordLoading = false
      }
    },

    async resetPassword(
      token: string,
      email: string,
      newPassword: string,
      confirmPassword: string
    ): Promise<{ success: boolean; message: string }> {
      const debug = useDebug()
      
      this.resetPasswordLoading = true
      this.resetPasswordError = null
      this.resetPasswordSuccess = false
      
      debug.log('Reset password attempt', { 
        hasToken: Boolean(token),
        email,
        passwordLength: newPassword?.length || 0,
        passwordsMatch: newPassword === confirmPassword
      })
      if (newPassword !== confirmPassword) {
        const msg = 'Passwords do not match.'
        this.resetPasswordError = msg
        this.resetPasswordLoading = false
        return { success: false, message: msg }
      }
      if (newPassword.length < 8) {
        const msg = 'Password must be at least 8 characters long.'
        this.resetPasswordError = msg
        this.resetPasswordLoading = false
        return { success: false, message: msg }
      }

      try {
        const response = await authService.resetPassword(
          token,
          email,
          newPassword,
          confirmPassword
        )
        
        const success = response?.success === true || response?.status === 'success'
        const message = response?.message || 'Password reset successfully.'
        
        if (success) {
          this.resetPasswordSuccess = true
          this.resetPasswordError = null
          return { success: true, message }
        } else {
          const errorMsg = response?.message || 'Failed to reset password.'
          this.resetPasswordError = errorMsg
          this.resetPasswordSuccess = false
          return { success: false, message: errorMsg }
        }
      } catch (error: any) {
        const msg = error?.message || 'An error occurred. Please try again later.'
        this.resetPasswordError = msg
        this.resetPasswordSuccess = false
        return { success: false, message: msg }
      } finally {
        this.resetPasswordLoading = false
      }
    },
    clearForgotPasswordState() {
      this.forgotPasswordLoading = false
      this.forgotPasswordError = null
      this.forgotPasswordSuccess = false
    },
    clearResetPasswordState() {
      this.resetPasswordLoading = false
      this.resetPasswordError = null
      this.resetPasswordSuccess = false
    },
  }
})
