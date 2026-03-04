"use client";

import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface NominatimResult {
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
}

interface SelectedAddress {
  street: string;
  city: string;
  postalCode: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (data: SelectedAddress) => void;
  onBlur?: () => void;
  hasError?: boolean;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onBlur,
  hasError,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: `${value}, Ontario, Canada`,
          format: "json",
          addressdetails: "1",
          countrycodes: "ca",
          limit: "7",
        });

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { "Accept-Language": "en-CA" } }
        );
        const data: NominatimResult[] = await res.json();

        const filtered = data.filter(
          (d) =>
            d.address.state === "Ontario" &&
            d.address.country_code === "ca" &&
            d.address.road
        );

        setSuggestions(filtered);
        setOpen(filtered.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [value]);

  const handleSelect = (result: NominatimResult) => {
    const { house_number, road, city, town, village, municipality, postcode } =
      result.address;
    const street = [house_number, road].filter(Boolean).join(" ");
    const resolvedCity = city || town || village || municipality || "";
    const postalCode = postcode || "";

    onChange(street);
    onSelect({ street, city: resolvedCity, postalCode });
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading ? (
            <Loader2 size={15} className="text-gray-400 animate-spin" />
          ) : (
            <MapPin size={15} className="text-gray-400" />
          )}
        </div>

        <input
          type="text"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="123 Main Street"
          className={[
            "w-full pl-9 pr-4 py-2.5 rounded-sm border text-sm transition-colors duration-150",
            "bg-white text-gray-900 placeholder:text-gray-400",
            hasError
              ? "border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
              : "border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#C10007]",
          ].join(" ")}
        />
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {suggestions.map((s, i) => {
            const { house_number, road, city, town, village, municipality, postcode } = s.address;
            const streetLine = [house_number, road].filter(Boolean).join(" ");
            const cityLine = city || town || village || municipality || "";

            return (
              <li
                key={i}
                onMouseDown={() => handleSelect(s)}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 border-b last:border-0 border-gray-100 transition-colors"
              >
                <MapPin size={14} className="text-[#C10007] mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{streetLine}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[cityLine, "ON", postcode].filter(Boolean).join(", ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
