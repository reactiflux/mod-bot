import {
  addDays,
  addMonths,
  addYears,
  endOfQuarter,
  endOfYear,
  format,
  startOfQuarter,
  startOfYear,
  subDays,
} from "date-fns";
import { useState, type LabelHTMLAttributes } from "react";

const Label = (props: LabelHTMLAttributes<Element>) => (
  <label {...props} className={`${props.className ?? ""} m-4`}>
    {props.children}
  </label>
);

const DATE_FORMAT = "yyyy-MM-dd";
const DISPLAY_FORMAT = "MMM d, yyyy";

export type PresetKey = "30d" | "quarter" | "half" | "year" | "custom";

const presets: { key: PresetKey; label: string }[] = [
  { key: "30d", label: "30 days" },
  { key: "quarter", label: "Quarter" },
  { key: "half", label: "6 months" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

// Get start of the half-year (H1: Jan-Jun, H2: Jul-Dec)
function startOfHalf(date: Date): Date {
  const month = date.getMonth();
  const year = date.getFullYear();
  return month < 6 ? new Date(year, 0, 1) : new Date(year, 6, 1);
}

function endOfHalf(date: Date): Date {
  const month = date.getMonth();
  const year = date.getFullYear();
  return month < 6 ? new Date(year, 5, 30) : new Date(year, 11, 31);
}

function shiftDatesByInterval(
  start: Date,
  _end: Date,
  interval: Exclude<PresetKey, "custom">,
  direction: "back" | "forward",
): { start: string; end: string } {
  const shift = direction === "back" ? -1 : 1;

  switch (interval) {
    case "30d":
      return {
        start: format(addDays(start, shift * 30), DATE_FORMAT),
        end: format(addDays(start, shift * 30 + 29), DATE_FORMAT),
      };
    case "quarter": {
      const newStart = startOfQuarter(addMonths(start, shift * 3));
      return {
        start: format(newStart, DATE_FORMAT),
        end: format(endOfQuarter(newStart), DATE_FORMAT),
      };
    }
    case "half": {
      const newStart = startOfHalf(addMonths(start, shift * 6));
      return {
        start: format(newStart, DATE_FORMAT),
        end: format(endOfHalf(newStart), DATE_FORMAT),
      };
    }
    case "year": {
      const newStart = startOfYear(addYears(start, shift));
      return {
        start: format(newStart, DATE_FORMAT),
        end: format(endOfYear(newStart), DATE_FORMAT),
      };
    }
  }
}

function getPresetDates(key: Exclude<PresetKey, "custom">): {
  start: string;
  end: string;
} {
  const today = new Date();

  switch (key) {
    case "30d":
      return {
        start: format(subDays(today, 30), DATE_FORMAT),
        end: format(today, DATE_FORMAT),
      };
    case "quarter":
      return {
        start: format(startOfQuarter(today), DATE_FORMAT),
        end: format(endOfQuarter(today), DATE_FORMAT),
      };
    case "half":
      return {
        start: format(startOfHalf(today), DATE_FORMAT),
        end: format(endOfHalf(today), DATE_FORMAT),
      };
    case "year":
      return {
        start: format(startOfYear(today), DATE_FORMAT),
        end: format(endOfYear(today), DATE_FORMAT),
      };
  }
}

function navigateTo(start: string, end: string, interval?: PresetKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  if (interval) {
    url.searchParams.set("interval", interval);
  } else {
    url.searchParams.delete("interval");
  }
  window.location.href = url.toString();
}

export function RangeForm({
  values,
  interval: currentInterval,
}: {
  values: { start?: string; end?: string };
  interval?: PresetKey;
}) {
  const [showCustom, setShowCustom] = useState(currentInterval === "custom");
  const [selectedInterval, setSelectedInterval] = useState<PresetKey>(
    currentInterval ?? "30d",
  );

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value as PresetKey;
    setSelectedInterval(key);
    if (key === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const { start, end } = getPresetDates(key);
    navigateTo(start, end, key);
  };

  const handleNav = (direction: "back" | "forward") => {
    if (!values.start || !values.end || selectedInterval === "custom") return;
    const { start, end } = shiftDatesByInterval(
      new Date(values.start),
      new Date(values.end),
      selectedInterval,
      direction,
    );
    navigateTo(start, end, selectedInterval);
  };

  const rangeLabel =
    values.start && values.end
      ? `${format(new Date(values.start), DISPLAY_FORMAT)} – ${format(new Date(values.end), DISPLAY_FORMAT)}`
      : null;

  const canNavigate =
    values.start && values.end && selectedInterval !== "custom";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        <select
          onChange={handlePresetChange}
          value={selectedInterval}
          className="rounded border border-gray-300 px-3 py-1.5 text-gray-800"
        >
          {presets.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>

        {canNavigate && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNav("back")}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100"
              aria-label="Previous period"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => handleNav("forward")}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100"
              aria-label="Next period"
            >
              →
            </button>
          </div>
        )}
      </div>

      {rangeLabel && <div className="text-sm text-gray-600">{rangeLabel}</div>}

      {showCustom && (
        <form method="GET" className="flex items-end gap-2">
          <Label className="m-0">
            Start
            <input
              name="start"
              type="date"
              defaultValue={values.start}
              className="ml-2 rounded border border-gray-300 px-2 py-1 text-gray-800"
            />
          </Label>
          <Label className="m-0">
            End
            <input
              name="end"
              type="date"
              defaultValue={values.end}
              className="ml-2 rounded border border-gray-300 px-2 py-1 text-gray-800"
            />
          </Label>
          <input type="hidden" name="interval" value="custom" />
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-1.5 text-white hover:bg-blue-700"
          >
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
