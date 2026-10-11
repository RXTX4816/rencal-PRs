import { describe, expect, it } from "vitest"

import type { CalendarEvent } from "@/lib/cal-events"

import { assignOverlapColumns, type WeekTimedEventLayout } from "./useDayRangeLayout"

function layout(id: string, top: number, height: number): WeekTimedEventLayout {
  return {
    event: { id } as CalendarEvent,
    calendarColor: null,
    top,
    height,
    column: 0,
    totalColumns: 1,
    durationMinutes: 0,
    displayMode: "lg",
  }
}

function columnsById(layouts: WeekTimedEventLayout[]) {
  return Object.fromEntries(layouts.map((l) => [l.event.id, [l.column, l.totalColumns]]))
}

describe("assignOverlapColumns", () => {
  it("places simultaneous events in separate columns of the same group", () => {
    const layouts = [layout("a", 10, 10), layout("b", 10, 10), layout("c", 10, 10)]
    assignOverlapColumns(layouts)

    expect(columnsById(layouts)).toEqual({ a: [0, 3], b: [1, 3], c: [2, 3] })
  })

  it("keeps events that only touch in one full-width column", () => {
    const layouts = [layout("a", 10, 10), layout("b", 20, 10)]
    assignOverlapColumns(layouts)

    expect(columnsById(layouts)).toEqual({ a: [0, 1], b: [0, 1] })
  })

  it("reuses a freed column within a chained overlap group", () => {
    // a overlaps b, b overlaps c, but a and c don't overlap: c takes a's column.
    const layouts = [layout("a", 0, 20), layout("b", 10, 20), layout("c", 25, 10)]
    assignOverlapColumns(layouts)

    expect(columnsById(layouts)).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] })
  })

  it("sizes separate groups independently", () => {
    const layouts = [layout("a", 0, 10), layout("b", 0, 10), layout("c", 50, 10)]
    assignOverlapColumns(layouts)

    expect(columnsById(layouts)).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] })
  })
})
