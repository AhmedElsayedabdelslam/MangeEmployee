import { defineStore } from 'pinia'
import type { Branch } from '~/types/branch'

const STORAGE_KEY = 'hr-portal-branches'

function loadBranchesFromStorage(): Branch[] {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch (error) {
      // Error loading from localStorage
    }
  }
  return []
}

function saveBranchesToStorage(branches: Branch[]) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(branches))
    } catch (error) {
      // Error saving to localStorage
    }
  }
}

export const useBranchStore = defineStore('branches', {
  state: () => {
    const storedBranches = loadBranchesFromStorage()
    const branches = storedBranches.length > 0 ? storedBranches : []
    
    return {
      branches: branches as Branch[],
      loading: false,
      error: null as string | null
    }
  },

  actions: {
    initializeSampleData() {
      const sampleBranches: Branch[] = [
        {
          id: 'BRANCH001',
          name: 'Main Branch',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z'
        },
        {
          id: 'BRANCH002',
          name: 'Downtown Branch',
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z'
        }
      ]
      this.branches = sampleBranches
      saveBranchesToStorage(sampleBranches)
    },

    async createBranch(name: string): Promise<Branch> {
      this.loading = true
      try {
        const newBranch: Branch = {
          id: `BRANCH${Date.now()}`,
          name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        this.branches.push(newBranch)
        saveBranchesToStorage(this.branches)
        return newBranch
      } catch (err) {
        this.error = 'Failed to create branch'
        throw err
      } finally {
        this.loading = false
      }
    },

    async updateBranch(id: string, name: string): Promise<Branch> {
      this.loading = true
      try {
        const index = this.branches.findIndex(b => b.id === id)
        if (index === -1) throw new Error('Branch not found')

        const updatedBranch = {
          ...this.branches[index],
          name,
          updatedAt: new Date().toISOString()
        }

        this.branches.splice(index, 1, updatedBranch)
        saveBranchesToStorage(this.branches)
        return updatedBranch
      } catch (err) {
        this.error = 'Failed to update branch'
        throw err
      } finally {
        this.loading = false
      }
    },

    async deleteBranch(id: string): Promise<void> {
      this.loading = true
      try {
        const index = this.branches.findIndex(b => b.id === id)
        if (index === -1) throw new Error('Branch not found')

        this.branches.splice(index, 1)
        saveBranchesToStorage(this.branches)
      } catch (err) {
        this.error = 'Failed to delete branch'
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})
