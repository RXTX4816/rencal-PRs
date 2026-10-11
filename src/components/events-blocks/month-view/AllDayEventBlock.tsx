import { useRef, useState, MouseEventHandler } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { allDayBarStyle } from "@/components/main/month-view/lane-geometry"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useEventDragHandle, useEventDragRole } from "@/contexts/EventDragContext"

import type { AllDayLaneItem } from "@/hooks/cal-events/all-day-lanes"
import type { ResponseStatus } from "@/lib/cal-events"
import { pointAnchorFromClick, setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { cn } from "@/lib/utils"

export function MonthAllDayEvent({
  item,
  highlighted: highlightedByParent,
  rsvp,
  isDraft,
  dimmed,
  inOverflow = false,
  onClick,
}: {
  item: AllDayLaneItem
  highlighted: boolean
  rsvp: ResponseStatus | null
  isDraft: boolean
  dimmed: boolean
  /** Listed in the "+n more" tooltip as a plain row, which unmounts on close: no drag or context menu. */
  inOverflow?: boolean
  onClick: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)

  const dragRole = useEventDragRole(item.event)
  const isDragPreview = dragRole === "preview"
  // Drafts and drag previews are stand-ins: no click, no context menu, no drag.
  const isStatic = isDraft || isDragPreview
  const onDragPointerDown = useEventDragHandle(item.event, { disabled: isStatic || inOverflow })

  const highlighted = highlightedByParent || contextOpen
  const fillsRow = item.endCol - item.startCol === 7

  const handleClick: MouseEventHandler<HTMLDivElement> | undefined = (e) => {
    if (!isStatic) {
      e.stopPropagation()
      setEventAnchor(fillsRow ? pointAnchorFromClick(e) : e.currentTarget)
      onClick()
    }
  }

  const inner = (
    <div
      ref={ref}
      data-slot="calendar-event"
      data-view="month"
      data-kind="all-day"
      data-selected={highlighted || undefined}
      data-rsvp={rsvp ?? undefined}
      data-draft={isDraft || undefined}
      data-dimmed={(!isStatic && dimmed) || undefined}
      data-drag-state={dragRole ?? undefined}
      data-event-clickable={!isStatic || undefined}
      className={cn(
        "truncate px-(--event-padding-inline) py-px text-xs cursor-default",
        inOverflow ? "shrink-0 rounded-xs" : "absolute",
        !inOverflow && item.isStart && "rounded-l-xs",
        !inOverflow && item.isEnd && "rounded-r-xs",
      )}
      style={{
        ...(!inOverflow && allDayBarStyle(item, item.lane)),
        ...getCalendarEventStyle({
          calendarColor: item.calendarColor,
          eventColor: item.event.color,
        }),
      }}
      onPointerDown={onDragPointerDown}
      onClick={handleClick}
    >
      <span data-slot="calendar-event-title">{item.event.summary || <UntitledEventText />}</span>
    </div>
  )

  if (isStatic || inOverflow) return inner

  return (
    <EventContextMenu event={item.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}
