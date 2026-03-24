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
import PersonalInformationDrawer from "@/components/dashboard/PersonalInformationDrawer";
import DynamicTaskDrawer from "@/components/dashboard/DynamicTaskDrawer";
import { useToast } from "@/components/ui/Toast";


interface Task {
  id: string;
  title: string;
  status: "Pending" | "In Progress" | "Completed";
  due_date: string | null;
  completed: boolean;
  assignee: string | null;
  document_name: string | null;
  document_url: string | null;
  milestone_id: string | null;
  milestones?: {
    id: string;
    title: string;
    order_index: number;
    status: string;
  } | null;
}

interface Milestone {
  id: string;
  title: string;
  status: string;
  milestone_date: string | null;
  order_index: number;
  completed_at: string | null;
  description: any | null;
  total_tasks: number;
  completed_tasks: number;
}

interface PropertyData {
  deal_id: string;
  address_street: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  address_unit: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  lead_type: string | null;
}

interface DealData {
  id: string;
  lead_id: string | null;
  file_number: string | null;
  type: string | null;
  status: string | null;
  closing_date: string | null;
  property_address: string | null;
  price: number | null;
}

/* ─────────────────────────────────────────────
   STATUS CONFIG
───────────────────────────────────────────── */
const statusConfig = {
  "In Progress": {
    label: "In Progress",
    bg: "bg-[#FEF2F2]",
    text: "text-[#C10007]",
    border: "border-[#fca5a5]",
  },
  Pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  Completed: {
    label: "Completed",
    bg: "bg-gray-50",
    text: "text-gray-500",
    border: "border-gray-200",
  },
};

/* ─────────────────────────────────────────────
   ATTENTION CARD
════════════════════════════════════════════════════ */


function AttentionCard({
  tasks,
  loading,
  onTaskClick,
}: {
  tasks: Task[];
  loading: boolean;
  onTaskClick: (task: Task) => void;
}) {
  // Only show incomplete tasks
  const pending = tasks.filter((t) => !t.completed);
  const allDone = !loading && tasks.length > 0 && pending.length === 0;
  const isEmpty = !loading && tasks.length === 0;

  return (
    <div
      className={`rounded-2xl border overflow-hidden shadow-sm transition-all duration-300 ${allDone ? "bg-[#f0fdf4] border-[#bbf7d0]" : "bg-white border-gray-100"}`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-5 sm:px-6 py-4 border-b ${allDone ? "border-[#bbf7d0]" : "border-gray-100"}`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${allDone ? "bg-[#dcfce7]" : "bg-[#FEF2F2]"}`}
          >
            {allDone ? (
              <CheckCircle2
                size={18}
                className="text-[#22c55e]"
                strokeWidth={2.2}
              />
            ) : (
              <AlertTriangle
                size={18}
                className="text-[#C10007]"
                strokeWidth={2}
              />
            )}
          </div>
          <div>
            <h2
              className={`text-lg font-bold ${allDone ? "text-[#15803d]" : "text-gray-900"}`}
            >
              Needs Your Attention
            </h2>
            <p
              className={`text-sm ${allDone ? "text-[#4ade80]" : "text-gray-400"}`}
            >
              {loading
                ? "Loading tasks..."
                : allDone
                  ? "All tasks completed!"
                  : isEmpty
                    ? "No tasks assigned yet."
                    : `${pending.length} task${pending.length > 1 ? "s" : ""} require${pending.length === 1 ? "s" : ""} your action`}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="text-gray-300 animate-spin" />
        </div>
      ) : allDone ? (
        <div className="flex flex-col items-center justify-center py-8 px-6 gap-2">
          <div className="w-12 h-12 rounded-full bg-[#dcfce7] flex items-center justify-center mb-1">
            <CheckCircle2
              size={24}
              className="text-[#22c55e]"
              strokeWidth={2}
            />
          </div>
          <p className="text-sm font-bold text-[#15803d]">
            All tasks completed!
          </p>
          <p className="text-xs text-[#86efac] text-center">
            Great job! Your lawyer will assign new tasks when needed.
          </p>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 px-6 gap-2">
          <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-1">
            <Clock size={22} className="text-gray-300" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-gray-500 font-medium">
            No tasks assigned yet
          </p>
          <p className="text-xs text-gray-400 text-center">
            Your lawyer will assign tasks once your file is active.
          </p>
        </div>
      ) : (
        <div className="p-2">
          {pending.map((task) => {
            const formattedDate = task.due_date
              ? new Date(task.due_date).toLocaleDateString("en-CA", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null;

            return (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="rounded-lg border border-gray-100 px-4 py-3 mb-1.5 last:mb-0 hover:border-[#C10007]/30 hover:bg-[#FEF2F2]/30 transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-[#C10007] transition-colors leading-snug">
                      {task.title}
                    </p>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400 mt-1">
                      <span className="flex items-center gap-1.5">
                        <Clock size={11} strokeWidth={2} />
                        {formattedDate ? `Due ${formattedDate}` : "No due date"}
                      </span>
                      {task.milestones && (
                        <span className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-gray-300" />
                          {task.milestones.title}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="flex-shrink-0 text-gray-300 group-hover:text-[#C10007]" strokeWidth={2.5} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   STATUS TIMELINE
───────────────────────────────────────────── */
function StatusTimeline({
  milestones,
  loading,
}: {
  milestones: Milestone[];
  loading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm flex items-center justify-center py-16">
        <Loader2 size={22} className="text-gray-300 animate-spin" />
      </div>
    );
  }

  if (milestones.length === 0) {
    return null;
  }

  // A milestone is "done" if status=Completed OR all its tasks are completed
  const isMilestoneDone = (m: Milestone) =>
    m.status === "Completed" || (m.total_tasks > 0 && m.completed_tasks === m.total_tasks);

  // Count completed milestones (starts at 0)
  const completedCount = milestones.filter(isMilestoneDone).length;

  // Progress bar: based on completed milestones out of total
  const progressPercent =
    milestones.length === 0
      ? 0
      : Math.min(100, Math.round((completedCount / milestones.length) * 100));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-gray-900">Status Overview</h2>
        <span className="text-xs font-semibold text-[#C10007] bg-[#FEF2F2] px-2.5 py-1 rounded-full">
          Step {completedCount}/{milestones.length}
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
        <div className="absolute left-[27px] top-4 bottom-4 w-px bg-gray-100" />
        <div className="space-y-0.5">
          {milestones.map((milestone) => {
            const isCompleted = milestone.status === "Completed";
            const isInProgress = milestone.status === "In Progress";
            const isWaiting = milestone.status === "Waiting";
            const isSelected = selectedId === milestone.id;
            const hasDescription = milestone.description;
            const formattedDate = milestone.milestone_date
              ? new Date(milestone.milestone_date).toLocaleDateString("en-CA", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null;

            // Extract description text from jsonb — use "modal" for the full description
            let descriptionText = "";
            if (milestone.description) {
              if (typeof milestone.description === "string") {
                descriptionText = milestone.description;
              } else if (typeof milestone.description === "object") {
                descriptionText = milestone.description.modal || milestone.description.short || "";
              }
            }

            return (
              <div
                key={milestone.id}
                className="relative"
                onMouseEnter={() => hasDescription && setSelectedId(milestone.id)}
                onMouseLeave={() => setSelectedId(null)}
              >
                <div
                  className={`flex items-start gap-4 px-3 py-3 rounded-xl transition-all duration-200 hover:bg-gray-50/70 ${hasDescription ? "cursor-pointer" : ""}`}
                >
                  {/* Node */}
                  <div className="z-10 flex-shrink-0 mt-0.5">
                    {isCompleted ? (
                      <div className="w-[30px] h-[30px] rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircle2
                          size={15}
                          className="text-white"
                          strokeWidth={2.5}
                        />
                      </div>
                    ) : isInProgress ? (
                      <div className="w-[30px] h-[30px] rounded-full bg-orange-400 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-white" />
                      </div>
                    ) : isWaiting ? (
                      <div className="w-[30px] h-[30px] rounded-full bg-blue-500" />
                    ) : (
                      <div className="w-[30px] h-[30px] rounded-full bg-gray-300" />
                    )}
                  </div>

                  {/* Label + meta */}
                  <div className="flex-1 pt-0.5 min-w-0">
                    <p
                      className={`text-sm font-semibold leading-snug ${isCompleted ? "text-gray-400" : "text-gray-700"}`}
                    >
                      {milestone.title}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {formattedDate && (
                        <p
                          className="text-xs text-gray-400"
                        >
                          {formattedDate}
                        </p>
                      )}
                      {milestone.total_tasks > 0 && (
                        <p className="text-xs text-gray-400">
                          {milestone.completed_tasks}/{milestone.total_tasks}{" "}
                          tasks
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Expand indicator */}
                  {hasDescription && (
                    <ChevronRight
                      size={14}
                      className={`flex-shrink-0 mt-1.5 text-gray-300 transition-transform duration-200 ${isSelected ? "rotate-90" : ""}`}
                      strokeWidth={2.5}
                    />
                  )}
                </div>

                {/* Hover description popover */}
                {isSelected && descriptionText && (
                  <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 w-[280px] sm:w-[340px] z-20 bg-white rounded-xl border border-gray-200 shadow-lg flex flex-col">
                    <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
                      <h4 className="text-sm font-bold text-gray-900">
                        {milestone.title}
                      </h4>
                      <p className={`text-xs mt-1 flex items-center gap-1.5 ${
                        isCompleted ? "text-green-500" : isInProgress ? "text-orange-500" : isWaiting ? "text-blue-500" : "text-gray-400"
                      }`}>
                        <span className={`w-2 h-2 rounded-full inline-block ${
                          isCompleted ? "bg-green-500" : isInProgress ? "bg-orange-400" : isWaiting ? "bg-blue-500" : "bg-gray-300"
                        }`} />
                        {isCompleted ? "Completed" : isInProgress ? "In Progress" : isWaiting ? "Waiting" : "Pending"}
                      </p>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                        {descriptionText}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PAGE
───────────────────────────────────────────── */
export default function DashboardPage() {
  // ── Multiple properties / deals (one tab per deal) ────────
  const [properties, setProperties] = useState<PropertyData[]>([]);
  const [deals, setDeals] = useState<DealData[]>([]);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(true);

  // ── Tasks + milestones for the active deal ────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);

  // ── Drawer state ──────────────────────────────────────────
  const [personalInfoDrawerOpen, setPersonalInfoDrawerOpen] = useState(false);
  const [dynamicDrawerOpen, setDynamicDrawerOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // ── Derived: active property + deal ──────────────────────
  const activeDeal = deals.find((d) => d.id === activeDealId) ?? null;
  const activeProperty = properties.find((p) => p.deal_id === activeDealId) ?? null;

  const leadId =
    activeDeal?.lead_id ??
    (typeof window !== "undefined" ? localStorage.getItem("iclosed_lead_id") : null);

  function handleTaskClick(task: Task) {
    setActiveTask(task);
    setDynamicDrawerOpen(true);
  }

  // ── On mount: fetch all properties + deals ────────────────
  useEffect(() => {
    const fetchData = async () => {
      const params = leadId ? `?lead_id=${leadId}` : "";
      try {
        const res = await fetch(`/api/dashboardproperty${params}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setProperties(data.properties ?? []);
            setDeals(data.deals ?? []);
            if (data.deals?.length > 0) {
              setActiveDealId(data.deals[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Property fetch error:", err);
      } finally {
        setPropertyLoading(false);
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── When active deal changes: reload tasks + milestones ───
  useEffect(() => {
    if (!activeDealId) return;
    const fetchDealData = async () => {
      setTasksLoading(true);
      setMilestonesLoading(true);
      setTasks([]);
      setMilestones([]);
      try {
        // Fetch milestones FIRST (auto-inserts default milestones)
        // Then tasks (needs milestones to exist for linking)
        const msRes = await fetch(`/api/milestones?deal_id=${activeDealId}`);
        if (msRes.ok) {
          const d = await msRes.json();
          if (d.success) setMilestones(d.milestones);
        }
        setMilestonesLoading(false);

        const tasksRes = await fetch(`/api/tasks?deal_id=${activeDealId}`);
        if (tasksRes.ok) {
          const d = await tasksRes.json();
          if (d.success) setTasks(d.tasks);
        }
      } catch (err) {
        console.error("Deal data fetch error:", err);
      } finally {
        setTasksLoading(false);
        setMilestonesLoading(false);
      }
    };
    fetchDealData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDealId]);

  // ── Toast ────────────────────────────────────────────────
  const { success: toastSuccess, error: toastError } = useToast();

  // ── Mark task done + refresh ──────────────────────────────
  async function markDone(id: string) {
    const taskTitle = tasks.find((t) => t.id === id)?.title ?? "Task";
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, completed: true, status: "Completed" as const } : t),
    );
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed");
      toastSuccess(`"${taskTitle}" completed successfully!`);
      if (activeDealId) {
        const [msRes, tasksRes] = await Promise.all([
          fetch(`/api/milestones?deal_id=${activeDealId}`),
          fetch(`/api/tasks?deal_id=${activeDealId}`),
        ]);
        if (msRes.ok) { const d = await msRes.json(); if (d.success) setMilestones(d.milestones); }
        if (tasksRes.ok) { const d = await tasksRes.json(); if (d.success) setTasks(d.tasks); }
      }
    } catch {
      toastError(`Failed to complete "${taskTitle}". Please try again.`);
      setTasks((prev) =>
        prev.map((t) => t.id === id ? { ...t, completed: false, status: "In Progress" as const } : t),
      );
    }
  }

  const fullAddress = [
    activeProperty?.address_street,
    activeProperty?.address_city,
    activeProperty?.address_province,
  ]
    .filter(Boolean)
    .join(", ");

  const closingFormatted = activeDeal?.closing_date
    ? new Date(activeDeal.closing_date).toLocaleDateString("en-CA", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "TBD";

  return (
    <div className="space-y-5 pb-8">

      {/* ── Personal Information Drawer ── */}
      <PersonalInformationDrawer
        open={personalInfoDrawerOpen}
        onClose={() => setPersonalInfoDrawerOpen(false)}
        property={activeProperty}
        taskId={activeTask?.id}
        onSaved={async () => {
          setPersonalInfoDrawerOpen(false);
          if (activeTask) await markDone(activeTask.id);
        }}
      />

      {/* ── Dynamic Task Drawer (DB-driven form fields) ── */}
      <DynamicTaskDrawer
        open={dynamicDrawerOpen}
        onClose={() => setDynamicDrawerOpen(false)}
        taskId={activeTask?.id ?? null}
        taskTitle={activeTask?.title ?? "Task Details"}
        leadId={leadId ?? undefined}
        onTaskCompleted={(id) => {
          setDynamicDrawerOpen(false);
          markDone(id);
        }}
      />

      {/* ── 1. Property Selector Tabs (one per deal) ── */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
        {propertyLoading ? (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Loading properties...
          </div>
        ) : properties.length === 0 ? (
          <div className="px-4 py-2 text-sm text-gray-400">No properties yet</div>
        ) : (
          properties.map((p, i) => {
            const isActive = p.deal_id === activeDealId;
            return (
              <button
                key={p.deal_id}
                type="button"
                onClick={() => setActiveDealId(p.deal_id)}
                className={[
                  "cursor-pointer flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "bg-[#C10007] text-white shadow-md"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-[#C10007] hover:text-[#C10007]",
                ].join(" ")}
              >
                <Building2 size={15} strokeWidth={2} />
                <span className="whitespace-nowrap">
                  {p.address_street || `Property ${i + 1}`}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* ── 2. Property Hero Card ── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-gray-100 px-6 py-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-[#C10007] flex items-center justify-center flex-shrink-0">
            <MapPin size={18} className="text-white" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[14px] font-bold uppercase text-[#C10007] mb-1">
              {activeDeal?.type
                ? `${activeDeal.type} · Property Address`
                : "Property Address"}
            </p>
            {propertyLoading ? (
              <p className="text-sm text-gray-400">Loading address...</p>
            ) : activeProperty ? (
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">
                {fullAddress || "Address not provided"}
              </h1>
            ) : (
              <p className="text-sm text-gray-400">
                No property found — your file may still be pending.
              </p>
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
                {propertyLoading ? "..." : closingFormatted}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-5 sm:px-6 py-4">
            <div className="w-9 h-9 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
              <User size={15} className="text-[#C10007]" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                File Number
              </p>
              <p className="text-sm font-bold text-gray-900">
                {propertyLoading ? "..." : (activeDeal?.file_number ?? "Pending")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Main Grid: Tasks (left) + Status & Assistance (right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ── Left: Needs Your Attention ── */}
        <AttentionCard
          tasks={tasks}
          loading={tasksLoading}
          onTaskClick={handleTaskClick}
        />

        {/* ── Right: Status Overview + Need Assistance stacked ── */}
        <div className="flex flex-col gap-5">
          <StatusTimeline milestones={milestones} loading={milestonesLoading} />

          {/* ── Need Assistance ── */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
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
              <h3 className="text-sm font-bold text-gray-900">
                Need Assistance?
              </h3>
            </div>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed mb-5">
            Our team is here to help you through every step of your closing
            process.
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
        </div>{/* end right column */}
      </div>{/* end main grid */}
    </div>
  );
}
