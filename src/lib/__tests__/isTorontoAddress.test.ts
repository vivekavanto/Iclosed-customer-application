// The portal half of the Toronto-detection twin.
//
// The portal LOCKS this flag: a client cannot correct it, so if the address is
// read wrong the municipal land transfer tax is wrong and nothing on their
// screen lets them say so. The admin repo carries the same cases in
// tests/isTorontoAddress.test.ts — a change on one side alone should fail here.

import { isTorontoAddress } from "../isTorontoAddress";

test("the former municipalities are Toronto", () => {
  // Scarborough, North York, Etobicoke, East York and York have been the City
  // of Toronto since the 1998 amalgamation. Every one was previously missed.
  for (const address of [
    "2 Progress Ave, Scarborough, ON",
    "45 Yonge St, North York, ON",
    "300 The East Mall, Etobicoke, ON",
    "1 Pape Ave, East York, ON",
    "12 Weston Rd, York, ON",
    "100 Queen St W, Toronto, ON",
  ]) {
    expect(isTorontoAddress(address)).toBe(true);
  }
});

test("a street named Toronto in another city is not Toronto", () => {
  expect(isTorontoAddress("5 Toronto Street, Mississauga, ON")).toBe(false);
  expect(isTorontoAddress("8 Toronto Blvd, Barrie, ON")).toBe(false);
});

test("neighbouring municipalities are not Toronto", () => {
  for (const address of [
    "77 City Centre Dr, Mississauga, ON",
    "22 Arctic Willow Road, Brampton, ON",
    "9 Main St, Markham, ON",
  ]) {
    expect(isTorontoAddress(address)).toBe(false);
  }
});

test("postal code decides, in both directions", () => {
  expect(isTorontoAddress("2 Progress Ave, ON M1P 2Z7")).toBe(true);
  expect(isTorontoAddress("5 Toronto Street, Mississauga, ON L5A 1B2")).toBe(false);
});

test("nothing usable is not Toronto", () => {
  expect(isTorontoAddress("")).toBe(false);
  expect(isTorontoAddress(null)).toBe(false);
});
