export async function* streamChat(
  message: string,
  sessionId: string = "default"
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
  });

  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.trim().split("\n");
      let event = "message";
      let dataStr = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) dataStr = line.slice(6);
      }

      if (dataStr) {
        try {
          yield { event, data: JSON.parse(dataStr) };
        } catch {
          // malformed chunk — skip
        }
      }
    }
  }
}

export interface Capture {
  id: number;
  capture_type: string;
  completion_type: string;
  content: string;
  summary: string;
  metadata: Record<string, unknown>;
  status: string;
  deadline: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getCaptures(): Promise<Capture[]> {
  const res = await fetch("/api/captures");
  if (!res.ok) throw new Error("Failed to fetch captures");
  return res.json();
}

export async function updateCaptureStatus(id: number, status: string): Promise<void> {
  await fetch(`/api/captures/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function updateCaptureStage(id: number, stage: string): Promise<void> {
  await fetch(`/api/captures/${id}/stage`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });
}

export async function scheduleCapture(
  id: number,
  deadline: string | null,
  time: string | null,
  durationMins: number | null,
): Promise<void> {
  await fetch(`/api/captures/${id}/schedule`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deadline, time, duration_mins: durationMins }),
  });
}

export async function sprintPreview(id: number, count: number): Promise<string[]> {
  const res = await fetch(`/api/captures/${id}/sprint-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) return Array.from({ length: count }, (_, i) => `Session ${i + 1}`);
  const data = await res.json();
  return data.names as string[];
}

export async function createSprints(
  id: number,
  count: number,
  durationMins: number,
  startDate: string,
  startTime: string,
): Promise<{ sprint_ids: number[]; count: number }> {
  const res = await fetch(`/api/captures/${id}/sprints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      count,
      duration_mins: durationMins,
      start_date: startDate,
      start_time: startTime,
      use_ai_names: true,
    }),
  });
  if (!res.ok) throw new Error("Failed to create sprints");
  return res.json();
}

export async function deferCapture(id: number, deferTo?: string): Promise<void> {
  await fetch(`/api/captures/${id}/defer`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deferTo ? { defer_to: deferTo } : {}),
  });
}

export async function getCapture(id: number): Promise<Capture> {
  const res = await fetch(`/api/captures/${id}`);
  if (!res.ok) throw new Error("Capture not found");
  return res.json();
}

export async function updateNotes(id: number, notes: string): Promise<void> {
  await fetch(`/api/captures/${id}/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
}

export async function organizeNotes(id: number): Promise<string> {
  const res = await fetch(`/api/captures/${id}/organize`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to organize");
  const data = await res.json();
  return data.notes as string;
}

export async function generateIdeaTasks(id: number): Promise<number> {
  const res = await fetch(`/api/captures/${id}/tasks`, { method: "POST" });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count ?? 0;
}
