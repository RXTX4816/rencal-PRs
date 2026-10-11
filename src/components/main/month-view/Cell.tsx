import { Temporal } from "@js-temporal/polyfill"
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { MonthTimedEvent } from "@/components/events-blocks/month-view/TimedEventBlock"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import type { AllDayLaneItem } from "@/hooks/cal-events/all-day-lanes"
import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { ACTIVE_DAY_EL_ID, getLastEventEndTime } from "@/lib/active-day-draft"
import { eventKey, type CalendarEvent, type ResponseStatus } from "@/lib/cal-events"
import { setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { formatTime, type TimeFormat } from "@/lib/event-time"
import { getUserResponseStatus } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

const MAX_TIMED_VISIBLE = 4
// Past this, the "+n more" tooltip summarises the rest instead of growing off-screen.
const MAX_TOOLTIP_ROWS = 12

type HiddenEvent = {
  event: CalendarEvent
  calendarColor: string | null
  allDay: boolean
  highlighted: boolean
  rsvp: ResponseStatus | null
}

type MonthDayCellProps = {
  day: MonthDay
  timedEvents: TimedEventItem[]
  hiddenAllDayItems: AllDayLaneItem[]
  reservedAllDayHeight: string | null
  activeEventKey: string | null
  selectedEventKey: string | null
  isActiveDay: boolean
  onClick: () => void
  onEventClick: (eventKey: string) => void
  draftEvent: CalendarEvent | null
  dimmed: boolean
  startCreateDrag: (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => void
}

export function MonthDayCell({
  day,
  timedEvents,
  hiddenAllDayItems,
  reservedAllDayHeight,
  activeEventKey,
  selectedEventKey,
  isActiveDay,
  onClick,
  onEventClick,
  draftEvent,
  dimmed,
  startCreateDrag,
}: MonthDayCellProps) {
  const { calendars } = useCalendars()
  const { calendarEvents } = useCalEvents()
  const openDayDraft = useOpenDayDraft()
  const contextTargetRef = useRef<HTMLElement | null>(null)

  const visibleTimed = timedEvents.slice(0, MAX_TIMED_VISIBLE)
  const toHiddenEvent = (
    event: CalendarEvent,
    calendarColor: string | null,
    allDay: boolean,
  ): HiddenEvent => {
    const key = eventKey(event)
    return {
      event,
      calendarColor,
      allDay,
      highlighted: key === activeEventKey || key === selectedEventKey,
      rsvp: getUserResponseStatus(event, calendars),
    }
  }
  const hiddenEvents: HiddenEvent[] = [
    ...hiddenAllDayItems.map((item) => toHiddenEvent(item.event, item.calendarColor, true)),
    ...timedEvents
      .slice(MAX_TIMED_VISIBLE)
      .map((item) => toHiddenEvent(item.event, item.color, false)),
  ]

  const handleCreateEvent = (el: HTMLElement) => {
    openDayDraft(day.date, el, { start: getLastEventEndTime(day.date, calendarEvents) })
  }

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div
          data-slot="month-day"
          data-selected={isActiveDay || undefined}
          data-weekend={day.isWeekend || undefined}
          className={cn(
            // The divider is an inset shadow so it takes no width; all-day bars assume none.
            "flex flex-col gap-1 px-(--month-padding-inline) pb-1 min-h-0 overflow-hidden cursor-default shadow-[inset_-1px_0_var(--border)] last:shadow-none",
            day.isWeekend && "bg-weekend",
            isActiveDay && "bg-selected text-selected-foreground",
          )}
          id={isActiveDay ? ACTIVE_DAY_EL_ID : undefined}
          data-drop-day={day.dateKey}
          data-drop-zone="day"
          onClick={onClick}
          onPointerDown={(event) => startCreateDrag(day.date, event)}
          onContextMenu={(e) => {
            contextTargetRef.current = e.currentTarget
          }}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-event-clickable]")) return
            handleCreateEvent(e.currentTarget)
          }}
        >
          {reservedAllDayHeight && (
            <div
              className="pointer-events-none"
              style={{ height: reservedAllDayHeight, flexShrink: 0 }}
            />
          )}
          {visibleTimed.map((item) => {
            const key = eventKey(item.event)

            return (
              <MonthTimedEvent
                key={key}
                item={item}
                highlighted={key === activeEventKey || key === selectedEventKey}
                rsvp={getUserResponseStatus(item.event, calendars)}
                isDraft={item.event === draftEvent}
                dimmed={dimmed}
                onClick={() => onEventClick(key)}
              />
            )
          })}

          {hiddenEvents.length > 0 && (
            <HiddenEventsLabel events={hiddenEvents} onEventClick={onEventClick} />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            setTimeout(() => {
              handleCreateEvent(contextTargetRef.current!)
            })
          }}
        >
          Create event
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** "+n more" label whose tooltip lists the events that didn't fit in the cell. */
function HiddenEventsLabel({
  events,
  onEventClick,
}: {
  events: HiddenEvent[]
  onEventClick: (eventKey: string) => void
}) {
  const { timeFormat } = useSettings()
  const [open, setOpen] = useState(false)
  const labelRef = useRef<HTMLDivElement>(null)
  const rows = events.length > MAX_TOOLTIP_ROWS ? events.slice(0, MAX_TOOLTIP_ROWS - 1) : events
  const rest = events.length - rows.length

  const handleEventClick = (key: string) => {
    // Anchor to the label: the row unmounts once the tooltip closes.
    setEventAnchor(labelRef.current)
    setOpen(false)
    onEventClick(key)
  }

  // Portaled content still bubbles React events to the day cell (drag-to-create, day click, context menu).
  const stopPropagation = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <Tooltip delayDuration={300} open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <div
          ref={labelRef}
          className="text-xs text-muted-foreground px-0.5 truncate shrink-0 self-start hover:text-foreground"
        >
          +{events.length} more
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className="max-w-64 flex-col items-stretch gap-1 p-1.5"
        onPointerDown={stopPropagation}
        onClick={stopPropagation}
        onDoubleClick={stopPropagation}
        onContextMenu={stopPropagation}
      >
        {rows.map((hidden) => {
          const key = eventKey(hidden.event)
          return (
            <HiddenEventRow
              key={key}
              {...hidden}
              timeFormat={timeFormat}
              onClick={() => handleEventClick(key)}
            />
          )
        })}
        {rest > 0 && <span className="text-2xs opacity-70 px-1.5">and {rest} more</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/** Mirrors `MonthTimedEvent` so hidden events get the same theme styles, minus drag and context menu. */
function HiddenEventRow({
  event,
  calendarColor,
  allDay,
  highlighted,
  rsvp,
  timeFormat,
  onClick,
}: HiddenEvent & { timeFormat: TimeFormat; onClick: () => void }) {
  return (
    <button
      type="button"
      data-slot="calendar-event"
      data-view="month"
      data-kind="timed"
      data-selected={highlighted || undefined}
      data-rsvp={rsvp ?? undefined}
      data-event-clickable
      className="flex items-center gap-(--event-padding-inline) pr-(--event-padding-inline) text-xs text-left truncate cursor-default rounded-xs shrink-0 outline-none"
      style={getCalendarEventStyle({ calendarColor, eventColor: event.color })}
      onClick={onClick}
    >
      <div data-slot="calendar-event-color-marker" className="w-0.5 self-stretch shrink-0" />
      <span className="truncate">
        <span data-slot="calendar-event-time" data-typography="numerical" className="text-2xs">
          {allDay ? "All day" : formatTime(event.start, timeFormat)}
        </span>{" "}
        <span data-slot="calendar-event-title">{event.summary || <UntitledEventText />}</span>
      </span>
    </button>
  )
}
