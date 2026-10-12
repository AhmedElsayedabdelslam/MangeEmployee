
// export default defineNuxtRouteMiddleware((to, from) => {
//   const importVerified = useState<boolean>('importVerified', () => false)
//   if (!importVerified.value && to.path === '/employees/import') {
//     const toast = useToast()
//     toast.add({
//       title: 'Access Denied',
//       description: 'You must verify your identity first to access import page.',
//       color: 'error',
//       icon: 'i-lucide-shield-alert'
//     })
    
//     return navigateTo('/employees')
//   }
// })




import { decryptSession, isSessionValid } from '~/utils/importCrypto'

export default defineNuxtRouteMiddleware(async (to, from) => {
  const encryptedToken = sessionStorage.getItem('importVerified')
  
  if (!encryptedToken) {
    const toast = useToast()
    toast.add({
      title: 'Access Denied',
      description: 'You must verify your identity first.',
      color: 'error',
      icon: 'i-lucide-shield-alert'
    })
    return navigateTo('/employees')
  }

  try {
    const session = await decryptSession(encryptedToken)
    
    if (!session || !session.verified) {
      throw new Error('Invalid session')
    }

    if (!isSessionValid(session.timestamp)) {
      sessionStorage.removeItem('importVerified')
      
      const toast = useToast()
      toast.add({
        title: 'Session Expired',
        description: 'Please verify again.',
        color: 'error',
        icon: 'i-lucide-clock-alert'
      })
      return navigateTo('/employees')
    }

    return
  } catch {
    sessionStorage.removeItem('importVerified')
    
    const toast = useToast()
    toast.add({
      title: 'Invalid Session',
      description: 'Please verify again.',
      color: 'error',
      icon: 'i-lucide-shield-alert'
    })
    return navigateTo('/employees')
  }
})