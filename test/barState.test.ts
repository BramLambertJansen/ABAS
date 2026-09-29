import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBarState } from "../src/lib/barState.ts";

/**
 * `my_bar_state()` (0028) → getypte waarde. De RPC geeft snake_case JSON met
 * `null`s en ontbrekende sleutels; de vertaling moet dat opvangen en bij een
 * vorm die de RPC nooit teruggeeft gooien in plaats van iets te verzinnen.
 */

const SESSIE = {
  id: "s1",
  member_id: "m1",
  member_name: "Tom Willems",
  member_role: "bardienst",
  mode: "bar",
  status: "active",
  end_reason: null,
  started_at: "2026-09-29T10:00:00Z",
  last_activity_at: "2026-09-29T10:30:00Z",
  left_shift_open: false,
};

test("geen sessie: { session: null }", () => {
  assert.deepEqual(parseBarState({ session: null }), { session: null });
  assert.deepEqual(parseBarState({}), { session: null });
});

test("een actieve sessie zonder dienst", () => {
  const state = parseBarState({ session: SESSIE, shift: null, last_left: null, other_shift: null });
  assert.ok(state.session);
  assert.equal(state.session.memberName, "Tom Willems");
  assert.equal(state.session.memberRole, "bardienst");
  assert.equal(state.session.mode, "bar");
  assert.equal(state.session.status, "active");
  assert.equal(state.session.leftShiftOpen, false);
  assert.equal(state.shift, null);
  assert.equal(state.otherShift, null);
  assert.equal(state.lastLeft, null);
  assert.deepEqual(state.notifications, []);
  assert.equal(state.admin, null);
});

test("de eigen dienst met activiteittype", () => {
  const state = parseBarState({
    session: SESSIE,
    shift: {
      id: "d1",
      started_by_name: "Tom Willems",
      started_at: "2026-09-29T10:05:00Z",
      activity_type_name: "Training",
    },
  });
  assert.ok(state.session);
  assert.deepEqual(state.shift, {
    id: "d1",
    startedByName: "Tom Willems",
    startedAt: "2026-09-29T10:05:00Z",
    activityTypeName: "Training",
  });
});

test("een dienst zonder activiteittype (van vóór 0019) heeft activityTypeName null", () => {
  const state = parseBarState({
    session: SESSIE,
    shift: { id: "d1", started_by_name: "X", started_at: "2026-09-29T10:05:00Z" },
  });
  assert.ok(state.session);
  assert.equal(state.shift?.activityTypeName, null);
});

test("een dienst elders, met wie er ingelogd is, en een wees-dienst", () => {
  const state = parseBarState({
    session: SESSIE,
    shift: null,
    other_shift: {
      id: "d2",
      started_by_name: "Sanne Bakker",
      started_at: "2026-09-29T09:00:00Z",
      activity_type_name: "Toernooi",
      orphan: false,
      in_bezetting: true,
      sessions: [{ member_name: "Sanne Bakker", last_activity_at: "2026-09-29T10:20:00Z" }],
    },
  });
  assert.ok(state.session);
  assert.equal(state.otherShift?.orphan, false);
  assert.equal(state.otherShift?.inBezetting, true);
  assert.deepEqual(state.otherShift?.sessions, [
    { memberName: "Sanne Bakker", lastActivityAt: "2026-09-29T10:20:00Z" },
  ]);

  const wees = parseBarState({
    session: SESSIE,
    other_shift: {
      id: "d2",
      started_by_name: "Sanne Bakker",
      started_at: "2026-09-29T09:00:00Z",
      orphan: true,
      sessions: [],
    },
  });
  assert.ok(wees.session);
  assert.equal(wees.otherShift?.orphan, true);
  assert.deepEqual(wees.otherShift?.sessions, []);
});

test("waarom de laatste koppeling eindigde: alleen overgenomen en afgesloten door beheerder", () => {
  const overgenomen = parseBarState({
    session: SESSIE,
    last_left: { shift_id: "d1", reason: "overgenomen", left_at: "2026-09-29T10:40:00Z" },
  });
  assert.ok(overgenomen.session);
  assert.deepEqual(overgenomen.lastLeft, {
    shiftId: "d1",
    reason: "overgenomen",
    leftAt: "2026-09-29T10:40:00Z",
  });

  const onbekend = parseBarState({
    session: SESSIE,
    last_left: { shift_id: "d1", reason: "uitgelogd", left_at: "2026-09-29T10:40:00Z" },
  });
  assert.ok(onbekend.session);
  assert.equal(onbekend.lastLeft, null);
});

test("een gesloten sessie: status en reden komen mee, zonder dienstdata", () => {
  const state = parseBarState({
    session: { ...SESSIE, status: "ended", end_reason: "afgemeld", left_shift_open: true },
  });
  assert.ok(state.session);
  assert.equal(state.session.status, "ended");
  assert.equal(state.session.endReason, "afgemeld");
  assert.equal(state.session.leftShiftOpen, true);
  assert.equal(state.shift, null);
});

test("meldingen voor een beheerder", () => {
  const state = parseBarState({
    session: { ...SESSIE, member_role: "beheerder" },
    notifications: [
      {
        id: "n1",
        reason: "inactief",
        shift_id: "d1",
        created_at: "2026-09-29T11:00:00Z",
        member_name: "Tom Willems",
        started_by_name: "Tom Willems",
        started_at: "2026-09-29T10:00:00Z",
        activity_type_name: "Training",
      },
    ],
  });
  assert.ok(state.session);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].reason, "inactief");
  assert.equal(state.notifications[0].memberName, "Tom Willems");
});

test("het beheeroverzicht", () => {
  const state = parseBarState({
    session: { ...SESSIE, member_role: "beheerder", mode: "beheer" },
    admin: {
      shifts: [
        {
          id: "d1",
          started_by_name: "Tom Willems",
          started_at: "2026-09-29T10:00:00Z",
          activity_type_name: "Training",
          sessions: [
            { bar_session_id: "s2", member_name: "Tom Willems", last_activity_at: "2026-09-29T10:50:00Z" },
          ],
        },
      ],
      sessions: [
        {
          id: "s2",
          member_name: "Tom Willems",
          mode: "bar",
          started_at: "2026-09-29T10:00:00Z",
          last_activity_at: "2026-09-29T10:50:00Z",
          shift_id: "d1",
          is_own: false,
        },
        {
          id: "s1",
          member_name: "Femke Bos",
          mode: "beheer",
          started_at: "2026-09-29T10:10:00Z",
          last_activity_at: "2026-09-29T10:55:00Z",
          shift_id: null,
          is_own: true,
        },
      ],
    },
  });
  assert.ok(state.session);
  assert.equal(state.admin?.shifts.length, 1);
  assert.equal(state.admin?.shifts[0].sessions[0].barSessionId, "s2");
  assert.equal(state.admin?.sessions[1].isOwn, true);
  assert.equal(state.admin?.sessions[1].shiftId, null);
  assert.equal(state.admin?.sessions[1].mode, "beheer");
});

test("een vorm die de RPC nooit teruggeeft, gooit", () => {
  assert.throws(() => parseBarState(null));
  assert.throws(() => parseBarState("x"));
  assert.throws(() => parseBarState({ session: "x" }));
  assert.throws(() => parseBarState({ session: { ...SESSIE, status: "kapot" } }));
  assert.throws(() => parseBarState({ session: { ...SESSIE, member_role: "lid" } }));
  assert.throws(() => parseBarState({ session: { ...SESSIE, mode: "kassa" } }));
  assert.throws(() => parseBarState({ session: { ...SESSIE, id: undefined } }));
});
