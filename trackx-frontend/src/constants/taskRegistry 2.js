export const TASK_STAGES = {
  metadata: {
    label: "Metadata",
    commands: [
      { id: "create", label: "Create" },
      { id: "update", label: "Update" },
      { id: "review", label: "Review" },
    ],
    areas: {
      caseInformation: {
        label: "Case Information",
        commands: ["create", "update", "review"],
        route: "/edit-case",
        highlightId: "task-target-metadata-case",
      },
      evidenceLocker: {
        label: "Evidence Locker",
        commands: ["update", "review"],
        route: "/edit-case",
        highlightId: "task-target-metadata-evidence",
      },
    },
  },
  annotations: {
    label: "Annotations",
    commands: [
      { id: "complete", label: "Complete" },
      { id: "update", label: "Update" },
      { id: "review", label: "Review" },
      { id: "capture", label: "Capture" },
    ],
    areas: {
      annotation: {
        label: "Annotation",
        commands: ["complete", "update", "review"],
        route: "/annotations",
        highlightId: "task-target-annotation-form",
        requiresLocation: true,
      },
      imagery: {
        label: "Imagery",
        commands: ["capture", "review"],
        route: "/annotations",
        highlightId: "task-target-annotation-imagery",
        requiresLocation: true,
      },
      reportInclusion: {
        label: "Report Inclusion",
        commands: ["update", "review"],
        route: "/annotations",
        highlightId: "task-target-annotation-report",
        requiresLocation: true,
      },
    },
  },
  overview: {
    label: "Overview",
    commands: [
      { id: "write", label: "Write" },
      { id: "edit", label: "Edit" },
      { id: "review", label: "Review" },
      { id: "generate", label: "Generate" },
    ],
    areas: {
      introduction: {
        label: "Introduction",
        commands: ["write", "edit", "review"],
        route: "/overview",
        highlightId: "task-target-overview-intro",
      },
      conclusion: {
        label: "Conclusion",
        commands: ["write", "edit", "review"],
        route: "/overview",
        highlightId: "task-target-overview-conclusion",
      },
      evidence: {
        label: "Evidence Locker",
        commands: ["review", "edit"],
        route: "/overview",
        highlightId: "task-target-overview-evidence",
      },
      glossary: {
        label: "Glossary",
        commands: ["review", "edit"],
        route: "/overview",
        highlightId: "task-target-overview-glossary",
      },
      export: {
        label: "Export",
        commands: ["generate", "review"],
        route: "/overview",
        highlightId: "task-target-overview-export",
      },
    },
  },
};

export const getStageConfig = (stageId) => TASK_STAGES[stageId] || null;

export const getCommandOptions = (stageId) => {
  const stage = getStageConfig(stageId);
  return stage ? stage.commands : [];
};

export const getAreaOptions = (stageId, commandId) => {
  const stage = getStageConfig(stageId);
  if (!stage) return [];
  return Object.entries(stage.areas)
    .filter(([, area]) => !commandId || area.commands.includes(commandId))
    .map(([id, area]) => ({ id, ...area }));
};

export const buildTaskTitle = ({ stageId, commandId, areaId, locationLabel }) => {
  const stage = getStageConfig(stageId);
  if (!stage) return "";
  const command = stage.commands.find((item) => item.id === commandId);
  const area = stage.areas[areaId];
  if (!command || !area) return "";
  const base = `${command.label} ${area.label}`;
  if (locationLabel) {
    return `${base} – ${locationLabel}`;
  }
  return base;
};
