"use client";

import { useState, useEffect, useRef } from "react";
import {
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Check,
  CheckCircle2,
  Building2,
  Clock,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Home,
  FileText,
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
  side?: "purchase" | "sale" | null;
  template_order_index?: number | null;
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
  side?: "purchase" | "sale" | null;
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
  selling_address_street: string | null;
  selling_address_city: string | null;
  selling_address_province: string | null;
  selling_address_postal_code: string | null;
  selling_address_unit: string | null;
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
  selling_price: number | null;
  selling_property_address: string | null;
}

/* ─────────────────────────────────────────────
   DATE HELPERS
───────────────────────────────────────────── */
// Format a date-only value (e.g. a Postgres `date` column → "2026-06-15").
// `new Date("2026-06-15")` parses as UTC midnight, which `toLocaleDateString`
// then shifts back a day for users west of UTC (e.g. June 14 in Toronto).
// Build the Date from the parts so it stays in local time and the displayed
// day matches the DB/JSON value exactly.
function formatDateOnly(
  value: string | null,
  options: Intl.DateTimeFormatOptions,
  fallback = "TBD"
): string {
  if (!value) return fallback;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return fallback;
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", options);
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


// Display order for the "Needs Your Attention" list is sourced from
// task_templates.order_index (exposed on each task as template_order_index
// by /api/tasks). The team can adjust the order from the admin panel without
// a code change, so no hardcoded list lives in this file.

// Task titles that should never be shown to customers on the frontend,
// regardless of completion status. Matched case-insensitively and trimmed.
const HIDDEN_TASK_TITLES = new Set([
  "schedule appointment",
  "schedule an appointment",
]);

function isHiddenTask(task: Task): boolean {
  return HIDDEN_TASK_TITLES.has(task.title.toLowerCase().trim());
}

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

const SEEN_TASKS_STORAGE_KEY = "iclosed_seen_task_ids";

function getSeenTaskIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(SEEN_TASKS_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenTaskIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEEN_TASKS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage errors
  }
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
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  const prevPendingIdsRef = useRef<string>("");

  // Deduplicate tasks so no task title appears twice, and drop any tasks
  // that should never be surfaced to customers (e.g. "Schedule Appointment").
  const uniqueTasks = deduplicateTasks(tasks).filter((t) => !isHiddenTask(t));

  // Show ALL incomplete tasks, sorted by the per-task order configured on
  // task_templates.order_index (the "task no." the team maintains in the
  // admin panel). Tasks without a template (manual additions) fall to the
  // end so they don't jump ahead of the configured workflow. Stable sort
  // preserves the API's due-date order as the tiebreaker.
  // Completed tasks naturally fall away because of the !completed filter.
  const ORDER_FALLBACK = Number.MAX_SAFE_INTEGER;
  const allPending = uniqueTasks
    .filter((t) => !t.completed)
    .slice()
    .sort((a, b) => {
      const ao = a.template_order_index ?? ORDER_FALLBACK;
      const bo = b.template_order_index ?? ORDER_FALLBACK;
      return ao - bo;
    });

  // Previously we capped the visible list at TASK_BATCH_SIZE (3). We now
  // render every pending task the backend returns.
  const pending = allPending;

  // Create a stable key from pending task IDs to use as dependency
  const pendingIdsKey = pending.map((t) => t.id).join(",");

  useEffect(() => {
    if (loading || !pendingIdsKey) return;

    const visibleIds = pendingIdsKey.split(",");
    const seenIds = getSeenTaskIds();

    // Check if pendingIdsKey changed (new task rolled in)
    const isFirstRender = prevPendingIdsRef.current === "";
    const idsChanged = prevPendingIdsRef.current !== pendingIdsKey;
    prevPendingIdsRef.current = pendingIdsKey;

    // Find tasks that haven't been seen before (in localStorage)
    const unseenIds = visibleIds.filter((id) => !seenIds.has(id));

    if (isFirstRender) {
      // On first dashboard load, the initial task batch is NOT flagged as "new" —
      // those are just the starter tasks. We only mark them as seen so that any
      // task that rolls in later (after the user completes one) will be treated
      // as genuinely new.
      const updatedSeen = new Set(seenIds);
      visibleIds.forEach((id) => updatedSeen.add(id));
      saveSeenTaskIds(updatedSeen);
    } else if (idsChanged && unseenIds.length > 0) {
      // Tasks changed mid-session (e.g., completed one, new one rolled in)
      // Show "new" tag for the newly visible unseen task
      setNewTaskIds((prev) => {
        const next = new Set(prev);
        unseenIds.forEach((id) => next.add(id));
        return next;
      });
      // Mark newly visible tasks as seen
      const updatedSeen = new Set(seenIds);
      unseenIds.forEach((id) => updatedSeen.add(id));
      saveSeenTaskIds(updatedSeen);
    }
  }, [loading, pendingIdsKey]);

  const allDone = !loading && uniqueTasks.length > 0 && allPending.length === 0;
  const isEmpty = !loading && uniqueTasks.length === 0;

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
          {pending.map((task, idx) => {
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

            const isNew = newTaskIds.has(task.id);

            return (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="rounded-xl border border-gray-200 bg-white px-4 sm:px-5 py-4 hover:border-[#C10007]/30 hover:shadow-md transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  {/* Step number */}
                  <div className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-gray-400 tabular-nums">{idx + 1}</span>
                  </div>
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm sm:text-base font-bold text-gray-900 group-hover:text-[#C10007] transition-colors leading-snug">
                        {task.title}
                      </p>
                      {isNew && (
                        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#C10007] border border-[#fca5a5]">
                          New
                        </span>
                      )}
                    </div>
                    {formattedDate && (
                      <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                        {`Due by ${formattedDate}${formattedTime ? ` at ${formattedTime}` : ""}`}
                      </p>
                    )}
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
            const formattedDate = formatDateOnly(
              milestone.milestone_date,
              { month: "short", day: "numeric", year: "numeric" },
              ""
            ) || null;

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
                        <Check size={18} className="text-white" strokeWidth={3} />
                      </div>
                    ) : isInProgress ? (
                      <div className="w-[28px] h-[28px] rounded-full border-2 border-gray-800 bg-white flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-800" />
                      </div>
                    ) : (
                      <div className="w-[28px] h-[28px] rounded-full bg-gray-200" />
                    )}
                  </div>

                  {/* Label + meta */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${isCompleted ? "text-gray-400 font-semibold" : isInProgress ? "text-gray-900 font-bold" : "text-gray-500 font-medium"}`}
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

// For a "Purchase & Sale" deal the dashboard splits into a Purchase tab and a
// Sale tab. It used to always open on "purchase", which hid data the admin
// pre-filled on the other side — e.g. a co-seller whose Personal Information
// was entered on the Sale side would land on an empty Purchase tab. Admin
// pre-fill marks that side's "Provide Personal Information" task Completed, so
// use it as the signal. Conservative: only switch to Sale when Sale is the
// side that actually holds the client's filled Personal Information; otherwise
// return null and the caller keeps the historical "purchase" default.
function pickDefaultSide(tasks: Task[]): "purchase" | "sale" | null {
  const isPPI = (t: Task) =>
    (t.title ?? "").toLowerCase().includes("personal information");
  const ppiFilled = (side: "purchase" | "sale") =>
    tasks.some((t) => t.side === side && isPPI(t) && t.completed);

  if (ppiFilled("purchase")) return "purchase";
  if (ppiFilled("sale")) return "sale";
  return null;
}

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

  // ── Purchase/Sale tab state (only used when active deal is "Purchase & Sale") ──
  const [selectedSide, setSelectedSide] = useState<"purchase" | "sale">("purchase");
  // Lead id for which the content-aware default side has already been applied.
  // Lets the auto-default run once per property while preserving manual clicks.
  const autoSideLeadRef = useRef<string | null>(null);

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
    const title = task.title.toLowerCase();
    if (title.includes("upload identification")) {
      setIdDrawerOpen(true);
    } else if (title.includes("provide personal information")) {
      // PPI gets its dedicated drawer so admin-entered values (including
      // "Save as Draft") prefill all 13 fields from task_responses. The
      // generic DynamicTaskDrawer only prefilled by field_id and was missing
      // values for the half-dozen PPI fields that don't live on the lead row.
      setPersonalInfoDrawerOpen(true);
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

  // ── Reset selected side when switching properties ─────────
  useEffect(() => {
    setSelectedSide("purchase");
    // Re-arm the content-aware default so it re-applies once this property's
    // tasks load (see fetchDealData below).
    autoSideLeadRef.current = null;
  }, [activeLeadId]);

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
          if (d.success) {
            setTasks(d.tasks);
            // Land the user on the side that actually has content (e.g. the
            // Sale side where the admin pre-filled a co-seller's Personal
            // Information). Runs once per property; manual tab clicks afterward
            // are preserved because the ref is only reset on property change.
            if (autoSideLeadRef.current !== activeLeadId) {
              const preferred = pickDefaultSide(d.tasks as Task[]);
              if (preferred) setSelectedSide(preferred);
              autoSideLeadRef.current = activeLeadId;
            }
          }
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

  const sellingFullAddress = [
    activeProperty?.selling_address_street,
    activeProperty?.selling_address_city,
    activeProperty?.selling_address_province,
  ]
    .filter(Boolean)
    .join(", ");

  const isBothDeal = activeDeal?.type === "Purchase & Sale";
  const showSale = isBothDeal && selectedSide === "sale";

  // Tab entries — "Purchase & Sale" deals expand into 2 separate tabs (one per side)
  const tabEntries = properties.flatMap((p) => {
    const deal = p.deal_id ? deals.find((d) => d.id === p.deal_id) ?? null : null;
    if (deal?.type === "Purchase & Sale") {
      return [
        {
          key: `${p.lead_id}:purchase`,
          lead_id: p.lead_id,
          side: "purchase" as "purchase" | "sale" | null,
          label: p.address_street,
          icon: Home,
        },
        {
          key: `${p.lead_id}:sale`,
          lead_id: p.lead_id,
          side: "sale" as "purchase" | "sale" | null,
          label: p.selling_address_street,
          icon: FileText,
        },
      ];
    }
    return [
      {
        key: `${p.lead_id}:single`,
        lead_id: p.lead_id,
        side: null as "purchase" | "sale" | null,
        label: p.address_street,
        icon: Building2,
      },
    ];
  });

  const heroAddress = showSale ? sellingFullAddress : fullAddress;
  const heroLabel = isBothDeal
    ? showSale
      ? "Sale · Property Address"
      : "Purchase · Property Address"
    : activeDeal?.type
      ? `${activeDeal.type} · Property Address`
      : "Property Address";

  const visibleMilestones = isBothDeal
    ? milestones.filter((m) => (m.side ?? null) === selectedSide)
    : milestones;

  const visibleTasks = isBothDeal
    ? tasks.filter((t) => (t.side ?? null) === selectedSide)
    : tasks;

  const closingFormatted = formatDateOnly(activeDeal?.closing_date ?? null, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

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
        clientFirstName={activeProperty?.first_name}
        clientLastName={activeProperty?.last_name}
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

      {/* ── 1. Property Selector Tabs (one per lead; Purchase & Sale deals split into 2 tabs) ── */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
        {propertyLoading ? (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Loading properties...
          </div>
        ) : tabEntries.length === 0 ? (
          <div className="px-4 py-2 text-sm text-gray-400">No properties yet</div>
        ) : (
          tabEntries.map((entry, i) => {
            const isActive =
              entry.lead_id === activeLeadId &&
              (entry.side === null || entry.side === selectedSide);
            const Icon = entry.icon;
            const prefix =
              entry.side === "purchase"
                ? "Purchase · "
                : entry.side === "sale"
                  ? "Sale · "
                  : "";
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => {
                  setActiveLeadId(entry.lead_id);
                  if (entry.side) setSelectedSide(entry.side);
                }}
                className={[
                  "cursor-pointer flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "bg-[#C10007] text-white shadow-md"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-[#C10007] hover:text-[#C10007]",
                ].join(" ")}
              >
                <Icon size={15} strokeWidth={2} />
                <span className="whitespace-nowrap">
                  {prefix}{entry.label || `Property ${i + 1}`}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* ── 2. Property Hero Card ── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="bg-gray-100 px-6 py-5 flex flex-wrap items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[#C10007] flex items-center justify-center flex-shrink-0">
            <MapPin size={18} className="text-white" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold uppercase text-[#C10007] mb-1">
              {heroLabel}
            </p>
            {propertyLoading ? (
              <p className="text-sm text-gray-400">Loading address...</p>
            ) : activeProperty ? (
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">
                {heroAddress || "Address not provided"}
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
            key={`${activeLeadId ?? "no-active-lead"}:${selectedSide}`}
            tasks={visibleTasks}
            loading={tasksLoading}
            onTaskClick={handleTaskClick}
          />
        </div>

        {/* ── Right: Status Overview + Need Assistance stacked (1/4) ── */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <StatusTimeline milestones={visibleMilestones} loading={milestonesLoading} />

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
