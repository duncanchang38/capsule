export const TYPE_CONFIG = {
  to_hit:   { label: "To Hit",   sourceLabel: "Tasks",     displayLabel: "Task",     color: "#f97316", bgClass: "bg-orange-100 text-orange-700", doneLabel: "Done",     doneStatus: "done" },
  to_learn: { label: "To Learn", sourceLabel: "Reading",   displayLabel: "Reading",  color: "#10b981", bgClass: "bg-emerald-100 text-emerald-700", doneLabel: "Absorbed", doneStatus: "absorbed" },
  to_cook:  { label: "To Cook",  sourceLabel: "Ideas",     displayLabel: "Idea",     color: "#ec4899", bgClass: "bg-pink-100 text-pink-700",     doneLabel: "Done",     doneStatus: "done" },
  to_know:  { label: "To Know",  sourceLabel: "Questions", displayLabel: "Question", color: "#8b5cf6", bgClass: "bg-violet-100 text-violet-700", doneLabel: "Answered", doneStatus: "answered" },
  calendar: { label: "Event",    sourceLabel: "Events",    displayLabel: "Event",    color: "#3b82f6", bgClass: "bg-blue-50 text-blue-600",     doneLabel: "Done",     doneStatus: "done" },
  project:  { label: "Project",  sourceLabel: "Projects",  displayLabel: "Project",  color: "#6366f1", bgClass: "bg-indigo-50 text-indigo-600", doneLabel: "Done",     doneStatus: "done" },
} as const;

export type CaptureType = keyof typeof TYPE_CONFIG;
