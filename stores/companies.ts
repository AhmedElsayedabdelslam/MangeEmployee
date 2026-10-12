import { defineStore } from 'pinia'
import type { Company } from '~/types/company'

// Helper functions for localStorage
const STORAGE_KEY = 'hr-portal-companies'

function loadCompaniesFromStorage(): Company[] {
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

function saveCompaniesToStorage(companies: Company[]) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(companies))
    } catch (error) {
      // Error saving to localStorage
    }
  }
}

export const useCompanyStore = defineStore('companies', {
  state: () => {
    const storedCompanies = loadCompaniesFromStorage()
    const companies = storedCompanies.length > 0 ? storedCompanies : []
    
    return {
      companies: companies as Company[],
      loading: false,
      error: null as string | null
    }
  },

  actions: {
    // Initialize with sample data
    initializeSampleData() {
      const sampleCompanies: Company[] = [
        {
          id: 'COMP001',
          name: 'Brainhealth',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z'
        },
        {
          id: 'COMP002',
          name: 'MODERNNOORLLC',
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z'
        }
      ]
      this.companies = sampleCompanies
      saveCompaniesToStorage(sampleCompanies)
    },

    // Create new company
    async createCompany(name: string): Promise<Company> {
      this.loading = true
      try {
        const newCompany: Company = {
          id: `COMP${Date.now()}`,
          name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        this.companies.push(newCompany)
        saveCompaniesToStorage(this.companies)
        return newCompany
      } catch (err) {
        this.error = 'Failed to create company'
        throw err
      } finally {
        this.loading = false
      }
    },

    // Update company
    async updateCompany(id: string, name: string): Promise<Company> {
      this.loading = true
      try {
        const index = this.companies.findIndex(c => c.id === id)
        if (index === -1) throw new Error('Company not found')

        const updatedCompany = {
          ...this.companies[index],
          name,
          updatedAt: new Date().toISOString()
        }

        this.companies.splice(index, 1, updatedCompany)
        saveCompaniesToStorage(this.companies)
        return updatedCompany
      } catch (err) {
        this.error = 'Failed to update company'
        throw err
      } finally {
        this.loading = false
      }
    },

    // Delete company
    async deleteCompany(id: string): Promise<void> {
      this.loading = true
      try {
        const index = this.companies.findIndex(c => c.id === id)
        if (index === -1) throw new Error('Company not found')

        this.companies.splice(index, 1)
        saveCompaniesToStorage(this.companies)
      } catch (err) {
        this.error = 'Failed to delete company'
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})
