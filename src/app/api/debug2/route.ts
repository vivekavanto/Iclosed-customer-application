import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  const { data: clients } = await supabaseAdmin.from("clients").select("*").eq("email", "madhanv263@gmail.com").single();
  const { data: deals } = await supabaseAdmin.from("deals").select("*").eq("client_id", clients?.id).single();
  const { data: tasks } = await supabaseAdmin.from("tasks").select("*").eq("deal_id", deals?.id);
  const { data: milestones } = await supabaseAdmin.from("milestones").select("*").eq("deal_id", deals?.id);
  
  return NextResponse.json({ clients, deals, tasks, milestones });
}

