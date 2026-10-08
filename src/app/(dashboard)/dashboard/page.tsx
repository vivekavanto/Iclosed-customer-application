"use client";

import { useState, useEffect, useRef } from "react";
import {
  MapPin,
  Check,
  CheckCircle2,
  Building2,
  Clock,
  ChevronRight,
  ChevronDown,
  Loader2,
  Home,
  FileText,
  Lock,
  Copy,
} from "lucide-react";
import ClosingCostEstimateCard from "@/components/dashboard/ClosingCostEstimateCard";
import ClosingCostEstimateModal from "@/components/dashboard/ClosingCostEstimateModal";
import DynamicTaskDrawer from "@/components/dashboard/DynamicTaskDrawer";
import DepositFundsDrawer from "@/components/dashboard/DepositFundsDrawer";
import PersonalInfoTaskDrawer from "@/components/dashboard/PersonalInfoTaskDrawer";
import UploadIdentificationDrawer from "@/components/dashboard/UploadIdentificationDrawer";
import type { BehalfTarget } from "@/components/dashboard/OnBehalfSelector";
import {
  isAfterClosingTask,
  isClosingFiguresTask,
  isHoldTitleTask,
  isPerPartyTask,
  isPersonalInfoTask,
  isPropertyDetailsTask,
  isTreefortTask,
  isUploadIdTask,
} from "@/lib/taskKinds";
import { isTorontoAddress } from "@/lib/isTorontoAddress";
import { taskDisplayTitle } from "@/lib/taskDisplayTitle";
import { resolveStatusSteps } from "@/lib/statusSteps";
import { PORTAL_TEAM, teamInitials } from "@/lib/portalTeam";
import UtilitiesTaskModal from "@/components/dashboard/UtilitiesTaskModal";
import TaskSubmittedModal from "@/components/dashboard/TaskSubmittedModal";
import ChatWidget from "@/components/dashboard/ChatWidget";
import PropertyDetailsTaskModal from "@/components/dashboard/PropertyDetailsTaskModal";
import SigningTaskModal from "@/components/dashboard/SigningTaskModal";
import { isSigningAppointmentTask } from "@/lib/signingAppointment";
import { isDepositTask } from "@/lib/depositTask";
import { SHOW_CLOSING_COST_ESTIMATE } from "@/lib/featureFlags";
import { dealTypeToSide } from "@/lib/taskDescriptions";
import { getFirm, type FirmKey } from "@/lib/firms";
import { useToast } from "@/components/ui/Toast";

/** Per-party completion summary for a Personal Info / Upload ID task. */
interface FamilyTaskStatusSummary {
  is_multi_party: boolean;
  is_id_task: boolean;
  all_completed: boolean;
  completed_count: number;
  total_count: number;
  members: Array<{
    lead_id: string;
    task_id: string | null;
    name: string;
    first_name: string;
    last_name: string;
    is_self: boolean;
    can_edit: boolean;
    completed: boolean;
    doc_count?: number;
    doc_total?: number;
    spouse_name?: string | null;
  }>;
}

/** A single party inside a multi-party task's inline accordion. */
type FamilyMemberRow = FamilyTaskStatusSummary["members"][number];


interface Task {
  id: string;
  deal_id: string;
  title: string;
  status: "Pending" | "In Progress" | "Completed";
  due_date: string | null;
  completed: boolean;
  completed_at?: string | null;
  is_shared: boolean;
  assignee: string | null;
  document_name: string | null;
  document_url: string | null;
  milestone_id: string | null;
  side?: "purchase" | "sale" | null;
  order_index?: number | null;
  template_order_index?: number | null;
  spouse_name?: string | null;
  milestones?: {
    id: string;
    title: string;
    order_index: number;
    status: string;
  } | null;
}

/** Task an admin hasn't switched on yet. */
type LockedTask = Pick<Task, "id" | "deal_id" | "title" | "side" | "order_index">;

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

/** A person on the transaction, shown in the hero "Parties" panel. */
interface Party {
  lead_id: string;
  first_name: string;
  last_name: string;
  // "primary" for the primary applicant; the co-person's role
  // ("purchaser" | "seller" | "applicant") otherwise.
  role: string;
}

/** Next confirmed signing appointment for a deal, from /api/dashboardproperty. */
interface SigningAppointmentInfo {
  start_at: string;
  end_at: string;
  appointment_type: "virtual" | "in_person";
  meet_link: string | null;
  location: string | null;
}

interface PropertyData {
  lead_id: string;
  deal_id: string | null;
  signing_appointment?: SigningAppointmentInfo | null;
  // Display name of the calendar this file books its signing with.
  signing_calendar_name?: string | null;
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
  selling_deposit_amount: number | null;
  /** APS uploaded at intake. */
  aps_uploaded?: boolean;
  aps_uploaded_purchase?: boolean;
  aps_uploaded_sale?: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email?: string | null;
  lead_type: string | null;
  // "purchase" | "sale" when this client is a co-person on a Purchase & Sale
  // deal (party to only that one side). null for a primary client (sees both).
  // Computed authoritatively by /api/dashboardproperty.
  recipient_side: "purchase" | "sale" | null;
  // Which firm retains this file — "navawilson" or "iclosed". Resolved from
  // the transaction's ROOT lead by /api/dashboardproperty, and used to pick
  // the contact details shown to this client.
  firm_key?: FirmKey | null;
  // Everyone on this transaction (primary + co-persons).
  parties?: Party[];
}

interface DealData {
  id: string;
  lead_id: string | null;
  file_number: string | null;
  type: string | null;
  status: string | null;
  closing_date: string | null;
  selling_closing_date: string | null;
  property_address: string | null;
  price: number | null;
  selling_price: number | null;
  selling_property_address: string | null;
  deposit_amount: number | null;
  building_type?: string | null;
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
   PARTY HELPERS
───────────────────────────────────────────── */
function partyFullName(p: Party): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Applicant";
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

// Multi-party tasks are done only when every party is done.
function isTaskDone(t: Task, familyStatus: Record<string, FamilyTaskStatusSummary>): boolean {
  const fs = familyStatus[t.id];
  if (fs?.is_multi_party) return fs.all_completed;
  return t.completed;
}

// Deduped, customer-visible tasks; spouse ID rows live in their roster.
function customerVisibleTasks(
  tasks: Task[],
  familyStatus: Record<string, FamilyTaskStatusSummary>,
): Task[] {
  const rosterTaskIds = new Set(
    Object.values(familyStatus).flatMap((fs) =>
      fs.is_multi_party ? fs.members.map((m) => m.task_id) : [],
    ),
  );
  return deduplicateTasks(tasks).filter(
    (t) => !isHiddenTask(t) && !(t.spouse_name && rosterTaskIds.has(t.id)),
  );
}

// Admin-configured order; unordered tasks sort last.
const ORDER_FALLBACK = Number.MAX_SAFE_INTEGER;
const TASK_PAGE_SIZE = 5;

function sortByOrder(a: Task, b: Task): number {
  // Template order first; per-deal order_index can be stale on older files.
  const ao = a.template_order_index ?? a.order_index ?? ORDER_FALLBACK;
  const bo = b.template_order_index ?? b.order_index ?? ORDER_FALLBACK;
  return ao - bo;
}

function initials(first: string, last: string): string {
  return `${(first[0] ?? "").toUpperCase()}${(last[0] ?? "").toUpperCase()}` || "?";
}

function AttentionCard({
  tasks,
  loading,
  onTaskClick,
  onMemberClick,
  familyStatus,
  partyNoun,
  inactiveTasks,
  side,
}: {
  tasks: Task[];
  loading: boolean;
  onTaskClick: (task: Task) => void;
  onMemberClick: (task: Task, member: FamilyMemberRow) => void;
  familyStatus: Record<string, FamilyTaskStatusSummary>;
  /** "sellers" / "purchasers" / "parties", for "Required from both …". */
  partyNoun: string;
  inactiveTasks: LockedTask[];
  side: "purchase" | "sale" | null;
}) {
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  const [showAllTasks, setShowAllTasks] = useState(false);
  // Which multi-party task rows are expanded to show their per-party breakdown.
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const prevPendingIdsRef = useRef<string>("");

  // Multi-party tasks that just flipped to fully-complete THIS session. We keep
  // them in the list briefly, rendered green, as a "done" confirmation, then
  // drop them (see effect below). Tasks that were already complete on load are
  // never added here, so they don't flash on a fresh visit.
  const [justCompletedIds, setJustCompletedIds] = useState<Set<string>>(new Set());
  // Previous all-completed state per multi-party task id, to detect the flip.
  const prevCompleteRef = useRef<Map<string, boolean> | null>(null);
  const completionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // How long the green confirmation stays before the card disappears.
  const COMPLETION_FLASH_MS = 3000;

  const isTaskComplete = (t: Task): boolean => isTaskDone(t, familyStatus);
  // After-closing tasks have their own card.
  const uniqueTasks = customerVisibleTasks(tasks, familyStatus).filter(
    (t) => !isAfterClosingTask(t.title),
  );

  // Tasks the user still has to action — drives the header count and the
  // "all done" state.
  const trulyPending = uniqueTasks.filter((t) => !isTaskComplete(t));

  // What we actually render: every incomplete task PLUS any multi-party task
  // that just became fully complete (still inside its green-confirmation window),
  // so the card flashes "done" before it disappears rather than vanishing
  // silently.
  const pending = uniqueTasks
    .filter((t) => !isTaskComplete(t) || justCompletedIds.has(t.id))
    .slice()
    .sort(sortByOrder);

  // Closing-figures review stays locked until every other to-do is done.
  const figuresLocked = trulyPending.some((t) => !isClosingFiguresTask(t.title));
  // The CSM books signing, so the client can't open it.
  const isLockedOpen = (t: Task) => (figuresLocked && isClosingFiguresTask(t.title)) || isSigningAppointmentTask(t.title);
  const lockedTasks: LockedTask[] = [
    ...pending.filter((t) => !isTaskComplete(t) && isLockedOpen(t)),
    ...inactiveTasks,
  ];
  const openTasks = pending.filter((t) => !isLockedOpen(t));
  const tasksForYou = trulyPending.length - (lockedTasks.length - inactiveTasks.length);

  // Detect a multi-party task flipping to fully-complete this session: flash it
  // green for COMPLETION_FLASH_MS, then remove it from the list.
  const completionKey = uniqueTasks
    .map((t) => {
      const fs = familyStatus[t.id];
      if (!fs?.is_multi_party) return `${t.id}:-`;
      return `${t.id}:${fs.all_completed ? 1 : 0}`;
    })
    .join(",");

  useEffect(() => {
    const current = new Map<string, boolean>();
    for (const t of uniqueTasks) {
      const fs = familyStatus[t.id];
      if (fs?.is_multi_party) current.set(t.id, fs.all_completed);
    }
    const prev = prevCompleteRef.current;
    // First time we see completion state (or after a remount) just record it —
    // don't flash tasks that were already complete on load.
    if (prev) {
      for (const [id, done] of current) {
        if (done && !prev.get(id)) {
          setJustCompletedIds((s) => new Set(s).add(id));
          if (completionTimersRef.current[id]) clearTimeout(completionTimersRef.current[id]);
          completionTimersRef.current[id] = setTimeout(() => {
            setJustCompletedIds((s) => {
              const next = new Set(s);
              next.delete(id);
              return next;
            });
            delete completionTimersRef.current[id];
          }, COMPLETION_FLASH_MS);
        }
      }
    }
    prevCompleteRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionKey]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    const timers = completionTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

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

  const allDone =
    !loading && uniqueTasks.length > 0 && trulyPending.length === 0 && inactiveTasks.length === 0;
  const isEmpty = !loading && uniqueTasks.length === 0 && inactiveTasks.length === 0;

  // Right-side status chip for a per-party task. Counts parties completed out of
  // the total ("Pending 0/2"); once only one party is left, names them
  // ("Pending Pavi 1/2").
  const partyChip = (t: Task): string | null => {
    const fs = familyStatus[t.id];
    if (!fs?.is_multi_party) return null;
    const pendingMembers = fs.members.filter((m) => !m.completed);
    if (pendingMembers.length === 0) return null;
    const name = pendingMembers.length === 1 ? pendingMembers[0].first_name : null;
    return `Pending ${name ? `${name} ` : ""}${fs.completed_count}/${fs.total_count}`;
  };

  // Subtitle under a per-party task title. Always reads as a shared task
  // ("Required from both parties") — we no longer name the individual party still
  // pending, so the copy stays stable as each person completes their section.
  const partySubtitle = (t: Task): string | null => {
    const fs = familyStatus[t.id];
    if (!fs?.is_multi_party) return null;
    return `Required from ${fs.total_count === 2 ? "both" : "all"} ${partyNoun}`;
  };

  return (
    <div
      className={`rounded-2xl border overflow-hidden shadow-sm transition-all duration-300 ${allDone ? "bg-[#f0fdf4] border-[#bbf7d0]" : "bg-white border-gray-100"}`}
    >
      {/* Header */}
      <div className={`px-5 sm:px-6 py-4 ${allDone ? "bg-[#dcfce7]" : "bg-[#C10007]/12"}`}>
        <h2 className={`text-lg font-bold ${allDone ? "text-[#15803d]" : "text-[#7a0004]"}`}>
          Your to-do list
        </h2>
        {!allDone && !isEmpty && (
          <p className="text-xs text-[#7a0004]/70 mt-0.5">
            {tasksForYou} {tasksForYou === 1 ? "task" : "tasks"} for you
            {lockedTasks.length > 0 && ` · ${lockedTasks.length} pending`}
          </p>
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
          {(showAllTasks ? openTasks : openTasks.slice(0, TASK_PAGE_SIZE)).map((task, idx) => {
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
            const chip = partyChip(task);
            const subtitle = partySubtitle(task);
            const fs = familyStatus[task.id];

            // ── Multi-party task → inline accordion of per-party rows ──
            if (fs?.is_multi_party) {
              const isExpanded = expandedTaskIds.has(task.id);
              const kindUpload = isUploadIdTask(task.title);
              return (
                <div
                  key={task.id}
                  className={[
                    "rounded-xl border overflow-hidden transition-all duration-200",
                    fs.all_completed
                      ? "border-[#bbf7d0] bg-[#f0fdf4]"
                      : isExpanded
                        ? "border-[#C10007]/30 shadow-md bg-white"
                        : "border-gray-200 hover:border-[#C10007]/30 hover:shadow-md bg-white",
                  ].join(" ")}
                >
                  {/* Accordion header — toggles the per-party breakdown */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTaskIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        return next;
                      })
                    }
                    className="w-full text-left px-4 sm:px-5 py-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-gray-400 tabular-nums">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm sm:text-base font-bold leading-snug transition-colors ${fs.all_completed ? "text-[#15803d]" : "text-gray-900 group-hover:text-[#C10007]"}`}>
                            {taskDisplayTitle(task.title, side)}
                          </p>
                          {fs.all_completed ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d]">
                              <Check size={11} strokeWidth={3} /> Completed
                            </span>
                          ) : isNew ? (
                            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#C10007] border border-[#fca5a5]">
                              New
                            </span>
                          ) : null}
                        </div>
                        {subtitle && (
                          <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{subtitle}</p>
                        )}
                      </div>
                      {/* Progress count (e.g. 1/2) */}
                      <span
                        className={[
                          "flex-shrink-0 text-xs sm:text-sm font-semibold tabular-nums",
                          fs.all_completed ? "text-green-600" : "text-[#C10007]",
                        ].join(" ")}
                      >
                        {fs.completed_count}/{fs.total_count}
                      </span>
                      <ChevronDown
                        size={18}
                        strokeWidth={2}
                        className={[
                          "text-gray-400 transition-transform flex-shrink-0",
                          isExpanded ? "rotate-180" : "",
                        ].join(" ")}
                      />
                    </div>
                  </button>

                  {/* Accordion body — one row per involved party */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 divide-y divide-gray-100">
                      {fs.members.map((m) => {
                        const displayName =
                          m.name ||
                          `${m.first_name} ${m.last_name}`.trim() ||
                          m.first_name ||
                          "Party";
                        return (
                          <div
                            key={`${m.lead_id}:${m.task_id ?? ""}`}
                            className="flex items-center gap-3 px-4 sm:px-5 py-3.5 bg-gray-50/50"
                          >
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-gray-200 text-gray-500">
                              {initials(m.first_name, m.last_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="ph-mask text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                                <span className="truncate">{displayName}</span>
                              </p>
                            </div>
                            {m.completed ? (
                              <span
                                className="flex-shrink-0 w-7 h-7 rounded-full bg-green-100 flex items-center justify-center"
                                aria-label="Completed"
                              >
                                <Check size={15} className="text-green-600" strokeWidth={2.5} />
                              </span>
                            ) : m.can_edit && m.task_id ? (
                              <button
                                type="button"
                                onClick={() => onMemberClick(task, m)}
                                className="flex-shrink-0 inline-flex items-center rounded-lg border border-[#C10007]/60 bg-white px-4 py-2 text-sm font-semibold text-[#C10007] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                              >
                                {kindUpload ? "Upload" : "Provide"}
                              </button>
                            ) : (
                              <span className="flex-shrink-0 text-xs font-semibold text-gray-400">
                                Pending
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

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
                        {taskDisplayTitle(task.title, side)}
                      </p>
                      {isNew && (
                        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#C10007] border border-[#fca5a5]">
                          New
                        </span>
                      )}
                    </div>
                    {subtitle ? (
                      <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{subtitle}</p>
                    ) : formattedDate ? (
                      <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                        {`Due by ${formattedDate}${formattedTime ? ` at ${formattedTime}` : ""}`}
                      </p>
                    ) : null}
                  </div>
                  {/* Per-party status chip */}
                  {chip && (
                    <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-[#C10007]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C10007]" />
                      {chip}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-gray-400 group-hover:text-[#C10007] flex-shrink-0" strokeWidth={2} />
                </div>
              </div>
            );
          })}
          {/* Locked until the rest of the list is done */}
          {(showAllTasks ? lockedTasks : lockedTasks.slice(0, Math.max(0, TASK_PAGE_SIZE - openTasks.length))).map((task) => (
            <div
              key={task.id}
              className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-4 sm:px-5 py-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Lock size={13} className="text-gray-400" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-base font-bold text-gray-400 leading-snug">{taskDisplayTitle(task.title, side)}</p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                    {isSigningAppointmentTask(task.title)
                      ? "Your CSM will reach out to you to book a signing appointment"
                      : "Pending — opens once your final closing figures are ready"}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {openTasks.length + lockedTasks.length > TASK_PAGE_SIZE && (
            <button
              type="button"
              onClick={() => setShowAllTasks((v) => !v)}
              className="w-full inline-flex items-center justify-center rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-colors cursor-pointer"
            >
              {showAllTasks ? "Show less" : `See more (${openTasks.length + lockedTasks.length - TASK_PAGE_SIZE})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   COMPLETED TASKS (read-only)
════════════════════════════════════════════════════ */

function CompletedTasksCard({
  tasks,
  loading,
  familyStatus,
  onTaskClick,
  onMemberClick,
  side,
}: {
  tasks: Task[];
  loading: boolean;
  familyStatus: Record<string, FamilyTaskStatusSummary>;
  onTaskClick: (task: Task) => void;
  onMemberClick: (task: Task, member: FamilyMemberRow) => void;
  side: "purchase" | "sale" | null;
}) {
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const PAGE_SIZE = 5;

  // After-closing tasks stay in their own card once done.
  const completed = customerVisibleTasks(tasks, familyStatus)
    .filter((t) => isTaskDone(t, familyStatus) && !isAfterClosingTask(t.title))
    .sort(sortByOrder);

  const toggle = (id: string) =>
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading || completed.length === 0) return null;

  const visible = showAll ? completed : completed.slice(0, PAGE_SIZE);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm mt-5">
      <SectionHeader
        title="Completed"
        green
        done={completed.length}
        total={completed.length}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />

      {!collapsed && (
        <div className="p-3 sm:p-4 space-y-3">
          {visible.map((task) => {
            const fs = familyStatus[task.id];
            const multi = !!fs?.is_multi_party;
            const isExpanded = multi && expandedTaskIds.has(task.id);

            return (
              <div key={task.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => (multi ? toggle(task.id) : onTaskClick(task))}
                  aria-expanded={multi ? isExpanded : undefined}
                  className="w-full text-left px-4 sm:px-5 py-4 cursor-pointer group hover:bg-gray-50/60 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0"
                      aria-hidden
                    >
                      <Check size={15} className="text-green-600" strokeWidth={2.5} />
                    </span>
                    <p className="flex-1 min-w-0 text-sm sm:text-base font-bold text-gray-900 group-hover:text-[#C10007] transition-colors leading-snug">
                      {taskDisplayTitle(task.title, side)}
                    </p>
                    <span className="flex-shrink-0 text-xs font-semibold text-green-600">Completed</span>
                    <ChevronRight
                      size={16}
                      strokeWidth={2}
                      className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </div>
                </button>

                {/* Per-party rows; each opens that party's form */}
                {isExpanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {fs.members.map((m) => (
                      <div
                        key={`${m.lead_id}:${m.task_id ?? ""}`}
                        className="flex items-center gap-3 px-4 sm:px-5 py-3.5 bg-gray-50/50"
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-gray-200 text-gray-500">
                          {initials(m.first_name, m.last_name)}
                        </div>
                        <p className="ph-mask flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">
                          {m.name || `${m.first_name} ${m.last_name}`.trim() || "Party"}
                        </p>
                        {m.can_edit && m.task_id ? (
                          <button
                            type="button"
                            onClick={() => onMemberClick(task, m)}
                            className="flex-shrink-0 inline-flex items-center rounded-lg border border-gray-300 bg-transparent px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                        ) : (
                          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-100 flex items-center justify-center" aria-label="Completed">
                            <Check size={15} className="text-green-600" strokeWidth={2.5} />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {completed.length > PAGE_SIZE && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full inline-flex items-center justify-center rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-colors cursor-pointer"
            >
              {showAll ? "Show less" : `See more (${completed.length - PAGE_SIZE})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SECTION HEADER (Completed / After closing)
───────────────────────────────────────────── */
function SectionHeader({
  title,
  done,
  total,
  collapsed,
  onToggle,
  green = false,
}: {
  title: string;
  done: number;
  total: number;
  collapsed: boolean;
  onToggle: () => void;
  green?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className={`w-full flex items-center gap-3 px-5 sm:px-6 py-4 text-left cursor-pointer ${green ? "bg-green-50" : ""} ${collapsed ? "" : green ? "border-b border-green-100" : "border-b border-gray-100"}`}
    >
      <h2 className={`flex-1 text-base font-bold ${green ? "text-green-800" : "text-gray-900"}`}>{title}</h2>
      <span className={`text-sm tabular-nums ${green ? "text-green-700" : "text-gray-500"}`}>
        {done} of {total}
      </span>
      <ChevronDown
        size={16}
        strokeWidth={2}
        className={`text-gray-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
      />
    </button>
  );
}

/* ─────────────────────────────────────────────
   AFTER CLOSING TASKS
───────────────────────────────────────────── */
function AfterClosingCard({
  tasks,
  loading,
  onTaskClick,
  side,
}: {
  tasks: Task[];
  loading: boolean;
  onTaskClick: (task: Task) => void;
  side: "purchase" | "sale" | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const afterClosing = deduplicateTasks(tasks)
    .filter((t) => !isHiddenTask(t) && isAfterClosingTask(t.title))
    .sort(sortByOrder);

  if (loading || afterClosing.length === 0) return null;

  const done = afterClosing.filter((t) => t.completed).length;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm mt-5">
      <SectionHeader
        title="After closing"
        done={done}
        total={afterClosing.length}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />
      {!collapsed && (
        <div className="p-3 sm:p-4 space-y-3">
          {afterClosing.map((task, idx) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onTaskClick(task)}
              className="w-full text-left rounded-xl border border-gray-200 bg-white px-4 sm:px-5 py-4 hover:border-[#C10007]/30 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center gap-4">
                {task.completed ? (
                  <span className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0" aria-hidden>
                    <Check size={15} className="text-green-600" strokeWidth={2.5} />
                  </span>
                ) : (
                  <div className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-gray-400 tabular-nums">{idx + 1}</span>
                  </div>
                )}
                <p className="flex-1 min-w-0 text-sm sm:text-base font-bold text-gray-900 group-hover:text-[#C10007] transition-colors leading-snug">
                  {taskDisplayTitle(task.title, side)}
                </p>
                {task.completed && (
                  <span className="flex-shrink-0 text-xs font-semibold text-green-600">Completed</span>
                )}
                <ChevronRight size={16} className="text-gray-400 group-hover:text-[#C10007] flex-shrink-0" strokeWidth={2} />
              </div>
            </button>
          ))}
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
  blockedMilestoneIds,
  loading,
  side,
}: {
  milestones: Milestone[];
  blockedMilestoneIds: Set<string>;
  loading: boolean;
  side: "purchase" | "sale";
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm flex items-center justify-center py-16">
        <Loader2 size={22} className="text-gray-300 animate-spin" />
      </div>
    );
  }

  // A per-party milestone stays open until every co-party's section is done.
  const isMilestoneDone = (m: Milestone) =>
    !blockedMilestoneIds.has(m.id) &&
    (m.status === "Completed" || (m.total_tasks > 0 && m.completed_tasks === m.total_tasks));
  const steps = resolveStatusSteps(
    side,
    milestones.map((m) => ({ title: m.title, done: isMilestoneDone(m) })),
  );
  const progressPercent = Math.round((steps.filter((st) => st.done).length / steps.length) * 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-4 pt-4 pb-2.5 shadow-sm">
      <h2 className="mb-2 text-[15px] font-bold text-gray-900">Status Overview</h2>
      <div className="mb-2 h-[5px] w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full bg-gray-600 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
      </div>
      {steps.map((step, i) => (
        <div
          key={step.title}
          className="relative"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover((h) => (h === i ? null : h))}
        >
          <div className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1 ${hover === i ? "bg-gray-50" : ""}`}>
            {step.done ? (
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-400">
                <Check size={12} className="text-white" strokeWidth={3} />
              </div>
            ) : step.current ? (
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#C10007]">
                <div className="h-2 w-2 rounded-full bg-[#C10007]" />
              </div>
            ) : (
              <div className="h-5 w-5 flex-shrink-0 rounded-full bg-gray-200" />
            )}
            <p
              className={`text-[13px] ${step.done ? "font-medium text-gray-400" : step.current ? "font-bold text-gray-900" : "font-medium text-gray-500"}`}
            >
              {step.title}
            </p>
          </div>
          {hover === i && (
            <div className="absolute right-[calc(100%+10px)] top-1/2 z-[25] hidden w-[260px] -translate-y-1/2 rounded-[10px] border border-gray-200 bg-white px-3.5 py-2.5 shadow-lg lg:block">
              <p className="text-[13px] font-bold text-gray-900">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">{step.description}</p>
            </div>
          )}
        </div>
      ))}
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
  const [inactiveTasks, setInactiveTasks] = useState<LockedTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);

  // ── Purchase/Sale tab state (only used when active deal is "Purchase & Sale") ──
  const [selectedSide, setSelectedSide] = useState<"purchase" | "sale">("purchase");
  // Lead id for which the content-aware default side has already been applied.
  // Lets the auto-default run once per property while preserving manual clicks.
  const autoSideLeadRef = useRef<string | null>(null);

  // ── Drawer state ──────────────────────────────────────────
  const [dynamicDrawerOpen, setDynamicDrawerOpen] = useState(false);
  const [idDrawerOpen, setIdDrawerOpen] = useState(false);
  const [personalInfoDrawerOpen, setPersonalInfoDrawerOpen] = useState(false);
  const [depositDrawerOpen, setDepositDrawerOpen] = useState(false);
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);
  const [propertyDetailsOpen, setPropertyDetailsOpen] = useState(false);
  const [signingOpen, setSigningOpen] = useState(false);
  // Title of the task just submitted; shows the success popup.
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // ── Direct per-party target (inline multi-party accordion) ──
  // When a specific party's "Upload"/"Provide" button is clicked inside the
  // Needs-Your-Attention accordion, we open the existing single-party drawer
  // pointed straight at that person's own task/lead — bypassing the on-behalf
  // dropdown. Cleared whenever a normal (single-party) task is opened.
  const [directTarget, setDirectTarget] = useState<{
    task_id: string;
    lead_id: string;
    first_name: string;
    last_name: string;
    is_self: boolean;
    spouse_name?: string | null;
  } | null>(null);

  // Per-party completion summaries keyed by task id — drives the dashboard
  // badges and the decision to open the multi-party modal.
  const [familyStatus, setFamilyStatus] = useState<Record<string, FamilyTaskStatusSummary>>({});

  // ── Upload-choice state ───────────────────────────────
  // The people the primary may submit the open task for (themselves + linked
  // co-persons), and which one is currently selected in the drawer dropdown.
  // Only populated for Upload Identification / Provide Personal Information when
  // the primary has answered the "Who will be uploading your documents?" popup
  // (stored on the primary as `upload_mode` / `upload_consent_uploader_lead_id`) and
  // there are co-persons with equivalent tasks.
  const [behalfTargets, setBehalfTargets] = useState<BehalfTarget[]>([]);
  const [selectedBehalfLeadId, setSelectedBehalfLeadId] = useState<string | null>(null);

  // ── Derived: active property + deal ──────────────────────
  const activeProperty = properties.find((p) => p.lead_id === activeLeadId) ?? null;
  const activeDealId = activeProperty?.deal_id ?? null;
  // The firm whose name, telephone number and mailbox this client is shown.
  // Falls back to DEFAULT_FIRM_KEY (inside getFirm) while properties are still
  // loading, so the card never renders with blank contact details.
  const activeFirm = getFirm(activeProperty?.firm_key);
  const activeDeal = activeDealId ? (deals.find((d) => d.id === activeDealId) ?? null) : null;

  const leadId = activeLeadId;

  // Load the "submit on behalf of …" people for a task the primary is opening.
  // Populates the in-drawer dropdown only when the primary opted in and has a
  // co-person with the equivalent task; otherwise the drawer shows no dropdown.
  async function loadBehalfTargets(taskId: string) {
    setBehalfTargets([]);
    setSelectedBehalfLeadId(null);
    try {
      const res = await fetch(`/api/on-behalf-targets?task_id=${encodeURIComponent(taskId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && data.enabled && (data.targets?.length ?? 0) > 1) {
        const targets = data.targets as BehalfTarget[];
        setBehalfTargets(targets);
        // Default the dropdown to the logged-in user (the uploader's own task),
        // so opening the drawer starts on "myself" before switching to others.
        setSelectedBehalfLeadId(
          (targets.find((t) => t.is_self) ?? targets[0]).lead_id
        );
      }
    } catch {
      // non-blocking — drawer still works for the primary's own task
    }
  }

  // Fetch per-party completion summaries for every Personal Info / Upload ID task
  // in the given list. Powers the dashboard badges and the open-the-shell choice.
  async function loadFamilyStatus(taskList: Task[]) {
    const perParty = taskList.filter((t) => isPerPartyTask(t.title) && !t.spouse_name);
    if (perParty.length === 0) {
      setFamilyStatus({});
      return;
    }
    try {
      const entries = await Promise.all(
        perParty.map(async (t) => {
          try {
            const res = await fetch(
              `/api/family-task-status?task_id=${encodeURIComponent(t.id)}`,
              { cache: "no-store" },
            );
            if (!res.ok) return null;
            const data = await res.json();
            if (!data?.success) return null;
            return [t.id, data as FamilyTaskStatusSummary] as const;
          } catch {
            return null;
          }
        }),
      );
      const map: Record<string, FamilyTaskStatusSummary> = {};
      for (const e of entries) if (e) map[e[0]] = e[1];
      setFamilyStatus(map);
    } catch {
      setFamilyStatus({});
    }
  }

  function handleTaskClick(task: Task) {
    setActiveTask(task);
    const title = task.title.toLowerCase();
    // Reset any prior on-behalf dropdown / direct per-party target; (re)load the
    // dropdown for the two supported tasks.
    setBehalfTargets([]);
    setSelectedBehalfLeadId(null);
    setDirectTarget(null);

    // Open the dedicated UploadIdentificationDrawer for any identification task.
    // Uses the shared isUploadIdTask() helper so routing, per-party family status
    // and the drawer's ID-doc counting all agree on what counts as an ID task.
    if (isPropertyDetailsTask(task.title)) {
      setPropertyDetailsOpen(true);
    } else if (isSigningAppointmentTask(task.title)) {
      setSigningOpen(true);
    } else if (isAfterClosingTask(task.title)) {
      setUtilitiesOpen(true);
    } else if (isUploadIdTask(task.title)) {
      if (!task.spouse_name) void loadBehalfTargets(task.id);
      setIdDrawerOpen(true);
    } else if (isDepositTask(task.title)) {
      // The closing-funds task is one file upload wrapped in a lot of reading:
      // the balance, the statement it came from and three ways to send the
      // money. Its own drawer presents those before the picker — see
      // DepositFundsDrawer. Never on behalf of anyone: the money is the file's,
      // not a particular purchaser's, so there is no per-party target.
      setDepositDrawerOpen(true);
    } else if (isPersonalInfoTask(task.title)) {
      // Personal Information has its own dedicated drawer (PersonalInfoTaskDrawer)
      // so it can be customized independently of the generic task drawer. Uses the
      // shared helper so "Personal Information" / "Provide Personal Information"
      // both route here (and get the per-party family status), matching admin.
      void loadBehalfTargets(task.id);
      setPersonalInfoDrawerOpen(true);
    } else if (isHoldTitleTask(task.title)) {
      // Shared by every party, so no on-behalf picker; this drawer renders the shares box.
      setPersonalInfoDrawerOpen(true);
    } else {
      // Everything else goes through the DB-driven DynamicTaskDrawer so every
      // field defined on the task template renders automatically (and stays in
      // sync as templates change), rather than a hardcoded slot list that
      // silently drops fields like the Sale-side "New Home Address".
      setDynamicDrawerOpen(true);
    }
  }

  // Open the single-party drawer aimed straight at one party's task, from the
  // inline multi-party accordion. We set a directTarget (which overrides the
  // derived drawer inputs) instead of routing through the on-behalf dropdown, so
  // the right person's task/lead is loaded whether or not on-behalf is enabled.
  function handleMemberClick(task: Task, member: FamilyMemberRow) {
    if (!member.task_id) return;
    setActiveTask(task);
    setBehalfTargets([]);
    setSelectedBehalfLeadId(null);
    setDirectTarget({
      task_id: member.task_id,
      lead_id: member.lead_id,
      first_name: member.first_name,
      last_name: member.last_name,
      is_self: member.is_self,
      spouse_name: member.spouse_name ?? null,
    });
    if (isUploadIdTask(task.title)) setIdDrawerOpen(true);
    else if (isTreefortTask(task.title)) setDynamicDrawerOpen(true);
    else setPersonalInfoDrawerOpen(true);
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
    const prop = properties.find((p) => p.lead_id === activeLeadId) ?? null;
    const restricted = prop?.recipient_side ?? null;
    // A co-person is locked to their one side (co-purchaser → purchase,
    // co-seller → sale); everyone else defaults to purchase.
    setSelectedSide(restricted ?? "purchase");
    // For a locked co-person, suppress the content-aware auto-default so it
    // can't flip them to the other side; otherwise re-arm it so it re-applies
    // once this property's tasks load (see fetchDealData below).
    autoSideLeadRef.current = restricted ? activeLeadId : null;
  }, [activeLeadId, properties]);

  // ── When active lead/deal changes: reload tasks + milestones ──
  useEffect(() => {
    // No deal yet for this lead → clear tasks/milestones
    if (!activeDealId) {
      setTasks([]);
      setInactiveTasks([]);
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
            setInactiveTasks(d.locked_tasks ?? []);
            void loadFamilyStatus(d.tasks as Task[]);
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

  // ── Closing cost estimate modal ──────────────────────────
  const [estimateOpen, setEstimateOpen] = useState(false);
  // Sale files, or the Sale tab of a Buy & Sell file, get the sale estimate.
  const estimateSide: "purchase" | "sale" =
    activeDeal?.type === "Sale" ||
    (activeDeal?.type === "Purchase & Sale" && selectedSide === "sale")
      ? "sale"
      : "purchase";
  // APS task decides once it exists.
  const intakeAps =
    activeDeal?.type === "Purchase & Sale"
      ? estimateSide === "sale"
        ? activeProperty?.aps_uploaded_sale
        : activeProperty?.aps_uploaded_purchase
      : activeProperty?.aps_uploaded;
  const apsTask = tasks.find(
    (t) =>
      (estimateSide === "sale" ? t.side !== "purchase" : t.side !== "sale") &&
      /agreement of purchase/i.test(t.title),
  );
  const apsUploaded = apsTask ? !!apsTask.completed : !!intakeAps;

  // ── Mark task done + refresh ──────────────────────────────
  async function markDone(id: string): Promise<boolean> {
    const taskTitle = tasks.find((t) => t.id === id)?.title ?? "Task";
    const isShared = tasks.find((t) => t.id === id)?.is_shared ?? false;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed", completed: true, is_shared: isShared }),
      });
      if (!res.ok) throw new Error("Failed");
      if (activeDealId) {
        const [msRes, tasksRes] = await Promise.all([
          fetch(`/api/milestones?deal_id=${activeDealId}`),
          fetch(`/api/tasks?deal_id=${activeDealId}`),
        ]);
        if (msRes.ok) { const d = await msRes.json(); if (d.success) setMilestones(d.milestones); }
        if (tasksRes.ok) { const d = await tasksRes.json(); if (d.success) { setTasks(d.tasks); setInactiveTasks(d.locked_tasks ?? []); void loadFamilyStatus(d.tasks as Task[]); } }
      }
      return true;
    } catch {
      toastError(`Failed to complete "${taskTitle}". Please try again.`);
      return false;
    }
  }

  // Re-pull tasks, milestones and per-party status for the active deal. Used by
  // the multi-party modal after a party submits their section.
  async function refreshActiveDeal() {
    if (!activeDealId) return;
    try {
      const [msRes, tasksRes] = await Promise.all([
        fetch(`/api/milestones?deal_id=${activeDealId}`),
        fetch(`/api/tasks?deal_id=${activeDealId}`),
      ]);
      if (msRes.ok) { const d = await msRes.json(); if (d.success) setMilestones(d.milestones); }
      if (tasksRes.ok) { const d = await tasksRes.json(); if (d.success) { setTasks(d.tasks); setInactiveTasks(d.locked_tasks ?? []); void loadFamilyStatus(d.tasks as Task[]); } }
    } catch {
      /* non-fatal */
    }
  }

  // Draft keeps the task open.
  async function saveTaskDraft(id: string) {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "In Progress", completed: false }),
      });
      if (!res.ok) throw new Error("Failed");
      toastSuccess("Draft saved");
      await refreshActiveDeal();
    } catch {
      toastError("Could not save your draft. Please try again.");
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess("Copied");
    } catch {
      toastError("Could not copy");
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

  // Tab entries — "Purchase & Sale" deals expand into 2 separate tabs (one per
  // side) for the PRIMARY client. A co-person is party to only their one side,
  // so we emit just that side's tab (co-purchaser → Purchase, co-seller → Sale)
  // and never expose the other side.
  const tabEntries = properties.flatMap((p) => {
    const deal = p.deal_id ? deals.find((d) => d.id === p.deal_id) ?? null : null;
    if (deal?.type === "Purchase & Sale") {
      const restricted = p.recipient_side;
      const purchaseTab = {
        key: `${p.lead_id}:purchase`,
        lead_id: p.lead_id,
        side: "purchase" as "purchase" | "sale" | null,
        label: p.address_street,
        icon: Home,
      };
      const saleTab = {
        key: `${p.lead_id}:sale`,
        lead_id: p.lead_id,
        side: "sale" as "purchase" | "sale" | null,
        label: p.selling_address_street,
        icon: FileText,
      };
      if (restricted === "purchase") return [purchaseTab];
      if (restricted === "sale") return [saleTab];
      return [purchaseTab, saleTab];
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
  const heroPostal = showSale
    ? activeProperty?.selling_address_postal_code
    : activeProperty?.address_postal_code;
  const heroIsToronto = isTorontoAddress([heroAddress, heroPostal].filter(Boolean).join(", "));
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
  const visibleInactive = isBothDeal
    ? inactiveTasks.filter((t) => (t.side ?? null) === selectedSide)
    : inactiveTasks;

  // Milestones linked to a per-party task (Personal Info / Upload ID) must NOT
  // show complete until EVERY party's copy is done. The milestone's own task
  // count only reflects the primary's task, so it flips to "complete" the moment
  // the primary finishes their own section — even while a co-purchaser/co-seller
  // is still pending. Gate those milestones on the family roster's all_completed.
  const blockedMilestoneIds = new Set<string>();
  for (const t of visibleTasks) {
    if (!t.milestone_id || !isPerPartyTask(t.title) || t.spouse_name) continue;
    const fs = familyStatus[t.id];
    if (fs?.is_multi_party && !fs.all_completed) {
      blockedMilestoneIds.add(t.milestone_id);
    }
  }

  const closingFormatted = formatDateOnly(
    (showSale ? activeDeal?.selling_closing_date : null) ?? activeDeal?.closing_date ?? null,
    { month: "long", day: "numeric", year: "numeric" },
  );

  // Booked signing appointment, shown in the hero card. Office time (Toronto),
  // matching the booking page.
  const signingAppt = activeProperty?.signing_appointment ?? null;
  const signingWhen = signingAppt
    ? `${new Date(signingAppt.start_at).toLocaleDateString("en-CA", {
        timeZone: "America/Toronto",
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })} · ${new Date(signingAppt.start_at).toLocaleTimeString("en-CA", {
        timeZone: "America/Toronto",
        hour: "numeric",
        minute: "2-digit",
      })} ET`
    : null;

  // Parties for the active property. On a Purchase & Sale deal each side has its
  // own parties — the primary is on both; co-persons show only on their side
  // (co-purchasers on Purchase, co-sellers on Sale). Single-type deals show all.
  const allParties = activeProperty?.parties ?? [];
  const activeSide = isBothDeal ? selectedSide : dealTypeToSide(activeDeal?.type);
  const partyNoun =
    activeSide === "sale" ? "sellers" : activeSide === "purchase" ? "purchasers" : "parties";
  const partiesLabel = partyNoun.charAt(0).toUpperCase() + partyNoun.slice(1);
  const activeTaskHeading = activeTask
    ? taskDisplayTitle(activeTask.title, activeTask.side ?? activeSide)
    : "";
  const taskSubtitle = [
    isBothDeal ? (showSale ? "Sale" : "Purchase") : activeDeal?.type,
    activeDeal?.file_number,
  ]
    .filter(Boolean)
    .join(" · ");
  const visibleParties = isBothDeal
    ? allParties.filter(
        (p) =>
          p.role === "primary" ||
          p.role === (selectedSide === "purchase" ? "purchaser" : "seller")
      )
    : allParties;

  // ── Effective drawer inputs ──────────────────────────────
  // The drawer targets whichever person is selected in its on-behalf dropdown.
  // With no dropdown (behalfTargets empty) it falls back to the primary's own
  // active property, exactly as before.
  const activeBehalfTarget =
    behalfTargets.find((t) => t.lead_id === selectedBehalfLeadId) ?? null;
  // On-behalf = the selected person is someone OTHER than the logged-in user, so
  // their form must not be prefilled from the uploader's own data. Keyed off
  // is_self (not is_primary): the uploader may itself be a co-person.
  // A directTarget (set from the inline per-party accordion) wins over the
  // on-behalf dropdown and the primary's own defaults, so the drawer loads
  // exactly the party whose button was clicked.
  const isOnBehalf = directTarget
    ? !directTarget.is_self
    : activeBehalfTarget != null && !activeBehalfTarget.is_self;
  const drawerTaskId = directTarget?.task_id ?? activeBehalfTarget?.task_id ?? activeTask?.id ?? null;
  const drawerLeadId = directTarget?.lead_id ?? activeBehalfTarget?.lead_id ?? leadId ?? undefined;
  const drawerFirstName = directTarget?.first_name ?? activeBehalfTarget?.first_name ?? activeProperty?.first_name;
  const drawerLastName = directTarget?.last_name ?? activeBehalfTarget?.last_name ?? activeProperty?.last_name;

  // One roster per family, so the opened party's status names everyone. The
  // hold-title task has no roster of its own — borrow the deal's Personal Info one.
  const rosterTask =
    activeTask && isHoldTitleTask(activeTask.title)
      ? tasks.find(
          (t) =>
            t.deal_id === activeTask.deal_id &&
            isPersonalInfoTask(t.title) &&
            familyStatus[t.id],
        )
      : activeTask;
  // This side's names, from the Personal Info roster.
  const sidePersonalInfo = tasks.find(
    (t) =>
      isPersonalInfoTask(t.title) &&
      familyStatus[t.id] &&
      (!isBothDeal || (t.side ?? null) === selectedSide),
  );
  const rosterNames = (sidePersonalInfo ? familyStatus[sidePersonalInfo.id].members : [])
    .map((m) => m.name.trim())
    .filter(Boolean);
  const propertyDetailsNames = rosterNames.length
    ? rosterNames
    : [[activeProperty?.first_name, activeProperty?.last_name].filter(Boolean).join(" ")].filter(Boolean);

  const drawerPartyNames = (
    rosterTask ? (familyStatus[rosterTask.id]?.members ?? []) : []
  )
    .map((m) => m.name.trim())
    .filter(Boolean);

  // A co-person's task is already persisted + marked complete server-side by
  // /api/task-responses (keyed off the co-person's task_id). So on-behalf
  // submissions must NOT call markDone() (which would PATCH the primary's task
  // and refetch the primary's list); just close.
  function showSubmitted() {
    setSubmittedTitle(activeTaskHeading || "Task");
  }

  function handleDrawerCompleted(id: string, closeDrawer: () => void) {
    closeDrawer();
    showSubmitted();
    const wasOnBehalf = isOnBehalf;
    setDirectTarget(null);
    // Own task: markDone() PATCHes it and refetches (incl. family status). An
    // on-behalf co-person task is already completed server-side — just refresh
    // so the inline per-party accordion reflects the new completion.
    if (!wasOnBehalf) markDone(id);
    else void refreshActiveDeal();
  }

  return (
    <div className="space-y-5 pb-8">

      {/* ── Dynamic Task Drawer (DB-driven form fields) ── */}
      <DynamicTaskDrawer
        open={dynamicDrawerOpen}
        onClose={() => {
          setDynamicDrawerOpen(false);
          setDirectTarget(null);
        }}
        taskId={directTarget?.task_id ?? activeTask?.id ?? null}
        taskTitle={activeTask?.title ?? "Task Details"}
        heading={activeTaskHeading}
        leadId={leadId ?? undefined}
        clientFirstName={activeProperty?.first_name}
        clientLastName={activeProperty?.last_name}
        firmKey={activeProperty?.firm_key}
        side={activeTask?.side ?? dealTypeToSide(activeDeal?.type)}
        subtitle={taskSubtitle}
        onTaskCompleted={(id) =>
          handleDrawerCompleted(id, () => setDynamicDrawerOpen(false))
        }
      />

      {/* ── Deposit Funds Drawer (dedicated, standalone) ── */}
      <DepositFundsDrawer
        open={depositDrawerOpen}
        onClose={() => setDepositDrawerOpen(false)}
        taskId={activeTask?.id ?? null}
        taskTitle={activeTask?.title ?? "Deposit Funds Into Our Trust Account"}
        heading={activeTaskHeading}
        leadId={leadId ?? null}
        onTaskCompleted={(id) => {
          setDepositDrawerOpen(false);
          showSubmitted();
          markDone(id);
        }}
      />

      {/* ── Personal Information Drawer (dedicated, standalone) ── */}
      <PersonalInfoTaskDrawer
        open={personalInfoDrawerOpen}
        onClose={() => {
          setPersonalInfoDrawerOpen(false);
          setDirectTarget(null);
        }}
        taskId={drawerTaskId}
        taskTitle={activeTask?.title ?? "Provide Personal Information"}
        heading={activeTaskHeading}
        leadId={drawerLeadId}
        clientFirstName={drawerFirstName}
        clientLastName={drawerLastName}
        firmKey={activeProperty?.firm_key}
        onBehalf={isOnBehalf}
        behalfTargets={behalfTargets}
        selectedBehalfLeadId={selectedBehalfLeadId}
        onSelectBehalf={setSelectedBehalfLeadId}
        purchaseAddress={{
          street: activeProperty?.address_street ?? null,
          unit: activeProperty?.address_unit ?? null,
          city: activeProperty?.address_city ?? null,
          province: activeProperty?.address_province ?? null,
          postalCode: activeProperty?.address_postal_code ?? null,
        }}
        partyNames={drawerPartyNames}
        subtitle={
          activeTask &&
          familyStatus[activeTask.id]?.is_multi_party &&
          [drawerFirstName, drawerLastName].filter(Boolean).length
            ? `For ${[drawerFirstName, drawerLastName].filter(Boolean).join(" ")}`
            : taskSubtitle
        }
        onTaskCompleted={(id) =>
          handleDrawerCompleted(id, () => setPersonalInfoDrawerOpen(false))
        }
      />

      {/* ── Upload Identification Drawer (multi-file) ── */}
      <UploadIdentificationDrawer
        open={idDrawerOpen}
        onClose={() => {
          setIdDrawerOpen(false);
          setDirectTarget(null);
        }}
        leadId={drawerLeadId}
        taskId={drawerTaskId ?? undefined}
        clientFirstName={drawerFirstName}
        clientLastName={drawerLastName}
        spouseName={directTarget ? directTarget.spouse_name : activeTask?.spouse_name}
        partyStatuses={
          activeTask ? familyStatus[activeTask.id]?.members : undefined
        }
        onSaved={async () => {
          setIdDrawerOpen(false);
          showSubmitted();
          const wasOnBehalf = isOnBehalf;
          const tid = drawerTaskId;
          setDirectTarget(null);
          // On-behalf tasks are completed server-side; only the primary's own
          // task needs the dashboard-side markDone refresh. Either way refresh
          // so the inline per-party accordion reflects the new completion.
          if (!wasOnBehalf && tid) await markDone(tid);
          else await refreshActiveDeal();
        }}
      />

      {/* ── Confirm Property Details Modal ── */}
      <PropertyDetailsTaskModal
        open={propertyDetailsOpen}
        taskId={activeTask?.id ?? null}
        title={activeTask?.title ?? "Confirm your property details"}
        subtitle={taskSubtitle}
        clientNames={propertyDetailsNames}
        address={[heroAddress, heroPostal].filter(Boolean).join(" ")}
        priceLabel={activeSide === "sale" ? "Sale price" : "Purchase price"}
        price={showSale ? (activeDeal?.selling_price ?? null) : (activeDeal?.price ?? null)}
        deposit={
          showSale
            ? (activeProperty?.selling_deposit_amount ?? null)
            : (activeDeal?.deposit_amount ?? null)
        }
        closingDate={closingFormatted}
        propertyType={showSale ? null : (activeDeal?.building_type ?? null)}
        onClose={() => setPropertyDetailsOpen(false)}
        onSaved={(submitted) => {
          setPropertyDetailsOpen(false);
          if (submitted) showSubmitted();
          else toastSuccess("Draft saved");
          void refreshActiveDeal();
        }}
        onError={toastError}
      />

      {/* ── Signing Appointment Modal ── */}
      <SigningTaskModal
        open={signingOpen}
        taskId={activeTask?.id ?? null}
        dealId={activeDeal?.id ?? null}
        calendarName={activeProperty?.signing_calendar_name ?? null}
        title={activeTaskHeading || "Book your signing appointment"}
        subtitle={taskSubtitle}
        side={activeSide}
        closingDate={closingFormatted}
        onClose={() => setSigningOpen(false)}
        onSaved={(submitted) => {
          setSigningOpen(false);
          if (submitted) showSubmitted();
          else toastSuccess("Draft saved");
          void refreshActiveDeal();
        }}
        onError={toastError}
      />

      {/* ── Utilities (after closing) Modal ── */}
      <UtilitiesTaskModal
        open={utilitiesOpen}
        title={activeTaskHeading || "Close or transfer your utilities"}
        subtitle={taskSubtitle}
        city={
          heroIsToronto
            ? "Toronto"
            : ((showSale ? activeProperty?.selling_address_city : activeProperty?.address_city) ?? null)
        }
        onClose={() => setUtilitiesOpen(false)}
        onSaveDraft={async () => {
          if (!activeTask) return;
          await saveTaskDraft(activeTask.id);
          setUtilitiesOpen(false);
        }}
        onComplete={async () => {
          if (activeTask && (await markDone(activeTask.id))) {
            setUtilitiesOpen(false);
            showSubmitted();
          }
        }}
      />

      {activeProperty && (
        <ChatWidget
          name={[activeProperty.first_name, activeProperty.last_name].filter(Boolean).join(" ") || "Client"}
          email={activeProperty.email ?? null}
          fileNumber={activeDeal?.file_number ?? null}
          address={heroAddress}
        />
      )}

      <TaskSubmittedModal
        title={submittedTitle}
        subtitle={taskSubtitle}
        onClose={() => setSubmittedTitle(null)}
      />

      {/* ── Closing Cost Estimate Modal ── */}
      {estimateOpen && (
        <ClosingCostEstimateModal
          onClose={() => setEstimateOpen(false)}
          side={estimateSide}
        />
      )}

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
              <h1 className="ph-mask text-lg sm:text-2xl font-bold text-gray-900 leading-tight">
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
        <div className={`grid grid-cols-1 ${signingAppt ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"} divide-y sm:divide-y-0 sm:divide-x divide-gray-100 border-t border-gray-100`}>
          <div className="px-5 sm:px-6 py-4">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                Closing Date
              </p>
              <p className="text-sm font-bold text-gray-900">
                {propertyLoading ? "..." : closingFormatted}
              </p>
            </div>
          </div>

          <div className="px-5 sm:px-6 py-4">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                File Number
              </p>
              <p className="text-sm font-bold text-gray-900">
                {propertyLoading ? "..." : (activeDeal?.file_number ?? "Pending")}
              </p>
            </div>
          </div>

          {signingAppt && (
            <div className="px-5 sm:px-6 py-4 min-w-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                Signing Appointment
              </p>
              <p className="text-sm font-bold text-gray-900">{signingWhen}</p>
              <p className="text-xs text-gray-500">
                {signingAppt.appointment_type === "virtual" ? (
                  signingAppt.meet_link ? (
                    <>
                      Google Meet ·{" "}
                      <a
                        href={signingAppt.meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[#C10007] hover:underline"
                      >
                        Join
                      </a>
                    </>
                  ) : (
                    "Google Meet"
                  )
                ) : (
                  `In person${signingAppt.location ? ` · ${signingAppt.location}` : ""}`
                )}
              </p>
            </div>
          )}

          {/* Parties — primary + co-persons on this transaction */}
          <div className="px-5 sm:px-6 py-4 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
              {partiesLabel}
            </p>
            {propertyLoading ? (
              <p className="text-sm text-gray-400">...</p>
            ) : visibleParties.length === 0 ? (
              <p className="text-sm text-gray-400">—</p>
            ) : (
              <p className="ph-mask text-sm font-bold text-gray-900">
                {visibleParties.map(partyFullName).join(" & ")}
              </p>
            )}
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
            onMemberClick={handleMemberClick}
            familyStatus={familyStatus}
            partyNoun={partyNoun}
            inactiveTasks={visibleInactive}
            side={activeSide}
          />
          <CompletedTasksCard
            key={`completed:${activeLeadId ?? "no-active-lead"}:${selectedSide}`}
            tasks={visibleTasks}
            loading={tasksLoading}
            familyStatus={familyStatus}
            onTaskClick={handleTaskClick}
            onMemberClick={handleMemberClick}
            side={activeSide}
          />
          <AfterClosingCard
            tasks={visibleTasks}
            loading={tasksLoading}
            onTaskClick={handleTaskClick}
            side={activeSide}
          />
        </div>

        {/* ── Right: Status Overview + Need Assistance stacked (1/4) ── */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <StatusTimeline
            milestones={visibleMilestones}
            blockedMilestoneIds={blockedMilestoneIds}
            loading={milestonesLoading}
            side={activeSide === "sale" ? "sale" : "purchase"}
          />

          {/* ── Estimate your closing cost — dev deploys only ──
              Gated by SHOW_CLOSING_COST_ESTIMATE so this code can live on main
              without appearing on the production portal. See
              src/lib/featureFlags.ts to flip it on for production. */}
          {SHOW_CLOSING_COST_ESTIMATE && (
            <ClosingCostEstimateCard
              onEstimate={() => setEstimateOpen(true)}
              locked={!apsUploaded}
              kind={estimateSide}
            />
          )}

          {/* ── Your team ── */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-col gap-3">
            <h3 className="text-sm font-bold text-gray-900">Your team</h3>
            {PORTAL_TEAM.map((m) => (
              <div key={m.role} className="flex items-center gap-3">
                <div className="w-[34px] h-[34px] rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {teamInitials(m.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">{m.role}</p>
                  <p className="text-sm font-bold text-gray-900">{m.name}</p>
                  {m.email && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <a href={`mailto:${m.email}`} className="font-semibold text-[#C10007] hover:underline">
                        {m.email}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(m.email!)}
                        className="cursor-pointer rounded border border-gray-200 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                        aria-label="Copy email"
                      >
                        <Copy size={11} />
                      </button>
                      {m.phone && (
                        <>
                          <span className="h-3 w-px bg-gray-200" aria-hidden />
                          <a href={`tel:${m.phone.replace(/\D/g, "")}`} className="font-semibold !text-gray-900 hover:underline">
                            {m.phone}
                          </a>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-2.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
              General inquiries
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <a
                href={`mailto:${activeFirm.supportEmail}`}
                className="font-semibold text-[#C10007] hover:underline break-all"
              >
                {activeFirm.supportEmail}
              </a>
              <button
                type="button"
                onClick={() => copyToClipboard(activeFirm.supportEmail)}
                className="cursor-pointer rounded border border-gray-200 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                aria-label="Copy email"
              >
                <Copy size={11} />
              </button>
              <span className="h-3 w-px bg-gray-200" aria-hidden />
              <a href={`tel:${activeFirm.supportPhone}`} className="font-semibold !text-gray-900 hover:underline">
                {activeFirm.supportPhone}
              </a>
            </div>
            </div>
          </div>
        </div>{/* end right column */}
      </div>{/* end main grid */}
    </div>
  );
}
