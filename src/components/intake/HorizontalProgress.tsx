"use client";

import { Check } from "lucide-react";
export type StepStatus = "complete" | "current" | "upcoming";

export interface Step {
  id: number;
  label: string;
  description?: string;
  status: StepStatus;
}

interface HorizontalProgressProps {
  steps: Step[];
}

export default function HorizontalProgress({ steps }: HorizontalProgressProps) {
  return (
     <div className="w-full z-50 ">
      <div className="max-w-7xl mx-auto  py-1">

        <div className="relative">

          {/* Base Line */}
          <div className="absolute top-[88px] left-0 w-full h-[6px] bg-gray-200 rounded-full" />

          <ol className="relative flex justify-between items-start">

            {steps.map((step, index) => {
              const isComplete = step.status === "complete";
              const isCurrent = step.status === "current";

              return (
                <li
                  key={step.id}
                  className="flex-1 flex flex-col items-center text-center relative"
                >
                  {/* STEP BADGE */}
                  <div className="relative mb-8 z-[10]">
                    <div
                      className={`px-4 py-1 text-sm font-semibold rounded-md shadow-md 
                        ${
                          isCurrent
                            ? "bg-[#C10007] text-white"
                            : "bg-gray-200 text-gray-800"
                        }
                      `}
                    >
                      Step {step.id.toString().padStart(2, "0")}
                    </div>

                    <div
                      className={`absolute left-1/2 -translate-x-1/2 top-[75%] w-3 h-3 rotate-45 z-[-1]
                        ${
                          isCurrent
                            ? "bg-[#C10007]"
                            : "bg-gray-200"
                        }
                      `}
                    />
                  </div>

                  {/* Active Line Fill */}
                  {isComplete && index !== steps.length - 1 && (
                    <div className="absolute top-[88px] left-1/2 w-full h-[6px] bg-[#C10007] rounded-full" />
                  )}

                  {/* Outer Ring */}
                  <div className="relative z-10 flex items-center justify-center">
                    <div
                      className={`flex items-center justify-center w-15 h-15 rounded-full border-[6px]
                        ${
                          isComplete || isCurrent
                            ? "border-[#C10007]"
                            : "border-gray-300"
                        }
                      `}
                    >
                      {/* Inner Circle */}
                      <div
                        className={`flex items-center justify-center w-12 h-12 rounded-full
                          ${
                            isComplete || isCurrent
                              ? "bg-[#C10007] text-white"
                              : "bg-white text-gray-600"
                          }
                        `}
                      >
                        {isComplete ? (
                          <Check size={28} />
                        ) : (
                          <span className="text-xl font-bold">
                            {step.id}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Text */}
                  {/* <div className="mt-8 max-w-[180px]">
                    <p className="text-base font-semibold text-gray-900">
                      {step.label}
                    </p>

                    {step.description && (
                      <p className="text-sm text-gray-500 mt-2">
                        {step.description}
                      </p>
                    )}
                  </div> */}
                </li>
              );
            })}
          </ol>
        </div>

      </div>
    </div>
  );
}