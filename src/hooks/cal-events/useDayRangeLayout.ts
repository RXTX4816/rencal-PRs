import { useMemo } from "react"

import type { Calendar } from "@/lib/api"
import type { CalendarEvent } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { DAY_MINUTES, epochDay } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"

import { assignAllDayLanes, buildAllDaySpan, type AllDayLaneItem } from "./all-day-lanes"
import { layoutTimedOverlaps } from "./timed-overlaps"
import type { MonthDay } from "./useMonthGrid"

export type WeekEventDisplayMode = "xs" | "sm" | "md" | "lg"

export type WeekTimedEventLayout = {
  event: CalendarEvent
  calendarColor: string | null
  top: number
  height: number
  /** Horizontal box as shares (0–1) of the day's event area; see layoutTimedOverlaps. */
  left: number
  width: number
  /** Share at the right edge drawn over by a neighbour, kept clear of text. */
  coveredWidth: number
  durationMinutes: number
  displayMode: WeekEventDisplayMode
}

export type DayRangeLayout = {
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  timedByDay: Map<string, WeekTimedEventLayout[]>
}

/** Returns top and height as percentages (0–100) of the visible range */
function computeTimedPosition(
  event: CalendarEvent,
  rangeStartMin: number,
  rangeMinutes: number,
): { top: number; height: number; durationMinutes: number } {
  // Pre-computed at the EventTime → CalendarEvent boundary; expressed in
  // the viewer's local zone (matches Google/Apple calendar UIs).
  const { startLocalMinutes, endLocalMinutes, firstDay, endDay } = event.dateInfo

  // If event spans midnight, clamp end to end of day
  const durationMinutes =
    endDay > firstDay ? DAY_MINUTES - startLocalMinutes : endLocalMinutes - startLocalMinutes

  const top = ((startLocalMinutes - rangeStartMin) / rangeMinutes) * 100
  const height = (durationMinutes / rangeMinutes) * 100

  return { top, height, durationMinutes }
}

// Thresholds are the shortest durations whose block fits each mode's lines at 48px per hour.
function displayModeFor(durationMinutes: number): WeekEventDisplayMode {
  if (durationMinutes < 45) return "xs"
  if (durationMinutes < 60) return "sm"
  if (durationMinutes < 75) return "md"
  return "lg"
}

export function useDayRangeLayout(
  days: MonthDay[],
  events: CalendarEvent[],
  calendars: Calendar[],
): DayRangeLayout {
  return useMemo(() => {
    const calMap = new Map<string, Calendar>()
    for (const cal of calendars) {
      calMap.set(cal.slug, cal)
    }

    const N = days.length
    if (N === 0) {
      return { allDayItems: [], maxAllDayLane: -1, timedByDay: new Map() }
    }

    const rangeStartDay = epochDay(days[0].date)
    const rangeLastDay = epochDay(days[N - 1].date)
    const rangeExclEndDay = rangeLastDay + 1

    const rangeStartMin = 0
    const rangeMinutes = DAY_MINUTES

    const allDayItems: AllDayLaneItem[] = []
    const timedByDay = new Map<string, WeekTimedEventLayout[]>()
    for (const day of days) {
      timedByDay.set(day.dateKey, [])
    }

    for (const event of events) {
      const { firstDay } = event.dateInfo
      const calendarColor = getCalendarColor(calMap.get(event.calendar_slug))

      if (isSpanning(event)) {
        const item = buildAllDaySpan(event, rangeStartDay, rangeLastDay, calendarColor)
        if (item) allDayItems.push(item)
      } else {
        // Single-day timed event
        if (firstDay < rangeStartDay || firstDay >= rangeExclEndDay) continue

        const colIndex = firstDay - rangeStartDay
        if (colIndex >= 0 && colIndex < N) {
          const dateKey = days[colIndex].dateKey
          const { top, height, durationMinutes } = computeTimedPosition(
            event,
            rangeStartMin,
            rangeMinutes,
          )
          timedByDay.get(dateKey)!.push({
            event,
            calendarColor,
            top,
            height,
            left: 0,
            width: 1,
            coveredWidth: 0,
            durationMinutes,
            displayMode: displayModeFor(durationMinutes),
          })
        }
      }
    }

    for (const layouts of timedByDay.values()) {
      layoutTimedOverlaps(layouts)
    }

    const maxAllDayLane = assignAllDayLanes(allDayItems, N)

    return { allDayItems, maxAllDayLane, timedByDay }
  }, [days, events, calendars])
}
