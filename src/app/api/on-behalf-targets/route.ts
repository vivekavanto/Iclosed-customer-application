import { NextResponse } from "next/server";
import { getAuthClient } from "@/lib/getAuthClient";
import { getFamilyTaskRoster, FamilyTaskMember } from "@/lib/familyTaskTargets";
import { getFamilyUploadMode } from "@/lib/getFamilyUploadMode";

export const dynamic = "force-dynamic";

/**
 * GET /api/on-behalf-targets?task_id=<taskId>
 *
 * Given a task the authenticated user is about to act on (Upload Identification /
 * Provide Personal Information), returns the list of people they may submit it
 * for: themselves PLUS every other member of the same transaction "family" whose
 * own deal has the equivalent task (same template / same title + side).
 *
 * WHO gets the full roster (and therefore the multi-party drawer) depends on the
 * primary's "Who will be uploading your documents?" answer (leads.upload_mode):
 *   • "me" / "co" → only the family's DESIGNATED UPLOADER (determined by
 *     `leads.upload_mode` and `leads.upload_consent_uploader_lead_id`) — the
 *     primary for "Me", the chosen co-person for "My co-purchaser".
 *   • "both"      → EVERY family member (anyone can act for anyone).
 * Anyone not entitled gets a single (self-only) target so the drawer shows just
 * their own section.
 *
 * Security: the opened task must belong to a deal owned by the caller
 * (`deal.client_id === client.id`); family members are resolved strictly via the
 * shared primary id inside getFamilyTaskRoster — never from client-supplied ids.
 */
export async function GET(req: Request) {
  try {
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id");
    if (!taskId) {
      return NextResponse.json({ success: false, error: "task_id is required" }, { status: 400 });
    }

    const roster = await getFamilyTaskRoster(taskId);
    if (!roster) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    // Ownership guard — the caller must own the deal this task belongs to.
    if (roster.deal.client_id !== client.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // Drop the `completed` field from the wire shape — the dropdown only needs the
    // identity of each target, not its progress (that's family-task-status's job).
    const toTarget = (m: FamilyTaskMember) => ({
      lead_id: m.lead_id,
      task_id: m.task_id,
      first_name: m.first_name,
      last_name: m.last_name,
      role_label: m.role_label,
      is_primary: m.is_primary,
      is_self: m.is_self,
    });

    const selfTarget = toTarget(roster.members.find((m) => m.is_self)!);
    const otherTargets = roster.members
      .filter((m) => !m.is_self && m.task_id != null)
      .map(toTarget);

    // "both" → anyone in the family may act for anyone, so every member gets the
    // full roster. Otherwise only the designated uploader does; everyone else
    // (including the primary when they delegated) submits only for themselves.
    const mode = await getFamilyUploadMode(roster.selfLeadId);
    const callerMayActForOthers =
      mode === "both" || roster.uploaderLeadId === roster.selfLeadId;

    if (!callerMayActForOthers) {
      return NextResponse.json({ success: true, enabled: false, targets: [selfTarget] });
    }

    return NextResponse.json({
      success: true,
      enabled: otherTargets.length > 0,
      targets: [selfTarget, ...otherTargets],
    });
  } catch (err) {
    console.error("GET /api/on-behalf-targets error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
