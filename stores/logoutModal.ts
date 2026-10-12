import { defineStore } from 'pinia'

export const useLogoutModalStore = defineStore('logoutModal', {
  state: () => ({
    visible: false,
    loading: false
  }),

  actions: {
    open() {
      this.visible = true
      const navigationStore = useNavigationStore()
      navigationStore.closeMobileSidebar()
    },

    close() {
      this.visible = false
    },

    async confirmLogout() {
      this.loading = true
      const authStore = useAuthStore()
      const router = useRouter()
      try {
        await authStore.logout()
        this.visible = false
        await router.push('/login')
      } catch (error) {
        // Logout error
      } finally {
        this.loading = false
      }
    }
  }
})
