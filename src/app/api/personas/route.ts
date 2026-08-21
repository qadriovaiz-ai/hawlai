import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { AGENT_PERSONAS, CHANNEL_DEFAULT_PERSONA, PERSONA_CHANNEL_LABELS, type PersonaChannel, type PersonaKey } from "@/lib/agents/personas";

const VALID_CHANNELS = Object.keys(CHANNEL_DEFAULT_PERSONA) as PersonaChannel[];
const VALID_PERSONAS = Object.keys(AGENT_PERSONAS) as PersonaKey[];

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: rows } = await supabase
    .from("agent_persona_settings")
    .select("channel, persona")
    .eq("dealership_id", dealershipId);

  const assignedByChannel = new Map((rows ?? []).map((r: any) => [r.channel, r.persona]));

  return NextResponse.json({
    channels: VALID_CHANNELS.map((channel) => ({
      channel,
      label: PERSONA_CHANNEL_LABELS[channel],
      persona: assignedByChannel.get(channel) ?? CHANNEL_DEFAULT_PERSONA[channel],
      isDefault: !assignedByChannel.has(channel),
    })),
    personas: VALID_PERSONAS.map((key) => ({
      key,
      label: AGENT_PERSONAS[key].label,
      description: AGENT_PERSONAS[key].description,
    })),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { channel, persona } = await request.json();
  if (!VALID_CHANNELS.includes(channel)) return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  if (!VALID_PERSONAS.includes(persona)) return NextResponse.json({ error: "Invalid persona" }, { status: 400 });

  // RLS (agent_persona_settings_owner_all) already scopes this to a
  // dealership the user owns — the regular client is enough.
  const { error } = await supabase
    .from("agent_persona_settings")
    .upsert({ dealership_id: dealershipId, channel, persona, updated_at: new Date().toISOString() }, { onConflict: "dealership_id,channel" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
