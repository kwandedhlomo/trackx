import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  Send,
  Users,
  AtSign,
  Edit3,
  ArrowUpRight,
  Plus,
  CheckCircle2,
  User,
  Trash2,
  StickyNote,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "../components/NotificationBell";
import {
  subscribeToCaseTasks,
  createCaseTask,
  updateCaseTask,
  toggleCaseTaskCompletion,
  deleteCaseTask,
} from "../services/firebaseServices";
import {
  TASK_STAGES,
  getCommandOptions,
  getAreaOptions,
  buildTaskTitle,
  getStageConfig,
} from "../constants/taskRegistry";
import { setTaskHook } from "../utils/taskHooks";

const API_BASE_URL = "http://localhost:8000";

const INITIAL_TASK_BUILDER_STATE = {
  stage: "",
  command: "",
  area: "",
  locationIndex: "",
  assignee: "anyone",
  note: "",
};

const buildHandleParts = (rawValue, fallback) => {
  const base = (rawValue || fallback || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const slug = base || "user";
  return { handle: `@${slug}`, slug };
};

const formatTimestamp = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    return new Date(value).toLocaleString();
  }
  if (value.toDate) {
    return value.toDate().toLocaleString();
  }
  return "";
};

const highlightMentions = (text) => {
  if (!text) return null;
  const segments = text.split(/(@[^\s@]+)/g);
  return segments.map((segment, index) => {
    if (segment.startsWith("@")) {
      return (
        <span key={`${segment}-${index}`} className="font-semibold text-blue-200">
          {segment}
        </span>
      );
    }
    const lines = segment.split("\n");
    return lines.map((line, lineIndex) => (
      <span key={`line-${index}-${lineIndex}`}>
        {line}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    ));
  });
};

function CaseCollaborationPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  const [caseData, setCaseData] = useState(null);
const [collaborators, setCollaborators] = useState([]);
const [comments, setComments] = useState([]);
const [message, setMessage] = useState("");
const [loadingCase, setLoadingCase] = useState(true);
const [loadingComments, setLoadingComments] = useState(true);
const [sending, setSending] = useState(false);
const [caseError, setCaseError] = useState("");
const [error, setError] = useState("");
const [commentError, setCommentError] = useState("");
const [selectedMentions, setSelectedMentions] = useState([]);
const [notifyAllSelected, setNotifyAllSelected] = useState(false);
const [mentionQuery, setMentionQuery] = useState(null);
const [mentionStart, setMentionStart] = useState(null);
const [mentionCaret, setMentionCaret] = useState(null);
const [pendingHighlightId, setPendingHighlightId] = useState(null);
const [highlightTarget, setHighlightTarget] = useState(null);
const textareaRef = useRef(null);

const currentUserId = auth.currentUser?.uid;
const isAdmin = profile?.role === "admin";
const [tasks, setTasks] = useState([]);
const [tasksLoading, setTasksLoading] = useState(true);
const [taskError, setTaskError] = useState("");
const [creatingTask, setCreatingTask] = useState(false);
const [builderState, setBuilderState] = useState(() => ({
  ...INITIAL_TASK_BUILDER_STATE,
}));

const loadComments = useCallback(async () => {
  if (!caseId) {
    return;
  }
  setLoadingComments(true);
  try {
    const response = await axios.get(`${API_BASE_URL}/cases/${caseId}/comments`, {
      params: { limit: 200 },
    });
    setComments(response.data?.comments || []);
    setCommentError("");
  } catch (err) {
    console.error("Failed to load comments:", err);
    setCommentError("We couldn't load the comments right now.");
  } finally {
    setLoadingComments(false);
  }
}, [caseId]);

useEffect(() => {
  const targetId = location.state?.highlightCommentId;
  if (targetId) {
    setPendingHighlightId(targetId);
    navigate(location.pathname + location.search, {
      replace: true,
      state: {},
    });
  }
}, [location.state?.highlightCommentId, location.pathname, location.search, navigate]);

useEffect(() => {
  if (!pendingHighlightId) {
    return;
  }
  const exists = comments.some((comment) => comment.id === pendingHighlightId);
  if (!exists) {
    return;
  }
  const nonce = Date.now();
  setHighlightTarget({ id: pendingHighlightId, nonce });
  setPendingHighlightId(null);
  const timer = setTimeout(() => {
    setHighlightTarget((current) =>
      current && current.nonce === nonce ? null : current
    );
  }, 5000);
  return () => clearTimeout(timer);
}, [pendingHighlightId, comments]);

useEffect(() => {
  if (!highlightTarget?.id) {
    return;
  }
  const element = document.getElementById(`collab-comment-${highlightTarget.id}`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}, [highlightTarget]);

  const uniqueUserIds = (payload) => {
    if (!payload) return [];
    const collected = [];
    const listCandidates = [payload.userIds, payload.userIDs];
    listCandidates.forEach((list) => {
      if (Array.isArray(list)) {
        list.forEach((uid) => {
          if (uid && !collected.includes(uid)) {
            collected.push(uid);
          }
        });
      }
    });

    const primaryCandidates = [payload.userId, payload.userID];
    primaryCandidates.forEach((uid) => {
      if (uid && !collected.includes(uid)) {
        collected.unshift(uid);
      }
    });

    return collected;
  };

  const fetchCaseDetails = useCallback(async () => {
    if (!caseId || !db) {
      return;
    }
    setLoadingCase(true);
    setCaseError("");
    try {
      const caseRef = doc(db, "cases", caseId);
      const snapshot = await getDoc(caseRef);
      if (!snapshot.exists()) {
        setCaseError("Case not found or you no longer have access.");
        setCaseData(null);
        setSelectedMentions([]);
        setNotifyAllSelected(false);
        return;
      }
      const data = snapshot.data() || {};
      const participantIds = uniqueUserIds(data);
      const ownerId = data.userId || data.userID || participantIds[0] || null;
      const normalizedCase = {
        ...data,
        userIds: participantIds,
        userId: ownerId,
        ownerId,
        isShared: typeof data.isShared === "boolean" ? data.isShared : participantIds.length > 1,
        dateOfIncident: formatTimestamp(data.dateOfIncident),
      };
      delete normalizedCase.userIDs;
      delete normalizedCase.userID;
      setCaseData({ ...normalizedCase, doc_id: caseId });
      setSelectedMentions([]);
      setNotifyAllSelected(false);
      resetMentionDraftState();

      if (participantIds.length === 0) {
        setCollaborators([]);
        return;
      }

      const response = await axios.post(`${API_BASE_URL}/admin/users/lookup`, {
        user_ids: participantIds,
      });
      const fetchedUsers = response.data?.users || [];
      const handleCounts = {};
      const enriched = participantIds.map((id) => {
        const match = fetchedUsers.find((user) => user.id === id) || {};
        const displayName =
          match.name?.trim() ||
          match.email ||
          (id === currentUserId ? "You" : id);
        const handleParts = buildHandleParts(displayName, id);
        const baseHandle = handleParts.handle;
        const count = handleCounts[baseHandle] || 0;
        handleCounts[baseHandle] = count + 1;
        const handle = count === 0 ? baseHandle : `${baseHandle}${count + 1}`;
        const slug = handle.replace(/^@+/, "");
        return {
          id,
          name: displayName,
          email: match.email || "",
          handle,
          slug,
        };
      });
      setCollaborators(enriched);
    } catch (err) {
      console.error("Failed to load case details:", err);
      setCaseError("We could not load the case details. Please try again.");
      setSelectedMentions([]);
      setNotifyAllSelected(false);
    } finally {
      setLoadingCase(false);
    }
  }, [caseId, currentUserId]);

useEffect(() => {
  fetchCaseDetails();
}, [fetchCaseDetails]);

useEffect(() => {
  loadComments();
}, [loadComments]);

const resetTaskBuilder = () => {
  setBuilderState(() => ({ ...INITIAL_TASK_BUILDER_STATE }));
  setTaskError("");
};

const handleBuilderChange = (field, value) => {
  setBuilderState((prev) => {
    const next = { ...prev, [field]: value };
    if (field === "stage") {
      next.command = "";
      next.area = "";
      next.locationIndex = "";
    }
    if (field === "command") {
      next.area = "";
      next.locationIndex = "";
    }
    if (field === "area") {
      next.locationIndex = "";
    }
    return next;
  });
};

const handleBuilderAssigneeChange = (value) => {
  setBuilderState((prev) => ({ ...prev, assignee: value }));
};

const handleCreateTask = async (event) => {
  event.preventDefault();
  if (!caseId || !canCreateTask) {
    return;
  }
  try {
    setCreatingTask(true);
    setTaskError("");
    const rawLocationIndex = requiresLocation
      ? Number(
          selectedLocation?.index ?? builderState.locationIndex ?? null
        )
      : null;
    const locationIndex =
      Number.isInteger(rawLocationIndex) && rawLocationIndex >= 0
        ? rawLocationIndex
        : null;
    const locationLabel =
      selectedLocation?.display ||
      (Number.isInteger(rawLocationIndex) && rawLocationIndex >= 0
        ? locationOptions.find((option) => option.index === rawLocationIndex)?.display || null
        : null);
    const title = buildTaskTitle({
      stageId: builderState.stage,
      commandId: builderState.command,
      areaId: builderState.area,
      locationLabel,
    });
    const stageConfig = getStageConfig(builderState.stage);
    const areaConfig = stageConfig?.areas?.[builderState.area];
    const commandConfig = stageConfig?.commands?.find(
      (cmd) => cmd.id === builderState.command
    );
    const assigneeId =
      builderState.assignee && builderState.assignee !== "anyone"
        ? builderState.assignee
        : null;
    const assigneeDisplay = assigneeId
      ? collaboratorMap[assigneeId]?.displayName || assigneeId
      : null;
    const trimmedNote = builderState.note.trim();

    await createCaseTask(caseId, {
      caseId,
      stage: builderState.stage,
      stageLabel: stageConfig?.label || builderState.stage,
      command: builderState.command,
      commandLabel: commandConfig?.label || builderState.command,
      area: builderState.area,
      areaLabel: areaConfig?.label || builderState.area,
      title,
      locationIndex,
      locationLabel,
      route: areaConfig?.route || null,
      highlightId: areaConfig?.highlightId || null,
      assignedTo: assigneeId,
      assignedDisplayName: assigneeDisplay,
      allowAnyone: !assigneeId,
      createdBy: currentUserId || null,
      createdByName: profile?.name || profile?.email || "Admin",
      status: "pending",
      note: trimmedNote || null,
    });
    resetTaskBuilder();
  } catch (err) {
    console.error("Failed to create case task:", err);
    setTaskError("Unable to create task. Please try again.");
  } finally {
    setCreatingTask(false);
  }
};

const handleTaskAssigneeUpdate = async (task, value) => {
  if (!caseId || !task?.id) {
    return;
  }
  try {
    setTaskError("");
    const isAnyone = value === "anyone";
    const assigneeId = isAnyone ? null : value;
    const updates = {
      assignedTo: assigneeId,
      allowAnyone: isAnyone,
      assignedDisplayName: assigneeId
        ? collaboratorMap[assigneeId]?.displayName || assigneeId
        : null,
    };
    await updateCaseTask(caseId, task.id, updates);
  } catch (err) {
    console.error("Failed to update assignee:", err);
    setTaskError("Unable to update task assignment.");
  }
};

const handleToggleTaskCompletion = async (task) => {
  if (!caseId || !task?.id) {
    return;
  }
  try {
    setTaskError("");
    const shouldComplete = task.status !== "completed";
    await toggleCaseTaskCompletion({
      caseId,
      taskId: task.id,
      complete: shouldComplete,
      userId: currentUserId,
    });
  } catch (err) {
    console.error("Failed to toggle task completion:", err);
    setTaskError("Unable to update task status.");
  }
};

const handleDeleteTask = async (task) => {
  if (!caseId || !task?.id) {
    return;
  }
  try {
    setTaskError("");
    await deleteCaseTask(caseId, task.id);
  } catch (err) {
    console.error("Failed to clear task:", err);
    setTaskError("Unable to clear task. Please try again.");
  }
};

const handleOpenTask = (task) => {
  if (!task) return;
  const stageConfig = getStageConfig(task.stage);
  let areaKey = task.area;
  if (stageConfig && !stageConfig?.areas?.[areaKey]) {
    if (task.stage === "metadata") {
      areaKey = areaKey === "evidenceLocker" ? "evidenceLocker" : "caseInformation";
    }
  }
  const areaConfig = stageConfig?.areas?.[areaKey];
  const route = task.route || areaConfig?.route;
  const highlightId = areaConfig?.highlightId || task.highlightId;
  const payload = {
    stage: task.stage,
    command: task.command,
    area: areaKey,
    highlightId,
    locationIndex:
      typeof task.locationIndex === "number" ? task.locationIndex : null,
    taskId: task.id,
    caseId,
  };

  if (!route) {
    return;
  }

  setTaskHook(payload);
  sessionStorage.setItem("trackxTaskForceCaseId", caseId);
  localStorage.setItem("trackxCurrentCaseId", caseId);

  if (route === "/edit-case") {
    navigate("/edit-case", {
      state: { caseData: { ...(caseData || {}), doc_id: caseId }, fromTaskId: task.id },
    });
    return;
  }

  if (route === "/annotations") {
    sessionStorage.setItem("trackxIgnoreLocalCaseData", "1");
    if (typeof payload.locationIndex === "number") {
      localStorage.setItem(
        "trackxCurrentLocationIndex",
        String(payload.locationIndex)
      );
    }
    navigate("/annotations", { state: { caseId } });
    return;
  }

  if (route === "/overview") {
    navigate("/overview", { state: { caseId } });
  }
};

useEffect(() => {
  if (!caseId) {
    return;
  }
  setTasksLoading(true);
  setTaskError("");
  const unsubscribe = subscribeToCaseTasks(caseId, (incoming) => {
    setTasks(incoming || []);
    setTasksLoading(false);
  });
  return () => {
    unsubscribe?.();
  };
}, [caseId]);

  const resetMentionDraftState = () => {
    setMentionQuery(null);
    setMentionStart(null);
    setMentionCaret(null);
  };

  const handleQuickMention = (collab) => {
    if (!collab) {
      return;
    }
    resetMentionDraftState();
    setSelectedMentions((prev) => {
      if (prev.some((item) => item.id === collab.id)) {
        return prev;
      }
      return [...prev, collab];
    });
  };

  const handleMessageChange = (event) => {
    const { value, selectionStart } = event.target;
    setMessage(value);
    setMentionCaret(selectionStart);
    const uptoCaret = value.slice(0, selectionStart);
    const match = uptoCaret.match(/@([A-Za-z0-9_-]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(selectionStart - match[0].length);
    } else {
      resetMentionDraftState();
    }
  };

  const handleTextareaSelect = (event) => {
    const selectionStart = event.target.selectionStart;
    setMentionCaret(selectionStart);
    const value = event.target.value;
    const uptoCaret = value.slice(0, selectionStart);
    const match = uptoCaret.match(/@([A-Za-z0-9_-]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(selectionStart - match[0].length);
    } else {
      resetMentionDraftState();
    }
  };

  const availableMentionOptions = useMemo(() => {
    if (mentionQuery === null) {
      return [];
    }
    const lowerQuery = mentionQuery.toLowerCase();
    const options = [];
  if (!notifyAllSelected && "all".startsWith(lowerQuery)) {
    options.push({ id: "ALL", label: "@All", type: "all" });
  }
  collaborators.forEach((collab) => {
    if (selectedMentions.some((item) => item.id === collab.id)) {
      return;
    }
    if (collab.slug?.toLowerCase().includes(lowerQuery) || collab.handle.toLowerCase().includes(lowerQuery)) {
      options.push({ id: collab.id, label: `@${collab.slug}`, type: "user", collaborator: collab });
    }
  });
    return options.slice(0, 5);
  }, [mentionQuery, collaborators, selectedMentions, notifyAllSelected]);

  const collaboratorMap = useMemo(() => {
    const map = {};
    collaborators.forEach((collab) => {
      map[collab.id] = {
        displayName: collab.name || collab.handle,
        handle: collab.handle,
      };
    });
    return map;
  }, [collaborators]);

  const locationOptions = useMemo(() => {
    if (!caseData) return [];
    const titles = Array.isArray(caseData.locationTitles)
      ? caseData.locationTitles
      : [];
    const locations = Array.isArray(caseData.locations) ? caseData.locations : [];
    const total = Math.max(
      titles.length,
      locations.length,
      typeof caseData.locationsCount === "number" ? caseData.locationsCount : 0
    );
    return Array.from({ length: total }, (_, index) => {
      const baseTitle = titles[index];
      const fallbackTitle =
        locations[index]?.title || locations[index]?.name || null;
      const label = baseTitle?.trim()
        ? baseTitle.trim()
        : fallbackTitle?.trim()
        ? fallbackTitle.trim()
        : `Location ${index + 1}`;
      return {
        value: String(index),
        index,
        label,
        display: `${index + 1}. ${label}`,
      };
    });
  }, [caseData]);

  const builderStageConfig = builderState.stage
    ? getStageConfig(builderState.stage)
    : null;
  const commandOptions = builderState.stage
    ? getCommandOptions(builderState.stage)
    : [];
  const areaOptions = builderState.stage
    ? getAreaOptions(builderState.stage, builderState.command)
    : [];
  const selectedArea = builderState.stage
    ? builderStageConfig?.areas?.[builderState.area] || null
    : null;
  const requiresLocation = !!selectedArea?.requiresLocation;
  const selectedLocation = requiresLocation
    ? locationOptions.find((item) => item.value === builderState.locationIndex)
    : null;
  const commandLabel = builderState.command
    ? commandOptions.find((cmd) => cmd.id === builderState.command)?.label ||
      builderState.command
    : "";
  const stageLabel = builderStageConfig?.label || "";
  const areaLabel = selectedArea?.label || "";
  const canCreateTask =
    !!builderState.stage &&
    !!builderState.command &&
    !!selectedArea &&
    (!requiresLocation || !!selectedLocation);

  const displayedTasks = useMemo(() => {
    return (tasks || [])
      .map((task) => {
        const stageConfig = getStageConfig(task.stage);
        let areaKey = task.area;
        if (stageConfig && !stageConfig?.areas?.[areaKey]) {
          if (task.stage === "metadata") {
            areaKey = areaKey === "evidenceLocker" ? "evidenceLocker" : "caseInformation";
          }
        }
        const areaConfig = stageConfig?.areas?.[areaKey];
        const commandConfig = stageConfig?.commands?.find(
          (item) => item.id === task.command
        );
        const createdAt =
          task.createdAt?.toMillis?.() ||
          (task.createdAt instanceof Date
            ? task.createdAt.getTime()
            : task.createdAt || 0);
        const highlightId = areaConfig?.highlightId || task.highlightId || null;
        const route = task.route || areaConfig?.route || null;
        const locationLabel =
          task.locationLabel ||
          (typeof task.locationIndex === "number" &&
            locationOptions[task.locationIndex]
            ? locationOptions[task.locationIndex].display
            : null);
        const assignedDisplay =
          task.allowAnyone || !task.assignedTo
            ? "Anyone"
            : task.assignedDisplayName ||
              collaboratorMap[task.assignedTo]?.displayName ||
              task.assignedTo;
        const note = typeof task.note === "string" ? task.note : "";
        return {
          ...task,
          area: areaKey,
          stageLabel: task.stageLabel || stageConfig?.label || task.stage,
          commandLabel: task.commandLabel || commandConfig?.label || task.command,
          areaLabel: task.areaLabel || areaConfig?.label || areaKey,
          highlightId,
          route,
          createdAt,
          assignedDisplay,
          locationLabel,
          note,
        };
      })
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "pending" ? -1 : 1;
        }
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }, [tasks, collaboratorMap, locationOptions]);

  const userAssignedTasks = useMemo(
    () =>
      displayedTasks.filter((task) => task.assignedTo === currentUserId),
    [displayedTasks, currentUserId]
  );
  const completedUserTasks = useMemo(
    () => userAssignedTasks.filter((task) => task.status === "completed"),
    [userAssignedTasks]
  );
  const assignedCount = userAssignedTasks.length;
  const completedCount = completedUserTasks.length;
  const userTaskProgressLabel =
    assignedCount > 0
      ? `${completedCount}/${assignedCount} tasks assigned to you have been completed`
      : "No tasks assigned to you yet.";

  const insertMentionFromSuggestion = (option) => {
    if (mentionStart !== null && mentionCaret !== null) {
      setMessage((prev) => {
        const before = prev.slice(0, mentionStart);
        const after = prev.slice(mentionCaret);
        const spacedBefore = before && !before.endsWith(" ") ? `${before} ` : before;
        return `${spacedBefore}${after}`.replace(/\s{2,}/g, " ");
      });
    }

    if (option.type === "all") {
      setNotifyAllSelected(true);
    } else if (option.type === "user" && option.collaborator) {
      setSelectedMentions((prev) => {
        if (prev.some((item) => item.id === option.collaborator.id)) {
          return prev;
        }
        return [...prev, option.collaborator];
      });
    }

    resetMentionDraftState();

    if (textareaRef.current) {
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        node.focus();
        const cursor = mentionStart !== null ? Math.min(mentionStart, node.value.length) : node.value.length;
        node.setSelectionRange(cursor, cursor);
      });
    }
  };

const handleSuggestionKeyDown = (event) => {
  if (mentionQuery === null) {
    return;
  }
  if (event.key === "Escape") {
    resetMentionDraftState();
    return;
  }
  if ((event.key === "Enter" || event.key === "Tab") && availableMentionOptions.length > 0) {
    event.preventDefault();
    insertMentionFromSuggestion(availableMentionOptions[0]);
  }
};

  const removeMention = (id) => {
    const mention = selectedMentions.find((item) => item.id === id);
    if (mention) {
      const slug = mention.slug || mention.handle.replace(/^@+/, "");
      setMessage((prev) =>
        prev
          .replace(new RegExp(`@${slug}\\b`, "gi"), "")
          .replace(/\s{2,}/g, " ")
          .trim()
      );
    }
    setSelectedMentions((prev) => prev.filter((item) => item.id !== id));
    resetMentionDraftState();
  };

  const handleRemoveAllMention = () => {
    setMessage((prev) =>
      prev
        .replace(/@all\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim()
    );
    setNotifyAllSelected(false);
    resetMentionDraftState();
  };

  const handleSubmitComment = async (event) => {
    event.preventDefault();
    const trimmed = message.trim();
    const hasMentions = notifyAllSelected || selectedMentions.length > 0;
    if (!trimmed && !hasMentions) {
      return;
    }
    if (!currentUserId) {
      setError("You must be signed in to post comments.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const mentionIds = new Set(selectedMentions.map((mention) => mention.id));
      let notifyAll = notifyAllSelected;
      const collaboratorsToAdd = [];

      const recognizedTokens = new Set();
      const typedMatches = trimmed.match(/@([A-Za-z0-9_-]+)/g) || [];
      typedMatches.forEach((token) => {
        const slug = token.replace(/^@+/, "").toLowerCase();
        if (slug === "all") {
          notifyAll = true;
          if (!notifyAllSelected) {
            setNotifyAllSelected(true);
          }
          recognizedTokens.add("@all");
        } else {
          const collaborator = collaborators.find(
            (collab) => collab.slug && collab.slug.toLowerCase() === slug
          );
          if (collaborator) {
            mentionIds.add(collaborator.id);
            if (!selectedMentions.some((item) => item.id === collaborator.id)) {
              collaboratorsToAdd.push(collaborator);
            }
            recognizedTokens.add(`@${collaborator.slug.toLowerCase()}`);
          }
        }
      });

      if (collaboratorsToAdd.length > 0) {
        setSelectedMentions((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          collaboratorsToAdd.forEach((collaborator) => {
            if (!existingIds.has(collaborator.id)) {
              merged.push(collaborator);
            }
          });
          return merged;
        });
      }

      let baseMessage = trimmed.replace(/@([A-Za-z0-9_-]+)/g, (match) =>
        recognizedTokens.has(match.toLowerCase()) ? "" : match
      );
      baseMessage = baseMessage.replace(/\s{2,}/g, " ").trim();

      const mentionListForMessage = [
        ...(notifyAll ? ["@All"] : []),
        ...Array.from(mentionIds).flatMap((id) => {
          const collab = collaborators.find((c) => c.id === id);
          if (!collab) {
            return [];
          }
          const slug = collab.slug || collab.handle.replace(/^@+/, "");
          return [`@${slug}`];
        }),
      ];

      const messageParts = [];
      if (baseMessage) {
        messageParts.push(baseMessage);
      }
      if (mentionListForMessage.length > 0) {
        messageParts.push(...mentionListForMessage);
      }
      const messageWithMentions = messageParts.join(" ").trim();

      if (currentUserId) {
        mentionIds.delete(currentUserId);
      }

      await axios.post(`${API_BASE_URL}/cases/${caseId}/comments`, {
        authorId: currentUserId,
        text: messageWithMentions,
        mentions: Array.from(mentionIds),
        notifyAll,
      });
      await loadComments();
      setMessage("");
      setSelectedMentions([]);
      setNotifyAllSelected(false);
      resetMentionDraftState();
    } catch (err) {
      console.error("Failed to send comment:", err);
      setError("Unable to send your comment. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const goToEditCase = () => {
    if (!caseData) return;
    navigate("/edit-case", {
      state: { caseData: { ...caseData, doc_id: caseId } },
    });
  };

  const sortedComments = useMemo(
    () =>
      comments
        .slice()
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis
            ? a.createdAt.toMillis()
            : new Date(a.createdAt || 0).getTime();
          const bTime = b.createdAt?.toMillis
            ? b.createdAt.toMillis()
            : new Date(b.createdAt || 0).getTime();
          return aTime - bTime;
        }),
    [comments]
  );

  const caseTitle = caseData?.caseTitle || "Case Collaboration";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black font-sans text-white"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.15),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(129,140,248,0.12),transparent_60%)]" />

      <nav className="mx-6 mt-6 flex items-center justify-between rounded-3xl border border-white/10 bg-gradient-to-br from-black/85 via-slate-900/70 to-black/80 px-6 py-4 shadow-xl shadow-[0_25px_65px_rgba(8,11,24,0.65)] backdrop-blur-xl">
        <div className="flex items-center gap-4 text-sm text-gray-200">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-white/30 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <Link
            to="/my-cases"
            className="hidden md:inline-flex items-center rounded-full border border-white/15 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-white/30 hover:text-white"
          >
            My Cases
          </Link>
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-semibold uppercase tracking-[0.45em] text-white/80 drop-shadow-[0_2px_12px_rgba(15,23,42,0.55)]">
          Collaboration
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-200">
          <NotificationBell className="hidden lg:block" />
          <div className="text-right">
            <span className="block text-xs text-gray-500">
              {profile
                ? `${profile.firstName || ""} ${profile.surname || ""}`.trim() ||
                  profile.email ||
                  "Investigator"
                : "Investigator"}
            </span>
            <span className="block text-[11px] text-gray-500">
              {new Date().toLocaleString()}
            </span>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-6 mt-8 mb-12 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.02] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white">{caseTitle}</h1>
              <p className="mt-1 text-xs text-gray-400">
                Collaborate with your team in real-time. Use <span className="font-semibold text-blue-200">@handles</span> to mention collaborators or <span className="font-semibold text-blue-200">@All</span> to notify everyone.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goToEditCase}
                className="inline-flex items-center gap-2 rounded-full border border-indigo-500/60 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-100 transition hover:border-indigo-500/80 hover:text-white"
              >
                <Edit3 className="h-4 w-4" />
                Edit Case
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Users className="h-4 w-4 text-blue-300" />
            <div className="flex flex-wrap gap-2 text-xs text-gray-300">
              {collaborators.length === 0 ? (
                <span>No collaborators linked yet.</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyAllSelected(true);
                      resetMentionDraftState();
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-blue-100 transition hover:border-blue-400/50 hover:text-white"
                  >
                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-100">
                      @All
                    </span>
                    Notify everyone
                  </button>
                  {collaborators.map((collab) => (
                    <button
                      type="button"
                      key={collab.id}
                      onClick={() => handleQuickMention(collab)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-gray-300 transition hover:border-blue-400/50 hover:text-white"
                    >
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-100">
                        {collab.handle}
                      </span>
                      {collab.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="mt-6 flex-1 rounded-2xl border border-white/10 bg-black/40 p-4">
            {loadingComments ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-300">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-400" />
                Loading conversation…
              </div>
            ) : sortedComments.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-sm text-gray-400">
                <MessageCircle className="mb-3 h-6 w-6 text-blue-300" />
                <p>No comments yet. Start the collaboration below.</p>
              </div>
            ) : (
              <ul className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1">
                {sortedComments.map((comment) => {
                  const isHighlighted = highlightTarget?.id === comment.id;
                  const baseClass = comment.authorId === currentUserId
                    ? "border-white/20 bg-transparent"
                    : "border-white/15 bg-transparent";
                  const highlightClass = isHighlighted
                    ? "border-blue-400 bg-blue-500/15 animate-glow-pulse"
                    : "";
                  const commentKey = isHighlighted && highlightTarget
                    ? `${comment.id}-${highlightTarget.nonce}`
                    : comment.id;

                  return (
                    <li
                      id={`collab-comment-${comment.id}`}
                      key={commentKey}
                      className={`relative rounded-2xl border px-4 py-3 transition ${baseClass} ${highlightClass}`}
                    >
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span className="font-semibold text-white/90">
                          {comment.authorDisplayName || "Investigator"}
                        </span>
                        <span>{formatTimestamp(comment.createdAt)}</span>
                      </div>
                      <div className="mt-2 text-sm text-gray-200">
                        {highlightMentions(comment.text)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {commentError && (
              <p className="mt-3 text-[11px] text-yellow-300">{commentError}</p>
            )}
          </div>

          <form onSubmit={handleSubmitComment} className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <label htmlFor="comment-input" className="sr-only">
              Add a comment
            </label>
            {(notifyAllSelected || selectedMentions.length > 0) && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {notifyAllSelected && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-100">
                    @All
                    <button
                      type="button"
                      onClick={handleRemoveAllMention}
                      className="ml-1 text-blue-200 transition hover:text-white"
                      aria-label="Remove @All"
                    >
                      ×
                    </button>
                  </span>
                )}
                {selectedMentions.map((mention) => (
                  <span
                    key={mention.id}
                    className="inline-flex items-center gap-1 rounded-full border border-indigo-400/40 bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-100"
                  >
                    {mention.handle.startsWith("@") ? mention.handle : `@${mention.handle}`}
                    <button
                      type="button"
                      onClick={() => removeMention(mention.id)}
                      className="ml-1 text-indigo-200 transition hover:text-white"
                      aria-label={`Remove ${mention.handle}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <textarea
                id="comment-input"
                ref={textareaRef}
                value={message}
                onChange={handleMessageChange}
                onSelect={handleTextareaSelect}
                onKeyDown={handleSuggestionKeyDown}
                placeholder="Share discoveries, updates, or next steps…"
                className="h-28 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {mentionQuery !== null && availableMentionOptions.length > 0 && (
                <div className="absolute bottom-full left-0 z-30 mb-3 w-80 rounded-3xl border border-blue-500/30 bg-slate-950/90 p-3 text-sm text-gray-100 shadow-[0_20px_45px_rgba(30,58,138,0.55)] backdrop-blur-lg">
                  <ul className="max-h-60 overflow-y-auto">
                    {availableMentionOptions.map((option) => (
                      <li
                        key={option.id}
                        className="flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-xs transition hover:bg-blue-500/25 hover:text-white"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          insertMentionFromSuggestion(option);
                        }}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm">{option.label}</span>
                          {option.type === "user" && option.collaborator?.name && (
                            <span className="text-[11px] text-gray-300">
                              {option.collaborator.name}
                            </span>
                          )}
                        </div>
                        {option.type === "user" && option.collaborator?.email && (
                          <span className="ml-3 truncate text-[10px] text-gray-300">
                            {option.collaborator.email}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <AtSign className="h-3.5 w-3.5 text-blue-300" />
                <span>
                  Mention teammates with their handles.
                  {notifyAllSelected && <span className="text-blue-200"> Everyone will be notified.</span>}
                </span>
              </div>
              <button
                type="submit"
                disabled={
                  sending || (!message.trim() && !notifyAllSelected && selectedMentions.length === 0)
                }
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send comment
                  </>
                )}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <h2 className="text-lg font-semibold text-white">Case overview</h2>
            {loadingCase ? (
              <div className="mt-4 flex items-center text-sm text-gray-300">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-400" />
                Loading case details…
              </div>
            ) : caseData ? (
              <div className="mt-4 space-y-3 text-sm text-gray-300">
                <p className="flex items-center justify-between">
                  <span>Region</span>
                  <span className="font-semibold text-white">{caseData.region || "Unknown"}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Date of incident</span>
                  <span className="font-semibold text-white">{caseData.dateOfIncident || "N/A"}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white">
                    {caseData.status || "in progress"}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Urgency</span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white">
                    {caseData.urgency || "Unassigned"}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Shared</span>
                  <span className="flex items-center gap-2 text-xs font-semibold text-blue-100">
                    <Users className="h-3.5 w-3.5" />
                    {(caseData.isShared ?? uniqueUserIds(caseData).length > 1) ? "Yes" : "No"}
                  </span>
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-rose-300">
                {caseError || "Unable to load case information."}
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-white/12 bg-white/[0.018] p-6 text-sm text-gray-300 shadow-[0_25px_70px_rgba(15,23,42,0.25)] backdrop-blur-2xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Task list</h2>
                <p className="text-xs text-gray-400">
                  Coordinate metadata, annotations, and reporting duties from one place.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold text-sky-100">
                <CheckCircle2 className="h-3.5 w-3.5 text-sky-300" />
                {userTaskProgressLabel}
              </span>
            </div>

            {taskError && (
              <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">
                {taskError}
              </p>
            )}

            {isAdmin && (
              <form
                onSubmit={handleCreateTask}
                className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-gray-200"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">Create Task</h3>
                  <button
                    type="button"
                    onClick={resetTaskBuilder}
                    className="text-[11px] text-blue-200 transition hover:text-white"
                  >
                    Reset
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-gray-400">
                      Stage
                    </label>
                    <select
                      value={builderState.stage}
                      onChange={(event) => handleBuilderChange("stage", event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                      required
                    >
                      <option value="">Select stage</option>
                      {Object.entries(TASK_STAGES).map(([id, config]) => (
                        <option key={id} value={id}>
                          {config.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-gray-400">
                      Command
                    </label>
                    <select
                      value={builderState.command}
                      onChange={(event) => handleBuilderChange("command", event.target.value)}
                      disabled={!builderState.stage}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-gray-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                      required
                    >
                      <option value="">Select command</option>
                      {commandOptions.map((command) => (
                        <option key={command.id} value={command.id}>
                          {command.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-gray-400">
                      Area
                    </label>
                    <select
                      value={builderState.area}
                      onChange={(event) => handleBuilderChange("area", event.target.value)}
                      disabled={!builderState.command}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-gray-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                      required
                    >
                      <option value="">Select area</option>
                      {areaOptions.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-gray-400">
                      Assignee
                    </label>
                    <select
                      value={builderState.assignee}
                      onChange={(event) => handleBuilderAssigneeChange(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                    >
                      <option value="anyone">Anyone</option>
                      {collaborators.map((collab) => (
                        <option key={collab.id} value={collab.id}>
                          {collab.name || collab.handle}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {requiresLocation && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-gray-400">
                      Location
                    </label>
                    {locationOptions.length > 0 ? (
                      <select
                        value={builderState.locationIndex}
                        onChange={(event) =>
                          handleBuilderChange("locationIndex", event.target.value)
                        }
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                        required
                      >
                        <option value="">Choose location</option>
                        {locationOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.display}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                        No locations found for this case yet. Add locations in the annotations
                        workspace before assigning location-specific tasks.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-gray-400">
                    Notes (optional)
                  </label>
                  <textarea
                    value={builderState.note}
                    onChange={(event) => handleBuilderChange("note", event.target.value)}
                    rows={3}
                    placeholder="Add context or instructions for the assignee..."
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-400">
                  <span>
                    {stageLabel && commandLabel && areaLabel
                      ? `Preview: ${buildTaskTitle({
                          stageId: builderState.stage,
                          commandId: builderState.command,
                          areaId: builderState.area,
                          locationLabel: selectedLocation?.display,
                        })}`
                      : "Choose a stage, command, and area to build a task."}
                  </span>
                  <button
                    type="submit"
                    disabled={!canCreateTask || creatingTask}
                    className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold transition ${
                      !canCreateTask || creatingTask
                        ? "cursor-not-allowed bg-white/5 text-gray-500"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:-translate-y-0.5"
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {creatingTask ? "Creating..." : "Create task"}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6">
              {tasksLoading ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-300">
                  Loading tasks…
                </div>
              ) : displayedTasks.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-400">
                  No tasks created yet. {isAdmin ? "Build one above to get started." : "Check back once your admin assigns tasks."}
                </div>
              ) : (
                <ul className="space-y-3">
                  {displayedTasks.map((task) => {
                    const createdAtDate =
                      typeof task.createdAt === "number" && task.createdAt > 0
                        ? new Date(task.createdAt)
                        : null;
                    const isCompleted = task.status === "completed";
                    const canToggle =
                      isAdmin || task.allowAnyone || task.assignedTo === currentUserId;
                    const canClear =
                      isCompleted &&
                      (isAdmin || task.createdBy === currentUserId || task.completedBy === currentUserId);
                    return (
                      <li
                        key={task.id}
                        className={`rounded-2xl border px-4 py-4 transition ${
                          isCompleted
                            ? "border-emerald-400/50 bg-emerald-500/10"
                            : "border-white/10 bg-white/[0.02]"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-white">
                                {task.title ||
                                  `${task.commandLabel} ${task.areaLabel}`.trim()}
                              </p>
                              {isCompleted && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Completed
                                </span>
                              )}
                            </div>
                            {task.locationLabel && (
                              <p className="mt-1 text-xs text-gray-400">
                                {task.locationLabel}
                              </p>
                            )}
                            {task.note && (
                              <p className="mt-2 flex items-start gap-2 text-xs text-gray-300">
                                <StickyNote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-200" />
                                <span className="whitespace-pre-wrap leading-relaxed text-gray-200">{task.note}</span>
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-400">
                              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5">
                                {task.stageLabel}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5">
                                {task.commandLabel}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5">
                                {task.areaLabel}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenTask(task)}
                              className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-100 transition hover:border-blue-500/60 hover:bg-blue-500/25"
                            >
                              Jump to task
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>
                            {canToggle && (
                              <button
                                type="button"
                                onClick={() => handleToggleTaskCompletion(task)}
                                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                  isCompleted
                                    ? "border-white/10 bg-white/[0.05] text-gray-200 hover:border-rose-400/40 hover:text-white"
                                    : "border-emerald-400/50 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/70"
                                }`}
                              >
                                {isCompleted ? "Mark incomplete" : "Mark complete"}
                              </button>
                            )}
                            {canClear && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTask(task)}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-gray-200 transition hover:border-rose-400/40 hover:text-white"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Clear task
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-4 flex flex-col gap-2 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-200">
                              <User className="h-3.5 w-3.5 text-blue-200" />
                              {isAdmin ? (
                                <select
                                  value={
                                    task.allowAnyone || !task.assignedTo
                                      ? "anyone"
                                      : task.assignedTo
                                  }
                                  onChange={(event) =>
                                    handleTaskAssigneeUpdate(task, event.target.value)
                                  }
                                  className="bg-transparent text-xs font-semibold text-white focus:outline-none"
                                >
                                  <option value="anyone">Anyone</option>
                                  {collaborators.map((collab) => (
                                    <option key={collab.id} value={collab.id}>
                                      {collab.name || collab.handle}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="font-semibold text-white">
                                  {task.allowAnyone || !task.assignedTo
                                    ? "Anyone"
                                    : task.assignedDisplay}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {createdAtDate
                              ? `Created ${createdAtDate.toLocaleString()}`
                              : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </main>
    </motion.div>
  );
}

export default CaseCollaborationPage;
