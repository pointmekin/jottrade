import { useMemo, useState } from 'react';
import { CalendarDayCell } from './CalendarDayCell';
import { DayTradesPopover } from './DayTradesPopover';
import type { CalendarDay } from '@/server/calendarActions';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarGridProps {
  year: number;
  month: number; // 1-12
  data: Record<string, CalendarDay>;
}

export function CalendarGrid({ year, month, data }: CalendarGridProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build grid: 6-week grid starting from Sunday before month start
  const days = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday

    const cells: { date: string; currentMonth: boolean }[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < 42; i++) {
      cells.push({
        date: cursor.toISOString().slice(0, 10),
        currentMonth: cursor.getMonth() === month - 1,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return cells;
  }, [year, month]);

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      {/* Day of week header */}
      <div className="grid grid-cols-7 border-b border-zinc-800">
        {DOW.map((d) => (
          <div key={d} className="py-2 text-center text-xs text-zinc-500 font-medium">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {days.map(({ date, currentMonth }) => {
          const day = data[date];
          const isSelected = selectedDate === date;

          if (day && day.tradeCount > 0) {
            return (
              <DayTradesPopover
                key={date}
                date={date}
                day={day}
                open={isSelected}
                onOpenChange={(open) => setSelectedDate(open ? date : null)}
                onTradeClick={() => setSelectedDate(null)}
              >
                <div>
                  <CalendarDayCell
                    date={date}
                    day={day}
                    isCurrentMonth={currentMonth}
                    onClick={setSelectedDate}
                  />
                </div>
              </DayTradesPopover>
            );
          }

          return (
            <CalendarDayCell
              key={date}
              date={date}
              day={undefined}
              isCurrentMonth={currentMonth}
              onClick={() => {}}
            />
          );
        })}
      </div>
    </div>
  );
}
