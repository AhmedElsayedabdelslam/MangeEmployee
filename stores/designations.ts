import { defineStore } from 'pinia'
import type { Designation } from '~/types/designation'
import { useBranchStore } from './branches'
import { useDepartmentStore } from './departments'

const STORAGE_KEY = 'hr-portal-designations'

function loadDesignationsFromStorage(): Designation[] {
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

function saveDesignationsToStorage(designations: Designation[]) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(designations))
    } catch (error) {
      // Error saving to localStorage
    }
  }
}

export const useDesignationStore = defineStore('designations', {
  state: () => {
    const storedDesignations = loadDesignationsFromStorage()
    const designations = storedDesignations.length > 0 ? storedDesignations : []
    
    return {
      designations: designations as Designation[],
      loading: false,
      error: null as string | null
    }
  },

  getters: {
    designationsWithNames: (state) => {
      const branchStore = useBranchStore()
      const departmentStore = useDepartmentStore()
      return state.designations.map(desig => ({
        ...desig,
        branchName: branchStore.branches.find(b => b.id === desig.branchId)?.name || 'Unknown',
        departmentName: departmentStore.departments.find(d => d.id === desig.departmentId)?.name || 'Unknown'
      }))
    }
  },

  actions: {
    initializeSampleData() {
      const sampleDesignations: Designation[] = [
        {
          id: 'DESIG001',
          name: 'Manager',
          branchId: 'BRANCH001',
          departmentId: 'DEPT001',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z'
        },
        {
          id: 'DESIG002',
          name: 'Developer',
          branchId: 'BRANCH001',
          departmentId: 'DEPT002',
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z'
        }
      ]
      this.designations = sampleDesignations
      saveDesignationsToStorage(sampleDesignations)
    },

    async createDesignation(name: string, branchId: string, departmentId: string): Promise<Designation> {
      this.loading = true
      try {
        const newDesignation: Designation = {
          id: `DESIG${Date.now()}`,
          name,
          branchId,
          departmentId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        this.designations.push(newDesignation)
        saveDesignationsToStorage(this.designations)
        return newDesignation
      } catch (err) {
        this.error = 'Failed to create designation'
        throw err
      } finally {
        this.loading = false
      }
    },

    async updateDesignation(id: string, name: string, branchId: string, departmentId: string): Promise<Designation> {
      this.loading = true
      try {
        const index = this.designations.findIndex(d => d.id === id)
        if (index === -1) throw new Error('Designation not found')

        const updatedDesignation = {
          ...this.designations[index],
          name,
          branchId,
          departmentId,
          updatedAt: new Date().toISOString()
        }

        this.designations.splice(index, 1, updatedDesignation)
        saveDesignationsToStorage(this.designations)
        return updatedDesignation
      } catch (err) {
        this.error = 'Failed to update designation'
        throw err
      } finally {
        this.loading = false
      }
    },

    async deleteDesignation(id: string): Promise<void> {
      this.loading = true
      try {
        const index = this.designations.findIndex(d => d.id === id)
        if (index === -1) throw new Error('Designation not found')

        this.designations.splice(index, 1)
        saveDesignationsToStorage(this.designations)
      } catch (err) {
        this.error = 'Failed to delete designation'
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})
