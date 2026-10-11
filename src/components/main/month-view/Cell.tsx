import { Temporal } from "@js-temporal/polyfill"
import { useRef, type PointerEvent as ReactPointerEvent } from "react"

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
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { formatTime, type TimeFormat } from "@/lib/event-time"
import { getUserResponseStatus } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

const MAX_TIMED_VISIBLE = 4
// Past this, the "+n more" tooltip summarises the rest instead of growing off-screen.
const MAX_TOOLTIP_ROWS = 12

type HiddenEvent = { event: CalendarEvent; calendarColor: string | null; allDay: boolean }

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
  const hiddenEvents: HiddenEvent[] = [
    ...hiddenAllDayItems.map((item) => ({
      event: item.event,
      calendarColor: item.calendarColor,
      allDay: true,
    })),
    ...timedEvents.slice(MAX_TIMED_VISIBLE).map((item) => ({
      event: item.event,
      calendarColor: item.color,
      allDay: false,
    })),
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

          {hiddenEvents.length > 0 && <HiddenEventsLabel events={hiddenEvents} />}
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
function HiddenEventsLabel({ events }: { events: HiddenEvent[] }) {
  const { timeFormat } = useSettings()
  const rows = events.length > MAX_TOOLTIP_ROWS ? events.slice(0, MAX_TOOLTIP_ROWS - 1) : events
  const rest = events.length - rows.length

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div className="text-xs text-muted-foreground px-0.5 truncate shrink-0 self-start hover:text-foreground">
          +{events.length} more
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64 flex-col items-stretch gap-1">
        {rows.map(({ event, calendarColor, allDay }) => (
          <HiddenEventRow
            key={eventKey(event)}
            event={event}
            calendarColor={calendarColor}
            allDay={allDay}
            timeFormat={timeFormat}
          />
        ))}
        {rest > 0 && <span className="text-2xs opacity-70">and {rest} more</span>}
      </TooltipContent>
    </Tooltip>
  )
}

function HiddenEventRow({
  event,
  calendarColor,
  allDay,
  timeFormat,
}: HiddenEvent & { timeFormat: TimeFormat }) {
  return (
    <div
      className="flex items-center gap-1.5 min-w-0"
      style={getCalendarEventStyle({ calendarColor, eventColor: event.color })}
    >
      <span className="size-2 shrink-0 rounded-full bg-(--calendar-event-color)" />
      <span data-typography="numerical" className="text-2xs shrink-0 opacity-70">
        {allDay ? "All day" : formatTime(event.start, timeFormat)}
      </span>
      <span className="truncate">{event.summary || <UntitledEventText />}</span>
    </div>
  )
}
