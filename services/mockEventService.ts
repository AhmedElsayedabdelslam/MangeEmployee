export interface MockEvent {
  id: number
  title: string
  date: string
  time: string
  endTime?: string
  location?: string
  description: string
  color: string
}

export interface MockEventPayload {
  title: string
  date: string
  time: string
  endTime?: string
  location?: string
  description: string
  color: string
}

let mockEvents: MockEvent[] = [
  {
    id: 1,
    title: 'Company Picnic',
    date: '2026-04-15',
    time: '2:00 PM',
    endTime: '4:00 PM',
    location: 'Central Park',
    description: 'Annual outdoor gathering with food, games, and networking.',
    color: '#9777FA'
  },
  {
    id: 2,
    title: 'Q2 Townhall',
    date: '2026-04-20',
    time: '10:00 AM',
    endTime: '11:00 AM',
    location: 'Main Hall',
    description: 'Leadership update on quarterly goals, business progress, and priorities.',
    color: '#7C5CE0'
  },
  {
    id: 3,
    title: 'Team Building Activity',
    date: '2026-04-28',
    time: '3:00 PM',
    endTime: '5:00 PM',
    location: 'Outdoor Venue',
    description: 'Cross-functional activity focused on collaboration and communication.',
    color: '#8B5CF6'
  }
]

let nextEventId = 4

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

function sortByDateThenTime(items: MockEvent[]): MockEvent[] {
  return [...items].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return timeToMinutes(a.time) - timeToMinutes(b.time)
  })
}

function clone(item: MockEvent): MockEvent {
  return { ...item }
}

export const mockEventService = {
  async list(): Promise<MockEvent[]> {
    return sortByDateThenTime(mockEvents).map(clone)
  },

  async create(payload: MockEventPayload): Promise<MockEvent> {
    const created: MockEvent = {
      id: nextEventId,
      ...payload,
      color: payload.color || '#9777FA'
    }
    nextEventId += 1
    mockEvents.push(created)
    return clone(created)
  },

  async update(id: number, payload: Partial<MockEventPayload>): Promise<MockEvent> {
    const index = mockEvents.findIndex(item => item.id === id)
    if (index === -1) throw new Error('Event not found')

    const updated: MockEvent = {
      ...mockEvents[index],
      ...payload
    }
    mockEvents[index] = updated
    return clone(updated)
  },

  async remove(id: number): Promise<void> {
    mockEvents = mockEvents.filter(item => item.id !== id)
  }
}
