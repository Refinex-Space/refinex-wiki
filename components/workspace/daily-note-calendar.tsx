import * as React from 'react';
import type { DayButton } from 'react-day-picker';
import { zhCN } from 'date-fns/locale';

import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

import {
  createDateFromDailyDate,
  formatDailyDate,
} from './daily-notes';

interface DailyNoteCalendarProps {
  contentDates: Set<string>;
  isLoading?: boolean;
  month: Date;
  selectedDate: string;
  onMonthChange: (month: Date) => void;
  onSelectDate: (date: string) => void;
}

export function DailyNoteCalendar({
  contentDates,
  isLoading = false,
  month,
  selectedDate,
  onMonthChange,
  onSelectDate,
}: DailyNoteCalendarProps) {
  const selected = React.useMemo(
    () => createDateFromDailyDate(selectedDate),
    [selectedDate],
  );

  return (
    <section
      aria-label="每日笔记日历"
      className="shrink-0 border-t border-sidebar-border/50 px-2.5 py-2"
      data-testid="daily-note-calendar"
    >
      <Calendar
        buttonVariant="ghost"
        className={cn(
          'w-full bg-transparent p-0 [--cell-size:28px]',
          isLoading ? 'opacity-75' : null,
        )}
        classNames={{
          month: 'flex w-full flex-col gap-2',
          month_caption:
            'flex h-7 w-full items-center justify-center px-(--cell-size)',
          weekdays: 'flex text-[11px]',
          weekday:
            'flex-1 rounded-(--cell-radius) text-[11px] font-normal text-muted-foreground select-none',
          week: 'mt-1.5 flex w-full gap-1',
          day: 'group/day relative flex flex-1 justify-center p-0 text-center select-none',
        }}
        components={{
          DayButton: (props) => (
            <DailyNoteDayButton
              {...props}
              contentDates={contentDates}
            />
          ),
        }}
        locale={zhCN}
        mode="single"
        month={month}
        selected={selected}
        showOutsideDays={false}
        onMonthChange={onMonthChange}
        onDayClick={(date) => onSelectDate(formatDailyDate(date))}
      />
    </section>
  );
}

function DailyNoteDayButton({
  contentDates,
  ...props
}: React.ComponentProps<typeof DayButton> & {
  contentDates: Set<string>;
}) {
  const date = formatDailyDate(props.day.date);
  const hasContent = contentDates.has(date);
  const isSelected = props.modifiers.selected;

  return (
    <CalendarDayButton
      {...props}
      aria-label={`${date} 每日笔记`}
      className={cn(
        'mx-auto size-7 min-w-7 gap-0.5 rounded-lg text-xs text-sidebar-foreground transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'data-[selected-single=true]:bg-primary/10 data-[selected-single=true]:text-primary',
        'data-[selected-single=true]:hover:bg-primary/15 dark:data-[selected-single=true]:bg-primary/20',
        hasContent ? 'font-medium' : null,
      )}
      data-testid={`daily-note-day-${date}`}
    >
      {props.children}
      {hasContent ? (
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-1 rounded-full',
            isSelected ? 'bg-primary' : 'bg-primary/80',
          )}
          data-testid={`daily-note-marker-${date}`}
        />
      ) : (
        <span aria-hidden="true" className="mt-0.5 size-1 opacity-0" />
      )}
    </CalendarDayButton>
  );
}
