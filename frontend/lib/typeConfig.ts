export const TYPE_CONFIG = {
  to_hit:   { label: "To Hit",   sourceLabel: "Tasks",     displayLabel: "Task",     color: "#f97316", bgClass: "bg-orange-100 text-orange-700", doneLabel: "Done",     doneStatus: "done" },
  to_learn: { label: "To Learn", sourceLabel: "Learning",  displayLabel: "Learning", color: "#10b981", bgClass: "bg-blue-100 text-blue-700",    doneLabel: "Absorbed", doneStatus: "absorbed" },
  to_cook:  { label: "To Cook",  sourceLabel: "Ideas",     displayLabel: "Idea",     color: "#ec4899", bgClass: "bg-purple-100 text-purple-700", doneLabel: "Done",     doneStatus: "done" },
  to_know:  { label: "To Know",  sourceLabel: "Questions", displayLabel: "Question", color: "#8b5cf6", bgClass: "bg-green-100 text-green-700",  doneLabel: "Answered", doneStatus: "answered" },
  calendar: { label: "Event",    sourceLabel: "Events",    displayLabel: "Event",    color: "#3b82f6", bgClass: "bg-blue-50 text-blue-600",     doneLabel: "Done",     doneStatus: "done" },
} as const;

export type CaptureType = keyof typeof TYPE_CONFIG;
