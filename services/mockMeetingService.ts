export interface MockMeeting {
  id: number
  title: string
  date: string
  time: string
  endTime?: string
  department?: string
  link?: string
  description: string
  color: string
}

export interface MockMeetingPayload {
  title: string
  date: string
  time: string
  endTime?: string
  department?: string
  link?: string
  description: string
  color: string
}

let mockMeetings: MockMeeting[] = [
  {
    id: 1,
    title: 'Project Sync',
    date: '2026-04-10',
    time: '9:00 AM',
    endTime: '9:45 AM',
    department: 'IT Department',
    link: 'https://meet.google.com/project-sync',
    description: 'Sprint alignment on priorities, blockers, and release milestones.',
    color: '#10B981'
  },
  {
    id: 2,
    title: 'Client Presentation',
    date: '2026-04-18',
    time: '2:00 PM',
    endTime: '3:00 PM',
    department: 'Sales Department',
    link: 'https://zoom.us/j/1234567890',
    description: 'Presentation of solution progress and next delivery phase.',
    color: '#059669'
  },
  {
    id: 3,
    title: 'Weekly Standup',
    date: '2026-04-25',
    time: '11:00 AM',
    endTime: '11:30 AM',
    department: 'HR Department',
    link: 'https://meet.google.com/weekly-standup',
    description: 'Weekly operational meeting to review actions and team workload.',
    color: '#0D9488'
  }
]

let nextMeetingId = 4

function timeToMinutes(value: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER

  const normalized = value.trim().toUpperCase()
  const twelvePattern = /^(\d{1,2}):(\d{2})\s?(AM|PM)$/
  const twelveMatch = normalized.match(twelvePattern)

  if (twelveMatch) {
    let hours = Number(twelveMatch[1])
    const minutes = Number(twelveMatch[2])
    const meridiem = twelveMatch[3]

    if (meridiem === 'AM') {
      if (hours === 12) hours = 0
    } else if (hours !== 12) {
      hours += 12
    }

    return hours * 60 + minutes
  }

  const twentyFourPattern = /^(\d{1,2}):(\d{2})$/
  const twentyFourMatch = normalized.match(twentyFourPattern)
  if (twentyFourMatch) {
    return Number(twentyFourMatch[1]) * 60 + Number(twentyFourMatch[2])
  }

  return Number.MAX_SAFE_INTEGER
}

function sortByDateThenTime(items: MockMeeting[]): MockMeeting[] {
  return [...items].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return timeToMinutes(a.time) - timeToMinutes(b.time)
  })
}

function clone(item: MockMeeting): MockMeeting {
  return { ...item }
}

export const mockMeetingService = {
  async list(): Promise<MockMeeting[]> {
    return sortByDateThenTime(mockMeetings).map(clone)
  },

  async create(payload: MockMeetingPayload): Promise<MockMeeting> {
    const created: MockMeeting = {
      id: nextMeetingId,
      ...payload,
      color: payload.color || '#10B981'
    }
    nextMeetingId += 1
    mockMeetings.push(created)
    return clone(created)
  },

  async update(id: number, payload: Partial<MockMeetingPayload>): Promise<MockMeeting> {
    const index = mockMeetings.findIndex(item => item.id === id)
    if (index === -1) throw new Error('Meeting not found')

    const updated: MockMeeting = {
      ...mockMeetings[index],
      ...payload
    }
    mockMeetings[index] = updated
    return clone(updated)
  },

  async remove(id: number): Promise<void> {
    mockMeetings = mockMeetings.filter(item => item.id !== id)
  }
}
