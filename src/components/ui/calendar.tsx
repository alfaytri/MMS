"use client"

import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const [pickerView, setPickerView] = React.useState<"days" | "months" | "years">("days")
  const [viewingDate, setViewingDate] = React.useState<Date>(
    () => (props as any).defaultMonth ?? (props as any).selected ?? new Date()
  )

  const viewingYear = viewingDate.getFullYear()
  const viewingMonth = viewingDate.getMonth()

  // Year grid: show 12 years centered on current
  const yearStart = viewingYear - 5
  const years = Array.from({ length: 12 }, (_, i) => yearStart + i)

  function handleMonthClick(monthIdx: number) {
    const d = new Date(viewingYear, monthIdx, 1)
    setViewingDate(d)
    setPickerView("days")
  }

  function handleYearClick(year: number) {
    const d = new Date(year, viewingMonth, 1)
    setViewingDate(d)
    setPickerView("months")
  }

  const pickerShell = "p-3 w-[276px]";

  if (pickerView === "years") {
    return (
      <div className={cn(pickerShell, className)}>
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewingDate(new Date(viewingYear - 12, viewingMonth, 1))}
            className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0 opacity-50 hover:opacity-100")}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">
            {yearStart} – {yearStart + 11}
          </span>
          <button
            type="button"
            onClick={() => setViewingDate(new Date(viewingYear + 12, viewingMonth, 1))}
            className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0 opacity-50 hover:opacity-100")}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => handleYearClick(y)}
              className={cn(
                "h-9 rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                y === new Date().getFullYear() && "bg-accent text-accent-foreground font-medium",
                y === viewingYear && "bg-primary text-primary-foreground font-medium",
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (pickerView === "months") {
    return (
      <div className={cn(pickerShell, className)}>
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewingDate(new Date(viewingYear - 1, viewingMonth, 1))}
            className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0 opacity-50 hover:opacity-100")}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPickerView("years")}
            className="text-sm font-medium hover:underline cursor-pointer"
          >
            {viewingYear}
          </button>
          <button
            type="button"
            onClick={() => setViewingDate(new Date(viewingYear + 1, viewingMonth, 1))}
            className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0 opacity-50 hover:opacity-100")}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MONTHS.map((m, idx) => (
            <button
              key={m}
              type="button"
              onClick={() => handleMonthClick(idx)}
              className={cn(
                "h-9 rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                idx === new Date().getMonth() && viewingYear === new Date().getFullYear() && "bg-accent text-accent-foreground font-medium",
                idx === viewingMonth && "bg-primary text-primary-foreground font-medium",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      month={viewingDate}
      onMonthChange={setViewingDate}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-medium cursor-pointer hover:underline",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-1 top-0 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-1 top-0 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-accent",
          "[&:has([aria-selected].day-outside)]:bg-accent/50",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        range_end: "day-range-end",
        range_start: "day-range-start",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside:
          "day-outside text-muted-foreground aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon className="h-4 w-4" {...chevronProps} />
          }
          return <ChevronRightIcon className="h-4 w-4" {...chevronProps} />
        },
        CaptionLabel: ({ children }) => (
          <button
            type="button"
            onClick={() => setPickerView("months")}
            className="text-sm font-medium hover:underline cursor-pointer"
          >
            {children}
          </button>
        ),
      }}
      {...props}
    />
  )
}

export { Calendar }
