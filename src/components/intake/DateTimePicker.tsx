import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DateTimePickerProps {
  onChange?: (date: Date | null, time: string | null) => void;
}

const DateTimePicker = ({ onChange }: DateTimePickerProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const getDaysInMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

  const getFirstDayOfMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const handlePrevMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  const handleNextMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    onChange?.(date, selectedTime);
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    onChange?.(selectedDate, time);
  };

  return (
    <div className="flex-1 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold text-gray-900">
          Select a Date & Time
        </h3>

        <div className="flex items-center gap-4 text-gray-600">
          {currentDate.toLocaleString("default", { month: "long" })}{" "}
          {currentDate.getFullYear()}

          <div className="flex gap-1">
            <ChevronLeft
              size={20}
              className="cursor-pointer"
              onClick={handlePrevMonth}
            />
            <ChevronRight
              size={20}
              className="cursor-pointer text-blue-600"
              onClick={handleNextMonth}
            />
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="grid grid-cols-7 gap-y-4 text-center">
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
          <div key={d} className="text-xs font-bold text-gray-400">
            {d}
          </div>
        ))}

        {Array.from({ length: getFirstDayOfMonth(currentDate) }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => {
          const day = i + 1;
          const date = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            day
          );

          const isSelected =
            selectedDate &&
            date.toDateString() === selectedDate.toDateString();

          return (
            <div
              key={day}
              onClick={() => handleDateSelect(date)}
              className={`py-2 rounded-full cursor-pointer transition
                ${
                  isSelected
                    ? "bg-[#E65C61] text-white"
                    : "hover:bg-[#E65C61] text-gray-900"
                }`}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Time Selection */}
      {selectedDate && (
        <div className="mt-8">
          <h4 className="font-semibold mb-4 text-gray-800">
            Select Time
          </h4>

          <div className="grid grid-cols-3 gap-3">
            {[
              "09:00 AM",
              "10:00 AM",
              "11:00 AM",
              "02:00 PM",
              "03:00 PM",
              "04:00 PM",
            ].map((time) => (
              <div
                key={time}
                onClick={() => handleTimeSelect(time)}
                className={`p-2 text-center rounded-sm border cursor-pointer transition
                  ${
                    selectedTime === time
                      ? "bg-[#C10007] text-white border-none"
                      : "hover:bg-[#FFE5E6]"
                  }`}
              >
                {time}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DateTimePicker;