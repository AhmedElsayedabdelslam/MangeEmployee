// Mock Auth Service
import type { ApiResponse } from '~/types/api'
import type { LoginCredentials, LoginData } from '~/types/auth'

const mockUsers = [
  {
    email: 'admin@gmail.com',
    password: 'password',
    user: {
      id: 1,
      email: 'admin@gmail.com',
      first_name: 'Admin',
      last_name: 'User',
      type: 'Super-Admin' as const,
      role: ['admin']
    }
  },
  {
    email: 'mostafa.mod@manager.com',
    password: 'Password@123',
    user: {
      id: 2,
      email: 'mostafa.mod@manager.com',
      first_name: 'Mostafa',
      last_name: 'Mohamed',
      type: 'Branch-Manager' as const,
      role: ['manager']
    }
  },
  {
    email: 'user@example.com',
    password: 'password',
    user: {
      id: 3,
      email: 'user@example.com',
      first_name: 'Test',
      last_name: 'User',
      type: 'Employee' as const,
      role: ['employee']
    }
  }
]

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const mockAuthService = {
  /**
   * Mock login
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<LoginData>> {
    // Simulate network delay
    await delay(800)

    // Find user
    const user = mockUsers.find(
      u => u.email === credentials.email && u.password === credentials.password
    )

    if (!user) {
      throw new Error('Invalid email or password. Please try again.')
    }

    // Generate mock token
    const token = 'mock_token_' + btoa(user.email + '_' + Date.now())

    return {
      success: true,
      message: 'Login successful (Mock Mode)',
      status_code: 200,
      data: {
        token,
        user: user.user
      }
    }
  },

  /**
   * Mock logout
   */
  async logout(token: string): Promise<ApiResponse<null>> {
    // Simulate network delay
    await delay(500)

    return {
      success: true,
      message: 'Logged out successfully (Mock Mode)',
      status_code: 200,
      data: null
    }
  }
}
