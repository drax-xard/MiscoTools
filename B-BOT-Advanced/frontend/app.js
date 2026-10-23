const TOKEN_KEY = "bbot-advanced-token";
const LANGUAGE_KEY = "bbot-advanced-language";

const STRINGS = {
  en: {
    "nav.today": "Today",
    "nav.household": "Household",
    "nav.chores": "Chores",
    "nav.reminders": "Reminders",
    "nav.notifications": "Notifications",
    "nav.chat": "Chat",
    "auth.token": "Household token",
    "auth.remember": "Remember",
    "auth.save": "Save",
    "common.refresh": "Refresh",
    "common.loading": "Loading...",
    "common.none": "None",
    "common.error": "Something went wrong.",
    "common.delete": "Delete",
    "common.complete": "Complete",
    "common.postpone": "Postpone 30 min",
    "common.deactivate": "Deactivate",
    "common.activate": "Activate",
    "common.read": "Read",
    "common.unread": "Unread",
    "common.overdue": "Overdue",
    "common.today": "Today",
    "common.upcoming": "Upcoming",
    "common.assigned": "Assigned to {name}",
    "common.unassigned": "Unassigned",
    "common.points": "points",
    "common.attempts": "attempts",
    "common.noItems": "Nothing here yet.",
    "common.requiredToken": "Save the household token to continue.",
    "common.confirmDelete": "Delete this item?",
    "common.confirmDeactivate": "Deactivate this member?",
    "common.open": "Open",
    "common.completed": "Completed",
    "common.missed": "Missed",
    "common.enabled": "Enabled",
    "common.disabled": "Disabled",
    "common.saved": "Saved.",
    "common.deleted": "Deleted.",
    "common.sent": "Sent.",
    "common.queued": "Queued",
    "common.pending": "Pending",
    "common.failed": "Failed",
    "common.skipped": "Skipped",
    "today.title": "Today",
    "today.chores": "Chores",
    "today.reminders": "Reminders",
    "today.inbox": "Inbox",
    "today.dueChores": "Due chores",
    "today.dueReminders": "Due reminders",
    "today.unread": "Unread",
    "today.points": "Points today",
    "today.completedToday": "{count} completed today",
    "today.noneDue": "Nothing due.",
    "today.noNotifications": "No unread notifications.",
    "household.title": "Household",
    "household.subtitle": "Profiles and chore points.",
    "household.name": "Name",
    "household.namePlaceholder": "Member name",
    "household.add": "Add member",
    "household.empty": "No members yet.",
    "household.added": "Member added.",
    "household.deactivated": "Member deactivated.",
    "household.activated": "Member activated.",
    "chores.title": "Chores",
    "chores.subtitle": "Recurring work, assignments, and points.",
    "chores.add": "Add chore",
    "chores.empty": "No chores yet.",
    "chore.title": "Title",
    "chore.cadence": "Cadence",
    "chore.member": "Assigned to",
    "chore.points": "Points",
    "chore.nextDue": "Next due",
    "chore.added": "Chore added.",
    "chore.completed": "Chore completed.",
    "chore.deleted": "Chore deleted.",
    "reminders.title": "Reminders",
    "reminders.subtitle": "One-off and recurring reminders.",
    "reminders.add": "Add reminder",
    "reminders.empty": "No reminders yet.",
    "reminder.title": "Title",
    "reminder.due": "Due",
    "reminder.recurrence": "Repeat",
    "reminder.member": "For",
    "reminder.description": "Description",
    "reminder.added": "Reminder added.",
    "reminder.completed": "Reminder completed.",
    "reminder.postponed": "Reminder postponed.",
    "reminder.deleted": "Reminder deleted.",
    "notifications.title": "Notifications",
    "notifications.subtitle": "Channels, test sends, inbox, and delivery log.",
    "notifications.channels": "Channels",
    "notifications.test": "Send a test",
    "notifications.message": "Message",
    "notifications.target": "Target",
    "notifications.web": "Web",
    "notifications.voice": "Voice",
    "notifications.send": "Send test",
    "notifications.inbox": "Inbox",
    "notifications.markAllRead": "Mark all read",
    "notifications.log": "Delivery log",
    "notifications.empty": "No notifications yet.",
    "notifications.logEmpty": "No deliveries yet.",
    "notifications.testSent": "Test sent.",
    "notifications.markedAll": "All notifications marked read.",
    "notifications.read": "Notification marked read.",
    "notifications.channelEnabled": "Channel enabled.",
    "notifications.channelDisabled": "Channel disabled.",
    "notifications.pickChannel": "Pick at least one channel.",
    "chat.new": "New chat",
    "chat.empty": "Start a conversation. Replies are streamed from the remote model.",
    "chat.placeholder": "Ask B-BOT...",
    "chat.send": "Send",
    "chat.stop": "Stop",
    "chat.export": "Export",
    "chat.you": "You",
    "chat.bot": "B-BOT",
    "chat.deleteConfirm": "Delete this conversation?",
    "chat.startFailed": "The reply failed.",
    "cadence.daily": "Daily",
    "cadence.weekly": "Weekly",
    "cadence.biweekly": "Every two weeks",
    "cadence.monthly": "Monthly",
    "cadence.everyDays": "Every {count} days",
    "cadence.everyWeeks": "Every {count} weeks",
    "recurrence.none": "Does not repeat",
    "recurrence.daily": "Daily",
    "recurrence.weekly": "Weekly",
    "recurrence.biweekly": "Every two weeks",
    "recurrence.monthly": "Monthly",
    "errors.unauthorized": "The household token was rejected.",
  },
  es: {
    "nav.today": "Hoy",
    "nav.household": "Hogar",
    "nav.chores": "Tareas",
    "nav.reminders": "Recordatorios",
    "nav.notifications": "Notificaciones",
    "nav.chat": "Chat",
    "auth.token": "Token del hogar",
    "auth.remember": "Recordar",
    "auth.save": "Guardar",
    "common.refresh": "Actualizar",
    "common.loading": "Cargando...",
    "common.none": "Ninguno",
    "common.error": "Algo salió mal.",
    "common.delete": "Eliminar",
    "common.complete": "Completar",
    "common.postpone": "Posponer 30 min",
    "common.deactivate": "Desactivar",
    "common.activate": "Activar",
    "common.read": "Leído",
    "common.unread": "Sin leer",
    "common.overdue": "Vencido",
    "common.today": "Hoy",
    "common.upcoming": "Próximo",
    "common.assigned": "Asignado a {name}",
    "common.unassigned": "Sin asignar",
    "common.points": "puntos",
    "common.attempts": "intentos",
    "common.noItems": "Todavía no hay nada.",
    "common.requiredToken": "Guardá el token del hogar para continuar.",
    "common.confirmDelete": "¿Eliminar este elemento?",
    "common.confirmDeactivate": "¿Desactivar este integrante?",
    "common.open": "Abierto",
    "common.completed": "Completado",
    "common.missed": "Perdido",
    "common.enabled": "Habilitado",
    "common.disabled": "Deshabilitado",
    "common.saved": "Guardado.",
    "common.deleted": "Eliminado.",
    "common.sent": "Enviado.",
    "common.queued": "En cola",
    "common.pending": "Pendiente",
    "common.failed": "Falló",
    "common.skipped": "Omitido",
    "today.title": "Hoy",
    "today.chores": "Tareas",
    "today.reminders": "Recordatorios",
    "today.inbox": "Bandeja",
    "today.dueChores": "Tareas pendientes",
    "today.dueReminders": "Recordatorios pendientes",
    "today.unread": "Sin leer",
    "today.points": "Puntos hoy",
    "today.completedToday": "{count} completadas hoy",
    "today.noneDue": "Nada pendiente.",
    "today.noNotifications": "No hay notificaciones sin leer.",
    "household.title": "Hogar",
    "household.subtitle": "Perfiles y puntos de tareas.",
    "household.name": "Nombre",
    "household.namePlaceholder": "Nombre del integrante",
    "household.add": "Agregar integrante",
    "household.empty": "Todavía no hay integrantes.",
    "household.added": "Integrante agregado.",
    "household.deactivated": "Integrante desactivado.",
    "household.activated": "Integrante activado.",
    "chores.title": "Tareas",
    "chores.subtitle": "Trabajo recurrente, asignaciones y puntos.",
    "chores.add": "Agregar tarea",
    "chores.empty": "Todavía no hay tareas.",
    "chore.title": "Título",
    "chore.cadence": "Frecuencia",
    "chore.member": "Asignada a",
    "chore.points": "Puntos",
    "chore.nextDue": "Próximo vencimiento",
    "chore.added": "Tarea agregada.",
    "chore.completed": "Tarea completada.",
    "chore.deleted": "Tarea eliminada.",
    "reminders.title": "Recordatorios",
    "reminders.subtitle": "Recordatorios únicos y recurrentes.",
    "reminders.add": "Agregar recordatorio",
    "reminders.empty": "Todavía no hay recordatorios.",
    "reminder.title": "Título",
    "reminder.due": "Vence",
    "reminder.recurrence": "Repetir",
    "reminder.member": "Para",
    "reminder.description": "Descripción",
    "reminder.added": "Recordatorio agregado.",
    "reminder.completed": "Recordatorio completado.",
    "reminder.postponed": "Recordatorio pospuesto.",
    "reminder.deleted": "Recordatorio eliminado.",
    "notifications.title": "Notificaciones",
    "notifications.subtitle": "Canales, envíos de prueba, bandeja y registro de entregas.",
    "notifications.channels": "Canales",
    "notifications.test": "Enviar una prueba",
    "notifications.message": "Mensaje",
    "notifications.target": "Destino",
    "notifications.web": "Web",
    "notifications.voice": "Voz",
    "notifications.send": "Enviar prueba",
    "notifications.inbox": "Bandeja",
    "notifications.markAllRead": "Marcar todo leído",
    "notifications.log": "Registro de entregas",
    "notifications.empty": "Todavía no hay notificaciones.",
    "notifications.logEmpty": "Todavía no hay entregas.",
    "notifications.testSent": "Prueba enviada.",
    "notifications.markedAll": "Notificaciones marcadas como leídas.",
    "notifications.read": "Notificación marcada como leída.",
    "notifications.channelEnabled": "Canal habilitado.",
    "notifications.channelDisabled": "Canal deshabilitado.",
    "notifications.pickChannel": "Elegí al menos un canal.",
    "chat.new": "Nuevo chat",
    "chat.empty": "Iniciá una conversación. Las respuestas llegan del modelo remoto.",
    "chat.placeholder": "Preguntale a B-BOT...",
    "chat.send": "Enviar",
    "chat.stop": "Detener",
    "chat.export": "Exportar",
    "chat.you": "Vos",
    "chat.bot": "B-BOT",
    "chat.deleteConfirm": "¿Eliminar esta conversación?",
    "chat.startFailed": "La respuesta falló.",
    "cadence.daily": "Diaria",
    "cadence.weekly": "Semanal",
    "cadence.biweekly": "Cada dos semanas",
    "cadence.monthly": "Mensual",
    "cadence.everyDays": "Cada {count} días",
    "cadence.everyWeeks": "Cada {count} semanas",
    "recurrence.none": "No se repite",
    "recurrence.daily": "Diaria",
    "recurrence.weekly": "Semanal",
    "recurrence.biweekly": "Cada dos semanas",
    "recurrence.monthly": "Mensual",
    "errors.unauthorized": "El token del hogar fue rechazado.",
  },
};

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "",
  lang: localStorage.getItem(LANGUAGE_KEY) === "es" ? "es" : "en",
  activeView: "today",
  timezone: undefined,
  conversationId: null,
  controller: null,
  streaming: false,
  membersLoaded: false,
  choresLoaded: false,
  remindersLoaded: false,
  notificationsLoaded: false,
  channelsLoaded: false,
  notificationLogLoaded: false,
  members: [],
  dashboard: null,
  chores: [],
  reminders: [],
  channels: [],
  notifications: [],
  notificationLog: [],
};

const el = {
  token: document.getElementById("token"),
  remember: document.getElementById("remember-token"),
  saveToken: document.getElementById("save-token"),
  langToggle: document.getElementById("lang-toggle"),
  statusDot: document.getElementById("status-dot"),
  export: document.getElementById("export"),
  toast: document.getElementById("toast"),
  todaySubtitle: document.getElementById("today-subtitle"),
  todayCards: document.getElementById("today-cards"),
  todayChores: document.getElementById("today-chores"),
  todayReminders: document.getElementById("today-reminders"),
  todayNotifications: document.getElementById("today-notifications"),
  refreshToday: document.getElementById("refresh-today"),
  memberForm: document.getElementById("member-form"),
  memberName: document.getElementById("member-name"),
  membersList: document.getElementById("members-list"),
  choreForm: document.getElementById("chore-form"),
  choreTitle: document.getElementById("chore-title"),
  choreCadence: document.getElementById("chore-cadence"),
  choreMember: document.getElementById("chore-member"),
  chorePoints: document.getElementById("chore-points"),
  choreDue: document.getElementById("chore-due"),
  choresList: document.getElementById("chores-list"),
  reminderForm: document.getElementById("reminder-form"),
  reminderTitle: document.getElementById("reminder-title"),
  reminderDescription: document.getElementById("reminder-description"),
  reminderDue: document.getElementById("reminder-due"),
  reminderRecurrence: document.getElementById("reminder-recurrence"),
  reminderMember: document.getElementById("reminder-member"),
  remindersList: document.getElementById("reminders-list"),
  notificationChannels: document.getElementById("notification-channels"),
  notificationTestForm: document.getElementById("notification-test-form"),
  notificationMessage: document.getElementById("notification-message"),
  notificationTarget: document.getElementById("notification-target"),
  notificationWeb: document.getElementById("notification-channel-web"),
  notificationVoice: document.getElementById("notification-channel-voice"),
  notificationsList: document.getElementById("notifications-list"),
  notificationLog: document.getElementById("notification-log"),
  markAllRead: document.getElementById("mark-all-read"),
  conversations: document.getElementById("conversations"),
  newChat: document.getElementById("new-chat"),
  messages: document.getElementById("messages"),
  composer: document.getElementById("composer"),
  input: document.getElementById("input"),
  send: document.getElementById("send"),
  stop: document.getElementById("stop"),
  error: document.getElementById("error"),
};

let toastTimer = null;

function t(key, values = {}) {
  const table = STRINGS[state.lang] || STRINGS.en;
  let text = table[key] || STRINGS.en[key] || key;
  Object.entries(values).forEach(([name, value]) => {
    text = text.split(`{${name}}`).join(String(value));
  });
  return text;
}

function locale() {
  return state.lang === "es" ? "es-AR" : "en-US";
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.toast.hidden = true;
  }, 4200);
}

function reportError(error) {
  if (error && error.message) {
    showToast(error.message);
  } else {
    showToast(t("common.error"));
  }
}

function applyTranslations() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  el.langToggle.textContent = state.lang === "en" ? "ES" : "EN";
  if (state.membersLoaded) {
    populateMemberSelect(el.choreMember);
    populateMemberSelect(el.reminderMember);
  }
  if (state.dashboard) renderDashboard();
  if (state.membersLoaded) renderMembers();
  if (state.choresLoaded) renderChores();
  if (state.remindersLoaded) renderReminders();
  if (state.channelsLoaded) renderChannels();
  if (state.notificationsLoaded) renderNotifications();
  if (state.notificationLogLoaded) renderNotificationLog();
}

function toggleLanguage() {
  state.lang = state.lang === "en" ? "es" : "en";
  localStorage.setItem(LANGUAGE_KEY, state.lang);
  applyTranslations();
}

function clear(node) {
  node.replaceChildren();
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function emptyState(message) {
  return make("p", "empty-state", message);
}

function formatDateTime(value) {
  if (!value) return t("common.none");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const options = { dateStyle: "medium", timeStyle: "short" };
  if (state.timezone) options.timeZone = state.timezone;
  return new Intl.DateTimeFormat(locale(), options).format(date);
}

function formatDateOnly(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale(), { dateStyle: "full" }).format(date);
}

function cadenceLabel(value) {
  if (!value) return t("common.none");
  const direct = {
    daily: "cadence.daily",
    weekly: "cadence.weekly",
    biweekly: "cadence.biweekly",
    monthly: "cadence.monthly",
  };
  if (direct[value]) return t(direct[value]);
  const match = /^every:(\d+):(days|weeks)$/.exec(value);
  if (match) {
    return t(match[2] === "days" ? "cadence.everyDays" : "cadence.everyWeeks", {
      count: match[1],
    });
  }
  return value;
}

function recurrenceLabel(value) {
  return value ? cadenceLabel(value) : t("recurrence.none");
}

function memberName(id) {
  const member = state.members.find((item) => item.id === id);
  return member ? member.name : t("common.unassigned");
}

function populateMemberSelect(select) {
  const current = select.value;
  clear(select);
  select.appendChild(new Option(t("common.unassigned"), ""));
  state.members.forEach((member) => {
    select.appendChild(new Option(member.name, String(member.id)));
  });
  if (current && Array.from(select.options).some((option) => option.value === current)) {
    select.value = current;
  }
}

function toLocalInput(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setDefaultReminderDue() {
  if (!el.reminderDue.value) {
    el.reminderDue.value = toLocalInput(new Date(Date.now() + 60 * 60 * 1000));
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch (_) { /* keep default */ }
    if (response.status === 401) detail = t("errors.unauthorized");
    throw new Error(detail);
  }
  return response;
}

async function apiJson(path, options = {}) {
  const response = await api(path, options);
  if (response.status === 204) return null;
  return response.json();
}

function requireToken() {
  if (state.token) return true;
  showToast(t("common.requiredToken"));
  return false;
}

async function checkHealth() {
  try {
    const response = await fetch("/health");
    el.statusDot.className = `dot ${response.ok ? "online" : "offline"}`;
  } catch (_) {
    el.statusDot.className = "dot offline";
  }
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `view-${view}`);
  });
  el.export.hidden = view !== "chat" || !state.conversationId;
  loadView(view);
}

function loadView(view) {
  if (!state.token) return;
  if (view === "today") loadDashboard();
  if (view === "household") loadMembers();
  if (view === "chores") loadChores();
  if (view === "reminders") loadReminders();
  if (view === "notifications") loadNotifications();
  if (view === "chat") loadConversations();
}

async function refreshAll() {
  if (!state.token) return;
  await Promise.all([
    loadDashboard(),
    loadMembers(),
    loadChores(),
    loadReminders(),
    loadNotifications(),
    loadConversations(),
  ]);
}

async function loadDashboard(silent = false) {
  if (!state.token) return;
  try {
    const data = await apiJson("/api/dashboard/today");
    state.dashboard = data;
    state.timezone = data.timezone;
    renderDashboard();
  } catch (error) {
    if (!silent) reportError(error);
  }
}

function card(label, value, detail) {
  const wrapper = make("article", "card");
  wrapper.append(make("span", "card-label", label), make("strong", "card-value", value));
  if (detail) wrapper.appendChild(make("span", "card-detail", detail));
  return wrapper;
}

function renderDashboard() {
  const data = state.dashboard;
  if (!data) return;
  el.todaySubtitle.textContent = `${formatDateOnly(data.date)} · ${data.timezone}`;
  const dueChores = data.overdue_chores.length + data.due_today_chores.length;
  const dueReminders = data.overdue_reminders.length + data.due_today_reminders.length;
  clear(el.todayCards);
  el.todayCards.append(
    card(t("today.dueChores"), dueChores),
    card(t("today.dueReminders"), dueReminders),
    card(t("today.unread"), data.unread_notification_count),
    card(
      t("today.points"),
      data.points_earned_today,
      t("today.completedToday", { count: data.chores_completed_today })
    )
  );
  renderTodayChores(data);
  renderTodayReminders(data);
  renderTodayNotifications(data);
}

function renderTodayChores(data) {
  clear(el.todayChores);
  const groups = [
    ["common.overdue", data.overdue_chores],
    ["common.today", data.due_today_chores],
    ["common.upcoming", data.upcoming_chores.slice(0, 5)],
  ];
  let count = 0;
  groups.forEach(([key, items]) => {
    if (!items.length) return;
    count += items.length;
    el.todayChores.appendChild(make("p", "group-title", t(key)));
    items.forEach((chore) => el.todayChores.appendChild(choreItem(chore, true)));
  });
  if (!count) {
    el.todayChores.appendChild(emptyState(t("today.noneDue")));
  }
}

function renderTodayReminders(data) {
  clear(el.todayReminders);
  const groups = [
    ["common.overdue", data.overdue_reminders],
    ["common.today", data.due_today_reminders],
    ["common.upcoming", data.upcoming_reminders.slice(0, 5)],
  ];
  let count = 0;
  groups.forEach(([key, items]) => {
    if (!items.length) return;
    count += items.length;
    el.todayReminders.appendChild(make("p", "group-title", t(key)));
    items.forEach((reminder) => el.todayReminders.appendChild(reminderItem(reminder)));
  });
  if (!count) {
    el.todayReminders.appendChild(emptyState(t("today.noneDue")));
  }
}

function renderTodayNotifications(data) {
  clear(el.todayNotifications);
  if (!data.unread_notifications.length) {
    el.todayNotifications.appendChild(emptyState(t("today.noNotifications")));
    return;
  }
  data.unread_notifications.forEach((notification) => {
    el.todayNotifications.appendChild(notificationItem(notification));
  });
}

function choreItem(chore, compact) {
  const row = make("article", "item");
  const main = make("div", "item-main");
  main.appendChild(make("div", "item-title", chore.title));
  const meta = [
    chore.member_id
      ? t("common.assigned", { name: memberName(chore.member_id) })
      : t("common.unassigned"),
    cadenceLabel(chore.cadence),
    `${chore.points} ${t("common.points")}`,
    formatDateTime(chore.next_due_at),
  ];
  main.appendChild(make("div", "item-meta", meta.join(" · ")));
  const actions = make("div", "item-actions");
  const complete = make("button", "small", t("common.complete"));
  complete.type = "button";
  complete.addEventListener("click", () => completeChore(chore));
  actions.appendChild(complete);
  if (!compact) {
    const remove = make("button", "small danger", t("common.delete"));
    remove.type = "button";
    remove.addEventListener("click", () => deleteChore(chore));
    actions.appendChild(remove);
  }
  row.append(main, actions);
  return row;
}

function reminderItem(reminder) {
  const row = make("article", "item");
  const main = make("div", "item-main");
  main.appendChild(make("div", "item-title", reminder.title));
  if (reminder.description) {
    main.appendChild(make("div", "item-description", reminder.description));
  }
  const meta = [
    reminder.member_id
      ? t("common.assigned", { name: memberName(reminder.member_id) })
      : t("common.unassigned"),
    formatDateTime(reminder.due_at),
    recurrenceLabel(reminder.recurrence),
    t(`common.${reminder.status}`),
  ];
  main.appendChild(make("div", "item-meta", meta.join(" · ")));
  const actions = make("div", "item-actions");
  if (reminder.status === "open") {
    const complete = make("button", "small", t("common.complete"));
    complete.type = "button";
    complete.addEventListener("click", () => completeReminder(reminder));
    actions.appendChild(complete);

    const postpone = make("button", "small", t("common.postpone"));
    postpone.type = "button";
    postpone.addEventListener("click", () => postponeReminder(reminder));
    actions.appendChild(postpone);
  }
  const remove = make("button", "small danger", t("common.delete"));
  remove.type = "button";
  remove.addEventListener("click", () => deleteReminder(reminder));
  actions.appendChild(remove);
  row.append(main, actions);
  return row;
}

function notificationItem(notification) {
  const row = make("article", "item");
  const main = make("div", "item-main");
  main.appendChild(make("div", "item-title", notification.message));
  main.appendChild(
    make(
      "div",
      "item-meta",
      [notification.source, formatDateTime(notification.created_at)].filter(Boolean).join(" · ")
    )
  );
  const actions = make("div", "item-actions");
  if (!notification.read_at) {
    actions.appendChild(make("span", "badge unread", t("common.unread")));
    const read = make("button", "small", t("common.read"));
    read.type = "button";
    read.addEventListener("click", () => markRead(notification));
    actions.appendChild(read);
  } else {
    actions.appendChild(make("span", "badge", t("common.read")));
  }
  row.append(main, actions);
  return row;
}

async function loadMembers() {
  if (!state.token) return;
  try {
    state.members = await apiJson("/api/members?active_only=false");
    state.membersLoaded = true;
    renderMembers();
    populateMemberSelect(el.choreMember);
    populateMemberSelect(el.reminderMember);
    if (state.dashboard) renderDashboard();
  } catch (error) {
    reportError(error);
  }
}

function renderMembers() {
  clear(el.membersList);
  if (!state.members.length) {
    el.membersList.appendChild(emptyState(t("household.empty")));
    return;
  }
  state.members.forEach((member) => {
    const row = make("article", "item");
    const main = make("div", "item-main");
    main.appendChild(make("div", "item-title", member.name));
    const meta = make("div", "item-meta");
    meta.appendChild(make("span", "badge", member.active ? t("common.enabled") : t("common.disabled")));
    meta.appendChild(
      make("span", "badge", `${member.points} ${t("common.points")}`)
    );
    main.appendChild(meta);
    const actions = make("div", "item-actions");
    const toggle = make("button", "small", member.active ? t("common.deactivate") : t("common.activate"));
    toggle.type = "button";
    toggle.addEventListener("click", () => toggleMember(member));
    actions.appendChild(toggle);
    row.append(main, actions);
    el.membersList.appendChild(row);
  });
}

async function toggleMember(member) {
  if (member.active && !confirm(t("common.confirmDeactivate"))) return;
  try {
    await apiJson(`/api/members/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !member.active }),
    });
    showToast(member.active ? t("household.deactivated") : t("household.activated"));
    await loadMembers();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function submitMember(event) {
  event.preventDefault();
  const name = el.memberName.value.trim();
  if (!name) return;
  try {
    await apiJson("/api/members", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    el.memberName.value = "";
    showToast(t("household.added"));
    await loadMembers();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function loadChores() {
  if (!state.token) return;
  try {
    if (!state.membersLoaded) await loadMembers();
    state.chores = await apiJson("/api/chores");
    state.choresLoaded = true;
    renderChores();
    populateMemberSelect(el.choreMember);
  } catch (error) {
    reportError(error);
  }
}

function renderChores() {
  clear(el.choresList);
  if (!state.chores.length) {
    el.choresList.appendChild(emptyState(t("chores.empty")));
    return;
  }
  state.chores.forEach((chore) => {
    el.choresList.appendChild(choreItem(chore, false));
  });
}

async function submitChore(event) {
  event.preventDefault();
  const title = el.choreTitle.value.trim();
  if (!title) return;
  const payload = {
    title,
    cadence: el.choreCadence.value,
    points: Number(el.chorePoints.value) || 0,
    member_id: el.choreMember.value ? Number(el.choreMember.value) : null,
  };
  if (el.choreDue.value) payload.next_due_at = new Date(el.choreDue.value).toISOString();
  try {
    await apiJson("/api/chores", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    el.choreTitle.value = "";
    el.choreDue.value = "";
    el.chorePoints.value = "1";
    showToast(t("chore.added"));
    await loadChores();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function completeChore(chore) {
  try {
    await apiJson(`/api/chores/${chore.id}/complete`, {
      method: "POST",
      body: JSON.stringify(chore.member_id ? { member_id: chore.member_id } : {}),
    });
    showToast(t("chore.completed"));
    await loadChores();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function deleteChore(chore) {
  if (!confirm(t("common.confirmDelete"))) return;
  try {
    await api(`/api/chores/${chore.id}`, { method: "DELETE" });
    showToast(t("chore.deleted"));
    await loadChores();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function loadReminders() {
  if (!state.token) return;
  try {
    if (!state.membersLoaded) await loadMembers();
    state.reminders = await apiJson("/api/reminders?limit=200");
    state.remindersLoaded = true;
    renderReminders();
    populateMemberSelect(el.reminderMember);
    setDefaultReminderDue();
  } catch (error) {
    reportError(error);
  }
}

function renderReminders() {
  clear(el.remindersList);
  if (!state.reminders.length) {
    el.remindersList.appendChild(emptyState(t("reminders.empty")));
    return;
  }
  state.reminders.forEach((reminder) => {
    el.remindersList.appendChild(reminderItem(reminder));
  });
}

async function submitReminder(event) {
  event.preventDefault();
  const title = el.reminderTitle.value.trim();
  if (!title || !el.reminderDue.value) return;
  const payload = {
    title,
    description: el.reminderDescription.value.trim(),
    due_at: new Date(el.reminderDue.value).toISOString(),
    recurrence: el.reminderRecurrence.value,
    member_id: el.reminderMember.value ? Number(el.reminderMember.value) : null,
  };
  try {
    await apiJson("/api/reminders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    el.reminderTitle.value = "";
    el.reminderDescription.value = "";
    el.reminderDue.value = "";
    setDefaultReminderDue();
    showToast(t("reminder.added"));
    await loadReminders();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function completeReminder(reminder) {
  try {
    await apiJson(`/api/reminders/${reminder.id}/complete`, { method: "POST" });
    showToast(t("reminder.completed"));
    await loadReminders();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function postponeReminder(reminder) {
  try {
    await apiJson(`/api/reminders/${reminder.id}/postpone`, {
      method: "POST",
      body: JSON.stringify({ minutes: 30 }),
    });
    showToast(t("reminder.postponed"));
    await loadReminders();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function deleteReminder(reminder) {
  if (!confirm(t("common.confirmDelete"))) return;
  try {
    await api(`/api/reminders/${reminder.id}`, { method: "DELETE" });
    showToast(t("reminder.deleted"));
    await loadReminders();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function loadNotifications(silent = false) {
  if (!state.token) return;
  try {
    const [channels, notifications, log] = await Promise.all([
      apiJson("/api/notifications/channels"),
      apiJson("/api/notifications?limit=50"),
      apiJson("/api/notifications/log?limit=20"),
    ]);
    state.channels = channels;
    state.notifications = notifications;
    state.notificationLog = log;
    state.channelsLoaded = true;
    state.notificationsLoaded = true;
    state.notificationLogLoaded = true;
    renderChannels();
    renderNotifications();
    renderNotificationLog();
  } catch (error) {
    if (!silent) reportError(error);
  }
}

function renderChannels() {
  clear(el.notificationChannels);
  if (!state.channels.length) {
    el.notificationChannels.appendChild(emptyState(t("common.noItems")));
    return;
  }
  state.channels.forEach((channel) => {
    const row = make("article", "item");
    const main = make("div", "item-main");
    const label = make("label", "channel-toggle");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(channel.enabled);
    checkbox.addEventListener("change", () => toggleChannel(channel, checkbox));
    const kindLabel =
      channel.kind === "web"
        ? t("notifications.web")
        : channel.kind === "voice"
          ? t("notifications.voice")
          : channel.kind;
    label.append(checkbox, make("span", "item-title", kindLabel));
    main.appendChild(label);
    main.appendChild(
      make("div", "item-meta", channel.enabled ? t("common.enabled") : t("common.disabled"))
    );
    row.appendChild(main);
    el.notificationChannels.appendChild(row);
  });
}

async function toggleChannel(channel, checkbox) {
  try {
    await apiJson(`/api/notifications/channels/${channel.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: checkbox.checked }),
    });
    showToast(
      checkbox.checked
        ? t("notifications.channelEnabled")
        : t("notifications.channelDisabled")
    );
    await loadNotifications();
  } catch (error) {
    reportError(error);
    await loadNotifications();
  }
}

function renderNotifications() {
  clear(el.notificationsList);
  if (!state.notifications.length) {
    el.notificationsList.appendChild(emptyState(t("notifications.empty")));
    return;
  }
  state.notifications.forEach((notification) => {
    el.notificationsList.appendChild(notificationItem(notification));
  });
}

function renderNotificationLog() {
  clear(el.notificationLog);
  if (!state.notificationLog.length) {
    el.notificationLog.appendChild(emptyState(t("notifications.logEmpty")));
    return;
  }
  state.notificationLog.forEach((entry) => {
    const row = make("article", "item");
    const main = make("div", "item-main");
    main.appendChild(
      make("div", "item-title", `${entry.channel} · ${t(`common.${entry.status}`)}`)
    );
    const meta = [
      formatDateTime(entry.created_at),
      `${entry.attempts} ${t("common.attempts")}`,
    ];
    if (entry.error) meta.push(entry.error);
    main.appendChild(make("div", "item-meta", meta.join(" · ")));
    const actions = make("div", "item-actions");
    actions.appendChild(
      make(
        "span",
        `badge ${entry.status === "failed" ? "danger" : ""}`.trim(),
        entry.status
      )
    );
    row.append(main, actions);
    el.notificationLog.appendChild(row);
  });
}

async function submitNotificationTest(event) {
  event.preventDefault();
  const message = el.notificationMessage.value.trim();
  if (!message) return;
  const channels = [];
  if (el.notificationWeb.checked) channels.push("web");
  if (el.notificationVoice.checked) channels.push("voice");
  if (!channels.length) {
    showToast(t("notifications.pickChannel"));
    return;
  }
  try {
    const result = await apiJson("/api/notifications/test", {
      method: "POST",
      body: JSON.stringify({
        message,
        target: el.notificationTarget.value.trim() || "household",
        channels,
      }),
    });
    el.notificationMessage.value = "";
    const summary = result.deliveries
      .map((delivery) => `${delivery.channel}: ${t(`common.${delivery.status}`)}`)
      .join(", ");
    showToast(`${t("notifications.testSent")} ${summary}`.trim());
    await loadNotifications();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function markRead(notification) {
  try {
    await apiJson(`/api/notifications/${notification.id}/read`, { method: "POST" });
    showToast(t("notifications.read"));
    await loadNotifications();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

async function markAllRead() {
  try {
    await apiJson("/api/notifications/read-all", { method: "POST" });
    showToast(t("notifications.markedAll"));
    await loadNotifications();
    await loadDashboard();
  } catch (error) {
    reportError(error);
  }
}

function showError(message) {
  el.error.textContent = message;
  el.error.hidden = !message;
}

function setStreaming(active) {
  state.streaming = active;
  el.send.hidden = active;
  el.stop.hidden = !active;
  el.input.disabled = active;
}

function renderMessages(messages) {
  clear(el.messages);
  if (!messages.length) {
    el.messages.appendChild(make("p", "empty", t("chat.empty")));
    return;
  }
  messages.forEach((message) => appendMessage(message.role, message.content));
}

function appendMessage(role, content) {
  const empty = el.messages.querySelector(".empty");
  if (empty) empty.remove();
  const article = make("article", `message ${role}`);
  const label = make("span", "role", role === "user" ? t("chat.you") : t("chat.bot"));
  const text = make("div", "content", content);
  article.append(label, text);
  el.messages.appendChild(article);
  el.messages.scrollTop = el.messages.scrollHeight;
  return text;
}

function renderConversations(conversations) {
  clear(el.conversations);
  conversations.forEach((conversation) => {
    const item = document.createElement("li");
    if (conversation.id === state.conversationId) item.classList.add("active");

    const open = make("button", "", conversation.title);
    open.type = "button";
    open.addEventListener("click", () => selectConversation(conversation.id));

    const remove = make("button", "delete", "×");
    remove.type = "button";
    remove.title = t("common.delete");
    remove.addEventListener("click", () => deleteConversation(conversation.id));

    item.append(open, remove);
    el.conversations.appendChild(item);
  });
}

async function loadConversations() {
  if (!state.token) return;
  try {
    const conversations = await apiJson("/api/chat/conversations");
    renderConversations(conversations);
  } catch (error) {
    showError(error.message);
  }
}

async function selectConversation(id) {
  try {
    const conversation = await apiJson(`/api/chat/conversations/${id}`);
    state.conversationId = id;
    renderMessages(conversation.messages);
    el.export.hidden = false;
    await loadConversations();
    showError("");
  } catch (error) {
    showError(error.message);
  }
}

async function newConversation() {
  if (!requireToken()) return;
  try {
    const conversation = await apiJson("/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.conversationId = conversation.id;
    renderMessages([]);
    el.export.hidden = false;
    await loadConversations();
    el.input.focus();
    showError("");
  } catch (error) {
    showError(error.message);
  }
}

async function deleteConversation(id) {
  if (!confirm(t("chat.deleteConfirm"))) return;
  try {
    await api(`/api/chat/conversations/${id}`, { method: "DELETE" });
    if (state.conversationId === id) {
      state.conversationId = null;
      renderMessages([]);
      el.export.hidden = true;
    }
    await loadConversations();
  } catch (error) {
    showError(error.message);
  }
}

function handleEvent(payload, assistantText) {
  if (payload.type === "delta") {
    assistantText.textContent += payload.content;
    el.messages.scrollTop = el.messages.scrollHeight;
  } else if (payload.type === "error") {
    showError(payload.error || t("chat.startFailed"));
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const content = el.input.value.trim();
  if (!content || state.streaming) return;
  if (!requireToken()) return;

  if (!state.conversationId) await newConversation();
  if (!state.conversationId) return;

  showError("");
  el.input.value = "";
  appendMessage("user", content);
  const assistantText = appendMessage("assistant", "");
  setStreaming(true);

  state.controller = new AbortController();
  try {
    const response = await api(
      `/api/chat/conversations/${state.conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
        signal: state.controller.signal,
      }
    );

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const line = raw.split("\n").find((entry) => entry.startsWith("data:"));
        if (!line) continue;
        try {
          handleEvent(JSON.parse(line.slice(5).trim()), assistantText);
        } catch (_) { /* ignore malformed event */ }
      }
    }
    await loadConversations();
  } catch (error) {
    if (error.name !== "AbortError") showError(error.message);
  } finally {
    setStreaming(false);
    state.controller = null;
    el.input.focus();
  }
}

function stopStreaming() {
  if (state.controller) state.controller.abort();
}

async function exportConversation(event) {
  event.preventDefault();
  if (!state.conversationId) return;
  try {
    const response = await api(`/api/chat/conversations/${state.conversationId}/export`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `b-bot-conversation-${state.conversationId}.md`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showError(error.message);
  }
}

async function saveToken() {
  state.token = el.token.value.trim();
  if (el.remember.checked) {
    localStorage.setItem(TOKEN_KEY, state.token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, state.token);
    localStorage.removeItem(TOKEN_KEY);
  }
  state.membersLoaded = false;
  state.members = [];
  if (!state.token) {
    showToast(t("common.requiredToken"));
    return;
  }
  await refreshAll();
  showToast(t("common.saved"));
}

el.token.value = state.token;
el.remember.checked = Boolean(localStorage.getItem(TOKEN_KEY));
applyTranslations();

el.langToggle.addEventListener("click", toggleLanguage);
el.saveToken.addEventListener("click", saveToken);
el.refreshToday.addEventListener("click", loadDashboard);
el.memberForm.addEventListener("submit", submitMember);
el.choreForm.addEventListener("submit", submitChore);
el.reminderForm.addEventListener("submit", submitReminder);
el.notificationTestForm.addEventListener("submit", submitNotificationTest);
el.markAllRead.addEventListener("click", markAllRead);
el.newChat.addEventListener("click", newConversation);
el.composer.addEventListener("submit", sendMessage);
el.stop.addEventListener("click", stopStreaming);
el.export.addEventListener("click", exportConversation);
el.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    el.composer.requestSubmit();
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

checkHealth();
if (state.token) {
  refreshAll();
} else {
  setDefaultReminderDue();
}

window.setInterval(() => {
  if (!state.token) return;
  if (state.activeView === "today") loadDashboard(true);
  if (state.activeView === "notifications") loadNotifications(true);
}, 30000);
