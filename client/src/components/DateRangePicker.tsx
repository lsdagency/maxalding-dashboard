import { useState } from "react";
import { format, subDays, startOfWeek, endOfWeek } from "date-fns";
import { CalendarIcon, ChevronDown, Loader2 } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DateRangeValue {
  dateStart: string;
  dateEnd: string;
  label: string;
}

interface Props {
  onApply: (range: DateRangeValue) => void;
  loading?: boolean;
}

function toYMD(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

const PRESETS = [
  {
    label: "Past 7 days",
    getRange: () => {
      const end = subDays(new Date(), 1);
      return { dateStart: toYMD(subDays(end, 6)), dateEnd: toYMD(end) };
    },
  },
  {
    label: "Mon – Sun (last week)",
    getRange: () => {
      const lastSunday = endOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 });
      const lastMonday = startOfWeek(lastSunday, { weekStartsOn: 1 });
      return { dateStart: toYMD(lastMonday), dateEnd: toYMD(lastSunday) };
    },
  },
  {
    label: "Past 14 days",
    getRange: () => {
      const end = subDays(new Date(), 1);
      return { dateStart: toYMD(subDays(end, 13)), dateEnd: toYMD(end) };
    },
  },
  {
    label: "Past 30 days",
    getRange: () => {
      const end = subDays(new Date(), 1);
      return { dateStart: toYMD(subDays(end, 29)), dateEnd: toYMD(end) };
    },
  },
];

export function DateRangePicker({ onApply, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [activeLabel, setActiveLabel] = useState("Mon – Sun (last week)");

  function handlePreset(preset: (typeof PRESETS)[number]) {
    const range = preset.getRange();
    setActiveLabel(preset.label);
    setCustomRange(undefined);
    setOpen(false);
    onApply({ ...range, label: preset.label });
  }

  function handleCustomApply() {
    if (!customRange?.from || !customRange?.to) return;
    const label = `${format(customRange.from, "d MMM")} – ${format(customRange.to, "d MMM")}`;
    setActiveLabel(label);
    setOpen(false);
    onApply({
      dateStart: toYMD(customRange.from),
      dateEnd: toYMD(customRange.to),
      label,
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={loading}
          className="border-border text-foreground hover:bg-accent gap-2"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <CalendarIcon className="h-4 w-4" />
          }
          {activeLabel}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-card border-border" align="end">
        <div className="flex">
          {/* Preset list */}
          <div className="flex flex-col border-r border-border p-2 gap-1 min-w-[160px]">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                className={`text-left text-sm px-3 py-2 rounded-md transition-colors ${
                  activeLabel === preset.label && !customRange
                    ? "bg-white text-black font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {preset.label}
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              <p className="text-xs text-muted-foreground px-3 py-1">Custom range</p>
            </div>
          </div>

          {/* Calendar */}
          <div className="p-2">
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={setCustomRange}
              numberOfMonths={1}
              disabled={{ after: subDays(new Date(), 1) }}
            />
            <div className="flex justify-end px-2 pb-2">
              <Button
                size="sm"
                onClick={handleCustomApply}
                disabled={!customRange?.from || !customRange?.to}
                className="bg-white text-black hover:bg-white/90 text-xs h-7"
              >
                Apply custom range
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
