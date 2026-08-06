const COOKIE_NAME = "fleetmind_settings";
const MAX_COOKIE_PAYLOAD = 4096;
const ALLOWED_CHANNELS = new Set(["email", "sns", "ses", "webhook"]);
const ALLOWED_MODES = new Set(["baked", "upload", "apiPush"]);

export const DEFAULT_SETTINGS = Object.freeze({
  thresholdPct: 10,
  alertHorizonDays: 30,
  channels: Object.freeze(["sns"]),
  emailRecipients: Object.freeze([]),
  snsTopicArn: "",
  notifySchedule: "30 12 * * *",
  fuelTypeMapping: Object.freeze({
    VLSFO: "VLSFO",
    LSFO: "VLSFO",
    MGO: "MGO",
    LSMGO: "MGO",
    HSFO: "HSFO"
  }),
  fuelTypeDefault: "VLSFO",
  dataSourceMode: "baked"
});

export function defaultSettings() {
  return structuredClone(DEFAULT_SETTINGS);
}

function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const equals = part.indexOf("=");
    if (equals < 0) continue;
    cookies.set(part.slice(0, equals).trim(), part.slice(equals + 1).trim());
  }
  return cookies;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidStoredSettings(value) {
  if (!isPlainObject(value)) return false;
  try {
    validateThreshold(value.thresholdPct);
    validatePatch({
      alertHorizonDays: value.alertHorizonDays,
      channels: value.channels,
      emailRecipients: value.emailRecipients,
      snsTopicArn: value.snsTopicArn,
      notifySchedule: value.notifySchedule,
      fuelTypeMapping: value.fuelTypeMapping,
      fuelTypeDefault: value.fuelTypeDefault,
      dataSourceMode: value.dataSourceMode
    });
    const expectedKeys = Object.keys(DEFAULT_SETTINGS);
    return Object.keys(value).length === expectedKeys.length
      && expectedKeys.every((key) => Object.hasOwn(value, key));
  } catch {
    return false;
  }
}

export function readSettings(cookieHeader) {
  const encoded = parseCookies(cookieHeader).get(COOKIE_NAME);
  if (!encoded || encoded.length > MAX_COOKIE_PAYLOAD) return defaultSettings();
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return isValidStoredSettings(parsed) ? structuredClone(parsed) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function settingsCookie(settings) {
  const encoded = Buffer.from(JSON.stringify(settings), "utf8").toString("base64url");
  return `${COOKIE_NAME}=${encoded}; Path=/; SameSite=Lax; Max-Age=2592000`;
}

export function validateThreshold(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 50) {
    throw new Error("threshold must satisfy 0 < value <= 50");
  }
}

export function validatePatch(update) {
  if (update === null || update === undefined) return;
  if (!isPlainObject(update)) throw new Error("invalid settings payload");

  if (update.thresholdPct !== null && update.thresholdPct !== undefined) {
    validateThreshold(update.thresholdPct);
  }
  if (update.alertHorizonDays !== null && update.alertHorizonDays !== undefined
      && (!Number.isInteger(update.alertHorizonDays)
        || update.alertHorizonDays < 1 || update.alertHorizonDays > 365)) {
    throw new Error("alertHorizonDays must satisfy 1 <= value <= 365");
  }
  if (update.channels !== null && update.channels !== undefined) {
    if (!Array.isArray(update.channels)) throw new Error("unknown channel: undefined");
    for (const channel of update.channels) {
      if (typeof channel !== "string" || !ALLOWED_CHANNELS.has(channel)) {
        throw new Error(`unknown channel: ${channel}`);
      }
    }
  }
  if (update.emailRecipients !== null && update.emailRecipients !== undefined) {
    if (!Array.isArray(update.emailRecipients)) {
      throw new Error(`invalid email recipient: ${update.emailRecipients}`);
    }
    for (const recipient of update.emailRecipients) {
      if (typeof recipient !== "string" || recipient.trim() === "" || !recipient.includes("@")) {
        throw new Error(`invalid email recipient: ${recipient}`);
      }
    }
  }
  if (update.snsTopicArn !== null && update.snsTopicArn !== undefined) {
    if (typeof update.snsTopicArn !== "string") {
      throw new Error("snsTopicArn must start with arn:aws:sns:");
    }
    const arn = update.snsTopicArn.trim();
    if (arn !== "" && !arn.startsWith("arn:aws:sns:")) {
      throw new Error("snsTopicArn must start with arn:aws:sns:");
    }
  }
  if (update.notifySchedule !== null && update.notifySchedule !== undefined
      && (typeof update.notifySchedule !== "string" || update.notifySchedule.trim() === "")) {
    throw new Error("notifySchedule must not be blank");
  }
  if (update.fuelTypeMapping !== null && update.fuelTypeMapping !== undefined) {
    if (!isPlainObject(update.fuelTypeMapping)) {
      throw new Error("fuelTypeMapping keys/values must not be blank");
    }
    for (const [key, value] of Object.entries(update.fuelTypeMapping)) {
      if (key.trim() === "" || typeof value !== "string" || value.trim() === "") {
        throw new Error("fuelTypeMapping keys/values must not be blank");
      }
    }
  }
  if (update.fuelTypeDefault !== null && update.fuelTypeDefault !== undefined
      && (typeof update.fuelTypeDefault !== "string" || update.fuelTypeDefault.trim() === "")) {
    throw new Error("fuelTypeDefault must not be blank");
  }
  if (update.dataSourceMode !== null && update.dataSourceMode !== undefined
      && !ALLOWED_MODES.has(update.dataSourceMode)) {
    throw new Error("dataSourceMode must be one of baked|upload|apiPush");
  }
}

export function applyPatch(current, update) {
  if (update === null || update === undefined) return structuredClone(current);
  validatePatch(update);
  const next = structuredClone(current);
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (update[key] === null || update[key] === undefined) continue;
    if (["snsTopicArn", "notifySchedule", "fuelTypeDefault"].includes(key)) {
      next[key] = update[key].trim();
    } else if (key === "channels") {
      next[key] = [...new Set(update[key])];
    } else {
      next[key] = structuredClone(update[key]);
    }
  }
  return next;
}

export function adminSnapshot(settings) {
  return {
    ...structuredClone(settings),
    snsConfigured: false,
    sesConfigured: false,
    webhookConfigured: false
  };
}
