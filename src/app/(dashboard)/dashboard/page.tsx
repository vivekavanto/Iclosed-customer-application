"use client";

import { useState, useEffect } from "react";
import {
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  CheckCircle2,
  Building2,
  Clock,
  AlertTriangle,
  ChevronRight,
  Loader2,
} from "lucide-react";


interface Task {
  id: string;
  title: string;
  status: "Pending" | "In Progress" | "Completed";
  due_date: string | null;
  completed: boolean;
  assignee: string | null;
  document_name: string | null;
  document_url: string | null;
}

const statusConfig = {
  "In Progress": { label: "In Progress", bg: "bg-[#FEF2F2]", text: "text-[#C10007]", border: "border-[#fca5a5]" },
  "Pending": { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  "Completed": { label: "Completed", bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200" },
};

/* ════════════════════════════════════════════════════
   ATTENTION CARD
════════════════════════════════════════════════════ */

function AttentionCard({
  tasks,
  loading,
  onMarkDone,
}: {
  tasks: Task[];
  loading: boolean;
  onMarkDone: (id: string) => void;
}) {
  const pending = tasks.filter((t) => !t.completed);
  const allDone = !loading && tasks.length > 0 && pending.length === 0;
  const isEmpty = !loading && tasks.length === 0;



  return (
    <div
      className={`rounded-2xl border overflow-hidden shadow-sm transition-all duration-300 ${allDone ? "bg-[#f0fdf4] border-[#bbf7d0]" : "bg-white border-gray-100"
        }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-5 sm:px-6 py-4 border-b ${allDone ? "border-[#bbf7d0]" : "border-gray-100"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${allDone ? "bg-[#dcfce7]" : "bg-[#FEF2F2]"}`}>
            {allDone
              ? <CheckCircle2 size={17} className="text-[#22c55e]" strokeWidth={2.2} />
              : <AlertTriangle size={17} className="text-[#C10007]" strokeWidth={2} />}
          </div>
          <div>
            <h2 className={`text-sm font-bold ${allDone ? "text-[#15803d]" : "text-gray-900"}`}>
              Needs Your Attention
            </h2>
            <p className={`text-xs ${allDone ? "text-[#4ade80]" : "text-gray-400"}`}>
              {loading
                ? "Loading tasks..."
                : allDone
                  ? "No pending tasks require your attention."
                  : isEmpty
                    ? "No tasks assigned yet."
                    : `${pending.length} task${pending.length > 1 ? "s" : ""} require${pending.length === 1 ? "s" : ""} your attention`}
            </p>
          </div>
        </div>
        {!loading && !allDone && !isEmpty && (
          <span className="flex-shrink-0 text-xs font-bold text-[#C10007] bg-[#FEF2F2] border border-[#fca5a5] px-2.5 py-1 rounded-full">
            {pending.length} pending
          </span>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="text-gray-300 animate-spin" />
        </div>
      ) : allDone ? (
        <div className="flex flex-col items-center justify-center py-8 px-6 gap-2">
          <div className="w-12 h-12 rounded-full bg-[#dcfce7] flex items-center justify-center mb-1">
            <CheckCircle2 size={24} className="text-[#22c55e]" strokeWidth={2} />
          </div>
          <p className="text-sm font-bold text-[#15803d]">All tasks completed!</p>
          <p className="text-xs text-[#86efac] text-center">
            Great job! Your lawyer will assign new tasks when needed.
          </p>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 px-6 gap-2">
          <p className="text-sm text-gray-400">No tasks have been assigned yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {tasks.map((task) => {
            const s = statusConfig[task.status] ?? statusConfig["Pending"];
            const formattedDate = task.due_date
              ? new Date(task.due_date).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
              : null;

            return (
              <div
                key={task.id}
                className={`flex items-start gap-4 px-5 sm:px-6 py-4 transition-colors duration-200 ${task.completed ? "opacity-40" : "hover:bg-gray-50/60"
                  }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => !task.completed && onMarkDone(task.id)}
                  className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 cursor-pointer ${task.completed
                    ? "bg-[#22c55e] border-[#22c55e]"
                    : "border-gray-300 hover:border-[#C10007]"
                    }`}
                >
                  {task.completed && <CheckCircle2 size={12} className="text-white" strokeWidth={3} />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <p className={`text-sm font-semibold leading-snug ${task.completed ? "line-through text-gray-400" : "text-gray-900"}`}>
                      {task.title}
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                      {s.label}
                    </span>
                  </div>
                  {formattedDate && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-1">
                      <Clock size={11} strokeWidth={2} />
                      <span>Due {formattedDate}</span>
                    </div>
                  )}
                </div>

                {/* Arrow */}
                {!task.completed && (
                  <div className="flex-shrink-0 mt-1 w-7 h-7 rounded-lg bg-gray-50 hover:bg-[#FEF2F2] flex items-center justify-center transition-colors duration-200 group cursor-pointer">
                    <ChevronRight size={13} className="text-gray-400 group-hover:text-[#C10007]" strokeWidth={2.5} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


const statusSteps = [
  {
    id: 1,
    label: "Agreement of Purchase and Sale",
    date: "August 18, 2025",
    done: true,
    active: false,
  },
  {
    id: 2,
    label: "Initial Call",
    date: "August 18, 2025",
    done: true,
    active: true,
  },
  {
    id: 3,
    label: "Title Search",
    date: "August 18, 2025",
    done: false,
    active: false,
  },
  {
    id: 4,
    label: "Financing Firm → Mortgage Instructions",
    date: null,
    done: false,
    active: false,
  },
  {
    id: 5,
    label: "Aligned with Seller → Closing Date Coordination",
    date: null,
    done: false,
    active: false,
  },
  {
    id: 6,
    label: "Financial Info Confirmed → Mortgage Details Confirmed",
    date: null,
    done: false,
    active: false,
  },
  { id: 7, label: "Documents Signed", date: null, done: false, active: false },
];

/* ════════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════════ */

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const [property, setProperty] = useState<any>(null);
  const [propertyLoading, setPropertyLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        /* ─────────── Fetch Tasks ─────────── */
        const tasksRes = await fetch("/api/tasks");
        const tasksData = await tasksRes.json();

        console.log("[tasks]", tasksData);

        if (tasksData.success) {
          setTasks(tasksData.tasks);
        }

        /* ─────────── Fetch Property From API (Using supabaseAdmin) ─────────── */
        const propertyRes = await fetch("/api/dashboardproperty");
        const propertyData = await propertyRes.json();

        console.log("[property]", propertyData);

        if (propertyData.success) {
          setProperty(propertyData.property);
        } else {
          console.error("Property fetch error:", propertyData.error);
        }

      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setTasksLoading(false);
        setPropertyLoading(false);
      }
    };

    fetchData();
  }, []);

  async function markDone(id: string) {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: true, status: "Completed" as const } : t))
    );
    try {
      await fetch(`/api/tasks/${id}`, { method: "PATCH" });
    } catch {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: false, status: "In Progress" as const } : t))
      );
    }
  }

  const activeStep = statusSteps.find((s) => s.active);
  const activeIndex = activeStep ? statusSteps.indexOf(activeStep) : 0;
  const progressPercent = Math.round((activeIndex / (statusSteps.length - 1)) * 100);

  return (
    <div className="space-y-5 pb-8">

      {/* ── 1. Needs Your Attention ── */}
      <AttentionCard tasks={tasks} loading={tasksLoading} onMarkDone={markDone} />

      {/* ── 2. Property Selector Tabs ── */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {propertyLoading ? (
          <div className="px-4 py-2 text-sm text-gray-400">
            Loading property...
          </div>
        ) : property ? (
          <button
            type="button"
            className="cursor-pointer flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold 
      bg-[#C10007] text-white shadow-md"
          >
            <Building2 size={16} strokeWidth={2} />
            <span className="whitespace-nowrap">
              {property?.address_street || "Address not available"}
            </span>
          </button>
        ) : (
          <div className="px-4 py-2 text-sm text-gray-400">
            No property available
          </div>
        )}
      </div>

      {/* ── 3. Property Hero Card ── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-gray-100 px-6 py-5 flex items-start gap-4">

          {/* Icon Circle */}
          <div className="w-10 h-10 rounded-full bg-[#C10007] flex items-center justify-center flex-shrink-0">
            <MapPin size={18} className="text-white" strokeWidth={2} />
          </div>

          <div>
            <p className="text-[14px] font-bold uppercase text-[#C10007] mb-1">
              Property Address
            </p>

            {propertyLoading ? (
              <p className="text-sm text-gray-400">Loading address...</p>
            ) : property ? (
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">
                {[property?.address_street, property?.address_city, property?.address_province]
                  .filter(Boolean)
                  .join(", ")}
              </h1>
            ) : (
              <p className="text-sm text-gray-400">No property found</p>
            )}
          </div>
        </div>

        {/* Info chips row */}
        <div className="grid grid-cols-2 divide-x divide-gray-100 border-t border-gray-100">
          <div className="flex items-center gap-3 px-5 sm:px-6 py-4">
            <div className="w-9 h-9 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
              <Calendar size={15} className="text-[#C10007]" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                Closing Date
              </p>
              <p className="text-sm font-bold text-gray-900">
                TBD
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-5 sm:px-6 py-4">
            <div className="w-9 h-9 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
              <User size={15} className="text-[#C10007]" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                Closing Manager
              </p>
              <p className="text-sm font-bold text-gray-900">
                Assigned Soon
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Bottom Grid: Timeline + Assistance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-5 items-start">

        {/* ── Status Timeline ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm">
          {/* Header row */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-gray-900">Status Overview</h2>
            <span className="text-xs font-semibold text-[#C10007] bg-[#FEF2F2] px-2.5 py-1 rounded-full">
              Step {activeIndex + 1} of {statusSteps.length}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-gray-100 rounded-full mb-6 overflow-hidden">
            <div
              className="h-full bg-[#C10007] rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Steps */}
          <div className="relative">
            {/* Vertical connector — left = px-3(12px) + half node(15px) = 27px */}
            <div className="absolute left-[27px] top-4 bottom-4 w-px bg-gray-100" />

            <div className="space-y-0.5">
              {statusSteps.map((step) => {
                const isActive = step.active;
                const isPast = step.done && !step.active;

                return (
                  <div
                    key={step.id}
                    className={`relative flex items-start gap-4 px-3 py-3 rounded-xl transition-all duration-200 ${isActive ? "bg-[#FEF2F2]" : "hover:bg-gray-50/70"
                      }`}
                  >
                    {/* Node */}
                    <div className="z-10 flex-shrink-0 mt-0.5">
                      {isActive ? (
                        <div className="w-[30px] h-[30px] rounded-full bg-[#C10007] flex items-center justify-center ring-4 ring-[rgba(193,0,7,0.12)]">
                          <CheckCircle2
                            size={15}
                            className="text-white"
                            strokeWidth={2.5}
                          />
                        </div>
                      ) : isPast ? (
                        <div className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center">
                          <CheckCircle2
                            size={15}
                            className="text-gray-400"
                            strokeWidth={2}
                          />
                        </div>
                      ) : (
                        <div className="w-[30px] h-[30px] rounded-full border-2 border-gray-200 bg-white" />
                      )}
                    </div>

                    {/* Label + date */}
                    <div className="flex-1 pt-0.5 min-w-0">
                      <p
                        className={`text-sm font-semibold leading-snug ${isActive
                          ? "text-[#C10007]"
                          : isPast
                            ? "text-gray-400"
                            : "text-gray-700"
                          }`}
                      >
                        {step.label}
                      </p>
                      {step.date && (
                        <p
                          className={`text-xs mt-0.5 ${isActive ? "text-[#C10007]/70" : "text-gray-400"
                            }`}
                        >
                          {step.date}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Need Assistance ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          {/* Icon + heading */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C10007"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.5 10.5a19.79 19.79 0 0 1-3-8.57A2 2 0 0 1 3.47 0h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 7.91a16 16 0 0 0 6 6l.72-.72a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Need Assistance?</h3>
            </div>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed mb-5">
            Our team is here to help you through every step of your closing process.
          </p>

          <div className="space-y-2.5">
            {/* Call */}
            <a
              href="tel:416-321-1100"
              className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 bg-gray-50 hover:bg-[#FEF2F2] hover:border-[#fca5a5] transition-all duration-200 group"
            >
              <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 group-hover:border-[#fca5a5] transition-colors">
                <Phone size={14} className="text-[#C10007]" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                  Call us
                </p>
                <p className="text-sm font-bold text-gray-900">416-321-1100</p>
              </div>
            </a>

            {/* Email */}
            <a
              href="mailto:iclosed@navawilson.law"
              className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 bg-gray-50 hover:bg-[#FEF2F2] hover:border-[#fca5a5] transition-all duration-200 group"
            >
              <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 group-hover:border-[#fca5a5] transition-colors">
                <Mail size={14} className="text-[#C10007]" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                  Email us
                </p>
                <p className="text-xs font-bold text-gray-900 break-all">
                  iclosed@navawilson.law
                </p>
              </div>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
