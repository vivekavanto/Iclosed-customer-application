"use client";

import { useState, useEffect, useRef } from "react";
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
  FileCheck,
  Shield,
} from "lucide-react";
import PersonalInformationDrawer from "@/components/dashboard/PersonalInformationDrawer";
import DynamicTaskDrawer from "@/components/dashboard/DynamicTaskDrawer";
import UploadIdentificationDrawer from "@/components/dashboard/UploadIdentificationDrawer";
import { useToast } from "@/components/ui/Toast";


interface Task {
  id: string;
  title: string;
  status: "Pending" | "In Progress" | "Completed";
  due_date: string | null;
  completed: boolean;
  is_shared: boolean;
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
  description: unknown | null;
  total_tasks: number;
  completed_tasks: number;
}

interface PropertyData {
  lead_id: string;
  deal_id: string | null;
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


const TASK_BATCH_SIZE = 3;

// Deduplicate tasks by title — keep the incomplete one if both exist
function deduplicateTasks(tasks: Task[]): Task[] {
  const map = new Map<string, Task>();
  for (const t of tasks) {
    const key = t.title.toLowerCase().trim();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, t);
    } else if (existing.completed && !t.completed) {
      // Prefer the incomplete task so it stays actionable
      map.set(key, t);
    }
  }
  return Array.from(map.values());
}

function AttentionCard({
  tasks,
  loading,
  onTaskClick,
}: {
  tasks: Task[];
  loading: boolean;
  onTaskClick: (task: Task) => void;
}) {
  const hasInitializedVisibleTasksRef = useRef(false);
  const seenTaskIdsRef = useRef<Set<string>>(new Set());
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());

  // Deduplicate tasks so no task title appears twice
  const uniqueTasks = deduplicateTasks(tasks);

  // Rolling visibility: always show the first 3 incomplete tasks.
  const allPending = uniqueTasks.filter((t) => !t.completed);
  const pending = allPending.slice(0, TASK_BATCH_SIZE);

  useEffect(() => {
    if (loading) return;

    const visibleIds = pending.map((task) => task.id);

    // First render of visible tasks is the baseline; don't mark them as new.
    if (!hasInitializedVisibleTasksRef.current) {
      hasInitializedVisibleTasksRef.current = true;
      seenTaskIdsRef.current = new Set(visibleIds);
      setNewTaskIds(new Set());
      return;
    }

    const newlyVisible: string[] = [];
    const nextSeen = new Set(seenTaskIdsRef.current);
    for (const taskId of visibleIds) {
      if (!nextSeen.has(taskId)) {
        nextSeen.add(taskId);
        newlyVisible.push(taskId);
      }
    }
    seenTaskIdsRef.current = nextSeen;

    if (newlyVisible.length > 0) {
      setNewTaskIds((prev) => {
        const next = new Set(prev);
        newlyVisible.forEach((taskId) => next.add(taskId));
        return next;
      });
    }
  }, [loading, pending]);

  const allDone = !loading && uniqueTasks.length > 0 && allPending.length === 0;
  const isEmpty = !loading && uniqueTasks.length === 0;

  // Task icon map
  const taskIconMap: Record<string, React.ReactNode> = {
    "provide personal information": <User size={18} className="text-[#C10007]" strokeWidth={2} />,
    "upload identification": <FileCheck size={18} className="text-[#C10007]" strokeWidth={2} />,
    "upload home insurance policy": <Shield size={18} className="text-[#C10007]" strokeWidth={2} />,
    "schedule an appointment": <Calendar size={18} className="text-[#C10007]" strokeWidth={2} />,
  };

  const getTaskIcon = (title: string) => {
    const key = title.toLowerCase().trim();
    for (const [pattern, icon] of Object.entries(taskIconMap)) {
      if (key.includes(pattern)) return icon;
    }
    return <AlertTriangle size={18} className="text-[#C10007]" strokeWidth={2} />;
  };

  return (
    <div
      className={`rounded-2xl border overflow-hidden shadow-sm transition-all duration-300 ${allDone ? "bg-[#f0fdf4] border-[#bbf7d0]" : "bg-white border-gray-100"}`}
    >
      {/* Header — gradient */}
      <div
        className={`flex items-center gap-3 px-5 sm:px-6 py-4 ${allDone ? "bg-[#dcfce7]" : "bg-[#C10007]/15"}`}
      >
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${allDone ? "bg-[#bbf7d0]" : "bg-[#C10007]"}`}
        >
          {allDone ? (
            <CheckCircle2 size={18} className="text-[#15803d]" strokeWidth={2.2} />
          ) : (
            <AlertTriangle size={18} className="text-white" strokeWidth={2} />
          )}
        </div>
        <h2 className={`text-lg font-bold ${allDone ? "text-[#15803d]" : "text-[#7a0004]"}`}>
          Needs Your Attention
        </h2>
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
          <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-1">
            <Clock size={22} className="text-gray-300" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-gray-500 font-medium">No tasks assigned yet</p>
          <p className="text-xs text-gray-400 text-center">
            Your lawyer will assign tasks once your file is active.
          </p>
        </div>
      ) : (
        <div className="p-3 sm:p-4 space-y-3">
          {pending.map((task) => {
            const formattedDate = task.due_date
              ? new Date(task.due_date).toLocaleDateString("en-CA", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
              : null;
            const formattedTime = task.due_date
              ? new Date(task.due_date).toLocaleTimeString("en-CA", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
              : null;

            return (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="rounded-xl border border-gray-200 bg-white px-4 sm:px-5 py-4 hover:border-[#C10007]/30 hover:shadow-md transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
                    {getTaskIcon(task.title)}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-bold text-gray-900 group-hover:text-[#C10007] transition-colors leading-snug">
                      {task.title}
                    </p>
                    {newTaskIds.has(task.id) && (
                      <span className="inline-flex items-center mt-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#C10007] border border-[#fca5a5]">
                        New
                      </span>
                    )}
                    {/* Shared task badge hidden
                    {task.is_shared && (
                      <span className="inline-flex items-center mt-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                        Shared Task
                      </span>
                    )} */}
                    <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                      {formattedDate
                        ? `Due by ${formattedDate}${formattedTime ? ` at ${formattedTime}` : ""}`
                        : "No due date"}
                    </p>
                  </div>

                  {/* Arrow */}
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#FEF2F2] transition-colors">
                    <ChevronRight size={16} className="text-gray-400 group-hover:text-[#C10007]" strokeWidth={2} />
                  </div>
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
  const [tooltipPos, setTooltipPos] = useState<{ top: number; right: number } | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = (milestone: Milestone, e: React.MouseEvent) => {
    if (!milestone.description) return;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const padding = 16;

    const minTop = padding + 100;
    const maxTop = window.innerHeight - padding - 100;
    const top = Math.min(Math.max(rect.top + rect.height / 2, minTop), maxTop);

    setSelectedId(milestone.id);
    setTooltipPos({
      top,
      right: window.innerWidth - rect.left + 12,
    });
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setSelectedId(null);
      setTooltipPos(null);
    }, 150);
  };

  const handleTooltipEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleTooltipLeave = () => {
    setSelectedId(null);
    setTooltipPos(null);
  };

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

  const isMilestoneDone = (m: Milestone) =>
    m.status === "Completed" || (m.total_tasks > 0 && m.completed_tasks === m.total_tasks);
  const completedCount = milestones.filter(isMilestoneDone).length;
  const progressPercent =
    milestones.length === 0
      ? 0
      : Math.min(100, Math.round((completedCount / milestones.length) * 100));

  const filtered = milestones.filter((m) => m.status !== "Waiting");

  // Find selected milestone for tooltip
  const selectedMilestone = filtered.find((m) => m.id === selectedId);
  let selectedDesc = "";
  if (selectedMilestone?.description) {
    if (typeof selectedMilestone.description === "string") {
      selectedDesc = selectedMilestone.description;
    } else if (typeof selectedMilestone.description === "object") {
      const desc = selectedMilestone.description as Record<string, unknown>;
      const modal = typeof desc.modal === "string" ? desc.modal : "";
      const short = typeof desc.short === "string" ? desc.short : "";
      selectedDesc = modal || short || "";
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm">
      {/* Header row */}
      <div className="mb-2">
        <h2 className="text-base font-bold text-gray-900">Status Overview</h2>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-gray-600 rounded-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Steps — scrollable */}
      <div className="max-h-[350px] overflow-y-auto">
        <div>
          {filtered.map((milestone, idx) => {
            const isCompleted = milestone.status === "Completed";
            const isInProgress = milestone.status === "In Progress";
            const hasDescription = milestone.description;
            const isLast = idx === filtered.length - 1;
            const formattedDate = milestone.milestone_date
              ? new Date(milestone.milestone_date).toLocaleDateString("en-CA", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
              : null;

            return (
              <div
                key={milestone.id}
                className="relative"
                onMouseEnter={(e) => handleMouseEnter(milestone, e)}
                onMouseLeave={handleMouseLeave}
              >
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute left-[26px] top-[30px] h-full w-px bg-gray-200 z-0" />
                )}

                <div
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-gray-50/70 ${hasDescription ? "cursor-pointer" : ""}`}
                >
                  {/* Node */}
                  <div className="z-10 flex-shrink-0">
                    {isCompleted ? (
                      <div className="w-[28px] h-[28px] rounded-full bg-gray-400 flex items-center justify-center">
                        <CheckCircle2 size={14} className="text-white" strokeWidth={2.5} />
                      </div>
                    ) : isInProgress ? (
                      <div className="w-[28px] h-[28px] rounded-full bg-gray-300 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-white" />
                      </div>
                    ) : (
                      <div className="w-[28px] h-[28px] rounded-full bg-gray-200" />
                    )}
                  </div>

                  {/* Label + meta */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold leading-snug ${isCompleted ? "text-gray-400" : "text-gray-700"}`}
                    >
                      {milestone.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {formattedDate && (
                        <p className="text-xs text-gray-400">{formattedDate}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fixed-position tooltip — renders outside scroll container */}
      {selectedId && selectedDesc && tooltipPos && selectedMilestone && (
        <div
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
          className="fixed z-50 w-[320px] sm:w-[380px] lg:w-[420px] bg-white rounded-xl border border-gray-200 shadow-xl flex flex-col max-h-[80vh] overflow-y-auto"
          style={{
            top: tooltipPos.top,
            right: tooltipPos.right,
            transform: "translateY(-50%)",
          }}
        >
          <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <h4 className="text-sm font-bold text-gray-900">
              {selectedMilestone.title}
            </h4>
            <p className="text-xs mt-1 flex items-center gap-1.5 text-gray-400">
              <span className={`w-2 h-2 rounded-full inline-block ${selectedMilestone.status === "Completed" ? "bg-gray-400" : selectedMilestone.status === "In Progress" ? "bg-gray-300" : "bg-gray-200"
                }`} />
              {selectedMilestone.status === "Completed" ? "Completed" : selectedMilestone.status === "In Progress" ? "In Progress" : "Pending"}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[13px] text-gray-600 leading-[1.7] whitespace-pre-line">
              {selectedDesc}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PAGE
───────────────────────────────────────────── */
export default function DashboardPage() {
  // ── Multiple properties / deals (one tab per lead) ─────────
  const [properties, setProperties] = useState<PropertyData[]>([]);
  const [deals, setDeals] = useState<DealData[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(true);

  // ── Tasks + milestones for the active deal ────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);

  // ── Drawer state ──────────────────────────────────────────
  const [personalInfoDrawerOpen, setPersonalInfoDrawerOpen] = useState(false);
  const [dynamicDrawerOpen, setDynamicDrawerOpen] = useState(false);
  const [idDrawerOpen, setIdDrawerOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // ── Derived: active property + deal ──────────────────────
  const activeProperty = properties.find((p) => p.lead_id === activeLeadId) ?? null;
  const activeDealId = activeProperty?.deal_id ?? null;
  const activeDeal = activeDealId ? (deals.find((d) => d.id === activeDealId) ?? null) : null;

  const leadId = activeLeadId;

  function handleTaskClick(task: Task) {
    setActiveTask(task);
    if (task.title.toLowerCase().includes("upload identification")) {
      setIdDrawerOpen(true);
    } else {
      setDynamicDrawerOpen(true);
    }
  }

  // ── On mount: fetch all properties + deals ────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/dashboardproperty");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setProperties(data.properties ?? []);
            setDeals(data.deals ?? []);
            if (data.properties?.length > 0) {
              setActiveLeadId(data.properties[0].lead_id);
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

  // ── When active lead/deal changes: reload tasks + milestones ──
  useEffect(() => {
    // No deal yet for this lead → clear tasks/milestones
    if (!activeDealId) {
      setTasks([]);
      setMilestones([]);
      return;
    }
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
    const isShared = tasks.find((t) => t.id === id)?.is_shared ?? false;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed", completed: true, is_shared: isShared }),
      });
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

      {/* ── Upload Identification Drawer (multi-file) ── */}
      <UploadIdentificationDrawer
        open={idDrawerOpen}
        onClose={() => setIdDrawerOpen(false)}
        leadId={leadId ?? undefined}
        taskId={activeTask?.id}
        onSaved={async () => {
          setIdDrawerOpen(false);
          if (activeTask) await markDone(activeTask.id);
        }}
      />

      {/* ── 1. Property Selector Tabs (one per lead) ── */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
        {propertyLoading ? (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Loading properties...
          </div>
        ) : properties.length === 0 ? (
          <div className="px-4 py-2 text-sm text-gray-400">No properties yet</div>
        ) : (
          properties.map((p, i) => {
            const isActive = p.lead_id === activeLeadId;
            return (
              <button
                key={p.lead_id}
                type="button"
                onClick={() => setActiveLeadId(p.lead_id)}
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

      {/* ── 3. Main Grid: Tasks (left 3/4) + Status & Assistance (right 1/4) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* ── Left: Needs Your Attention (3/4) ── */}
        <div className="lg:col-span-7">
          <AttentionCard
            key={activeLeadId ?? "no-active-lead"}
            tasks={tasks}
            loading={tasksLoading}
            onTaskClick={handleTaskClick}
          />
        </div>

        {/* ── Right: Status Overview + Need Assistance stacked (1/4) ── */}
        <div className="lg:col-span-5 flex flex-col gap-5">
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
