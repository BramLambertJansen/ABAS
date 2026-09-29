import { fakeMoney } from "./moneyHookCalls.ts";

/**
 * Nep-vervanger van src/lib/barSessie.ts voor test/moneyHooksFoutlogging.test.ts:
 * de echte herkenning van de zes sessiecodes (`isSessionErrorCode`,
 * `SESSION_ERROR_CODES` — apart getest in test/barSessie.test.ts), maar
 * `notifySessionCode` registreert alleen dát een hook een sessiecode doorgaf,
 * in plaats van een window-event te versturen.
 */
export { isSessionErrorCode, SESSION_ERROR_CODES } from "../../src/lib/barSessie.ts";

export function notifySessionCode(code: string): void {
  fakeMoney().notifications.push(code);
}
