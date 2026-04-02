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
