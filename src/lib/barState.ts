/**
 * Het antwoord van `my_bar_state()` (0028) als getypte waarde. Puur: geen
 * React, geen Supabase — zodat de vertaling van de JSON-vorm (snake_case,
 * `null`s, ontbrekende sleutels) apart getest kan worden
 * (test/barState.test.ts).
 *
 * De RPC geeft alleen data voor een actieve sessie: een gesloten of
 * inactieve sessie leert niets over diensten. Wat er niet is, komt hier als
 * `null` of een lege lijst terug.
 */

export type BarSessionStatus = "active" | "inactive" | "ended" | "no_role";
export type BarMode = "bar" | "beheer";

export type BarSessionInfo = {
  id: string;
  memberId: string;
  memberName: string;
  memberRole: "bardienst" | "beheerder";
  mode: BarMode;
  status: BarSessionStatus;
  /** Sluitreden van een beëindigde sessie (`uitgelogd`, `inactief`,
   *  `afgemeld`, `geen_bar_rol`, `niet_hervat`, `beheerder_geworden`),
   *  anders `null`. */
  endReason: string | null;
  startedAt: string;
  lastActivityAt: string;
  /** De sessie is weggevallen terwijl de dienst open bleef. */
  leftShiftOpen: boolean;
  /** Mag deze sessie na "browser dicht en weer open" hervat worden? `false`
   *  voor modus `beheer` en voor de bar-sessie van een beheerder zonder
   *  tweede factor (0034, ADR 0017); dan sluit de client haar met
   *  `niet_hervat`. */
  resumable: boolean;
};

/** De dienst van deze sessie. Ongewijzigd t.o.v. useOpenShift: DienstTabs,
 *  DienstActief, VerkoopScherm en DienstAfsluitenOverlay krijgen dit al als
 *  prop. */
export type OpenShift = {
  id: string;
  startedByName: string;
  startedAt: string;
  /** Naam van het activiteittype (docs/features/activiteittypes.md). `null`
   *  alleen voor een dienst van vóór 0019. */
  activityTypeName: string | null;
};

export type OtherShiftSession = {
  memberName: string;
  lastActivityAt: string;
};

/** Een open dienst elders (stand (a)/(b)): niet van deze sessie. */
export type OtherShift = OpenShift & {
  /** Geen actieve sessie meer in deze dienst. */
  orphan: boolean;
  sessions: OtherShiftSession[];
  /** Deze sessie staat in de bezetting van die dienst. */
  inBezetting: boolean;
};

export type LastLeft = {
  shiftId: string;
  reason: "overgenomen" | "afgesloten_door_beheerder";
  leftAt: string;
};

export type AdminMeldingReden = "inactief" | "uitgelogd" | "afgemeld" | "geen_bar_rol" | "beheerder_geworden";

/** Een openstaande beheerdermelding "dienst zonder apparaat". */
export type AdminMelding = {
  id: string;
  reason: AdminMeldingReden;
  shiftId: string;
  createdAt: string;
  /** Wie er wegviel (naam van het lid van de sessie), als bekend. */
  memberName: string | null;
  startedByName: string;
  startedAt: string;
  activityTypeName: string | null;
};

export type AdminShiftSession = {
  barSessionId: string;
  memberName: string;
  lastActivityAt: string;
};

export type AdminShift = OpenShift & { sessions: AdminShiftSession[] };

export type AdminSession = {
  id: string;
  memberName: string;
  mode: BarMode;
  startedAt: string;
  lastActivityAt: string;
  shiftId: string | null;
  isOwn: boolean;
};

export type AdminOverzicht = {
  shifts: AdminShift[];
  sessions: AdminSession[];
};

export type BarState =
  | { session: null }
  | {
      session: BarSessionInfo;
      shift: OpenShift | null;
      lastLeft: LastLeft | null;
      otherShift: OtherShift | null;
      notifications: AdminMelding[];
      /** Alleen voor een beheerder in modus `beheer`. */
      admin: AdminOverzicht | null;
    };

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(obj: Json, key: string): string {
  const value = obj[key];
  if (typeof value !== "string") throw new Error(`my_bar_state: ${key} ontbreekt`);
  return value;
}

function strOrNull(obj: Json, key: string): string | null {
  const value = obj[key];
  return typeof value === "string" ? value : null;
}

function list(obj: Json, key: string): Json[] {
  const value = obj[key];
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function toShift(raw: unknown): OpenShift | null {
  if (!isObject(raw)) return null;
  return {
    id: str(raw, "id"),
    startedByName: strOrNull(raw, "started_by_name") ?? "onbekend",
    startedAt: str(raw, "started_at"),
    activityTypeName: strOrNull(raw, "activity_type_name"),
  };
}

function toStatus(value: unknown): BarSessionStatus {
  if (value === "active" || value === "inactive" || value === "ended" || value === "no_role") {
    return value;
  }
  throw new Error("my_bar_state: onbekende status");
}

function toMelding(raw: Json): AdminMelding {
  const reason = raw.reason;
  if (
    reason !== "inactief" &&
    reason !== "uitgelogd" &&
    reason !== "afgemeld" &&
    reason !== "geen_bar_rol" &&
    reason !== "beheerder_geworden"
  ) {
    throw new Error("my_bar_state: onbekende meldingreden");
  }
  return {
    id: str(raw, "id"),
    reason,
    shiftId: str(raw, "shift_id"),
    createdAt: str(raw, "created_at"),
    memberName: strOrNull(raw, "member_name"),
    startedByName: strOrNull(raw, "started_by_name") ?? "onbekend",
    startedAt: str(raw, "started_at"),
    activityTypeName: strOrNull(raw, "activity_type_name"),
  };
}

/** Vertaalt het JSON-antwoord van `my_bar_state()`. Gooit bij een vorm die
 *  de RPC nooit teruggeeft (dan is er een bug of een verouderde client). */
export function parseBarState(raw: unknown): BarState {
  if (!isObject(raw)) throw new Error("my_bar_state: geen object");
  const sessionRaw = raw.session;
  if (sessionRaw === null || sessionRaw === undefined) return { session: null };
  if (!isObject(sessionRaw)) throw new Error("my_bar_state: session is geen object");

  const role = sessionRaw.member_role;
  const mode = sessionRaw.mode;
  if (role !== "bardienst" && role !== "beheerder") throw new Error("my_bar_state: onbekende rol");
  if (mode !== "bar" && mode !== "beheer") throw new Error("my_bar_state: onbekende modus");

  const session: BarSessionInfo = {
    id: str(sessionRaw, "id"),
    memberId: str(sessionRaw, "member_id"),
    memberName: strOrNull(sessionRaw, "member_name") ?? "onbekend",
    memberRole: role,
    mode,
    status: toStatus(sessionRaw.status),
    endReason: strOrNull(sessionRaw, "end_reason"),
    startedAt: str(sessionRaw, "started_at"),
    lastActivityAt: str(sessionRaw, "last_activity_at"),
    leftShiftOpen: sessionRaw.left_shift_open === true,
    resumable: sessionRaw.resumable === true,
  };

  const lastLeftRaw = raw.last_left;
  let lastLeft: LastLeft | null = null;
  if (
    isObject(lastLeftRaw) &&
    (lastLeftRaw.reason === "overgenomen" || lastLeftRaw.reason === "afgesloten_door_beheerder")
  ) {
    lastLeft = {
      shiftId: str(lastLeftRaw, "shift_id"),
      reason: lastLeftRaw.reason,
      leftAt: str(lastLeftRaw, "left_at"),
    };
  }

  const otherRaw = raw.other_shift;
  const otherBase = toShift(otherRaw);
  const otherShift: OtherShift | null =
    otherBase && isObject(otherRaw)
      ? {
          ...otherBase,
          orphan: otherRaw.orphan === true,
          sessions: list(otherRaw, "sessions").map((s) => ({
            memberName: strOrNull(s, "member_name") ?? "onbekend",
            lastActivityAt: str(s, "last_activity_at"),
          })),
          inBezetting: otherRaw.in_bezetting === true,
        }
      : null;

  const adminRaw = raw.admin;
  const admin: AdminOverzicht | null = isObject(adminRaw)
    ? {
        shifts: list(adminRaw, "shifts").map((s) => ({
          ...(toShift(s) as OpenShift),
          sessions: list(s, "sessions").map((x) => ({
            barSessionId: str(x, "bar_session_id"),
            memberName: strOrNull(x, "member_name") ?? "onbekend",
            lastActivityAt: str(x, "last_activity_at"),
          })),
        })),
        sessions: list(adminRaw, "sessions").map((s) => ({
          id: str(s, "id"),
          memberName: strOrNull(s, "member_name") ?? "onbekend",
          mode: s.mode === "beheer" ? "beheer" : "bar",
          startedAt: str(s, "started_at"),
          lastActivityAt: str(s, "last_activity_at"),
          shiftId: strOrNull(s, "shift_id"),
          isOwn: s.is_own === true,
        })),
      }
    : null;

  return {
    session,
    shift: toShift(raw.shift),
    lastLeft,
    otherShift,
    notifications: list(raw, "notifications").map(toMelding),
    admin,
  };
}
