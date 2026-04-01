function getSessionId(): string {
  let id = sessionStorage.getItem("capsule-session-id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("capsule-session-id", id);
  }
  return id;
}

export async function* streamChat(content: string): AsyncGenerator<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-ID": getSessionId(),
    },
    body: JSON.stringify({ content }),
  });

  if (!res.ok || !res.body) throw new Error("Failed to connect to server");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data) as { text: string };
        yield parsed.text;
      } catch {
        // skip malformed lines
      }
    }
  }
}
