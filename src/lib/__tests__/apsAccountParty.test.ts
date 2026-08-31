/**
 * The name comparison that decides whether a signed-in visitor is signed out.
 *
 * The two failure modes cost very different amounts. A false MISmatch throws a
 * real client out of their own account because the agreement printed a middle
 * initial. A false match leaves a session open that could have been closed.
 * These lean hard on the first being worse.
 */

import { accountIsAParty, isSamePerson, nameTokens } from "@/lib/apsPrefill";

describe("nameTokens", () => {
  it("drops punctuation, case and initials", () => {
    expect(nameTokens("Mohammed, Haneef Mugdi")).toEqual([
      "mohammed",
      "haneef",
      "mugdi",
    ]);
    expect(nameTokens("Rehana M Haneef")).toEqual(["rehana", "haneef"]);
    expect(nameTokens("J. R. Smith")).toEqual(["smith"]);
  });

  it("keeps accented letters", () => {
    expect(nameTokens("José Núñez")).toEqual(["josé", "núñez"]);
  });
});

describe("isSamePerson", () => {
  it("matches across a middle name or initial", () => {
    expect(isSamePerson("Rehana M Haneef", "Rehana Haneef")).toBe(true);
    expect(isSamePerson("Kejda Trungu", "Kejda Anne Trungu")).toBe(true);
  });

  it("matches a surname-first entry", () => {
    expect(isSamePerson("Mugdi, Haneef", "Haneef Mugdi")).toBe(true);
  });

  it("ignores case and extra whitespace", () => {
    expect(isSamePerson("  KEJDA   TRUNGU ", "Kejda Trungu")).toBe(true);
  });

  it("does not match two different people", () => {
    expect(isSamePerson("Kejda Trungu", "Aliya Copurchaser")).toBe(false);
    expect(isSamePerson("Rehana M Haneef", "Marwa Haneef")).toBe(false);
  });

  it("does not match on a shared forename alone", () => {
    expect(isSamePerson("John Smith", "John Alvarez")).toBe(false);
  });

  it("has no opinion when either name is empty", () => {
    expect(isSamePerson("", "Kejda Trungu")).toBe(false);
    expect(isSamePerson("Kejda Trungu", "   ")).toBe(false);
  });
});

describe("accountIsAParty", () => {
  const buyers = ["Rehana M Haneef", "Mohammed, Haneef Mugdi", "Marwa Haneef"];

  it("finds the account anywhere in the party list, not just first", () => {
    expect(accountIsAParty(buyers, "Marwa Haneef")).toBe(true);
    expect(accountIsAParty(buyers, "Haneef Mugdi")).toBe(true);
  });

  it("reports a visitor who is not on the agreement", () => {
    expect(accountIsAParty(buyers, "Aliya Copurchaser")).toBe(false);
  });

  // The two ways this is asked when there is nothing to go on. Both must come
  // back true: a read that found no names says nothing about who signed the
  // agreement, and a logged-out visitor has no session to end.
  it("says nothing when the read found no parties", () => {
    expect(accountIsAParty([], "Aliya Copurchaser")).toBe(true);
  });

  it("says nothing when nobody is signed in", () => {
    expect(accountIsAParty(buyers, "")).toBe(true);
  });
});
