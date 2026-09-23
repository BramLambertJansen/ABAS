import { fakeAuth } from "./authCalls.ts";

/**
 * Nep-vervanger van src/lib/linkInvitedMemberAccount.ts voor
 * test/beheerCallback.test.ts — registreert alleen dát hij aangeroepen is.
 */
export async function linkInvitedMemberAccount(): Promise<void> {
  fakeAuth().calls.push({ method: "linkInvitedMemberAccount" });
}
