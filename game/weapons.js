// weapons.js — the armoury: fictional guns, buyable gear, and the economy.
// Every name, stat and price is invented for this build; nothing here borrows
// a real-world weapon's branding. The numbers are the game's balance: a rifle
// kills in three body shots, a pistol in four, a marksman rifle in two.

// One row per gun: id, display name, class, price, body damage, headshot
// multiplier, rounds per minute, magazine, spare ammo, reload seconds,
// spread (radians), range (metres), automatic or not.
const GUN_ROWS = [
  ["mantis", "MANTIS AR", "rifle", 2700, 34, 2, 600, 25, 75, 2.2, 0.011, 90, true],
  ["sidewinder", "SIDEWINDER P9", "pistol", 0, 26, 2, 320, 12, 36, 1.6, 0.016, 45, false],
  ["longbow", "LONGBOW DMR", "rifle", 4100, 72, 2, 150, 10, 30, 2.8, 0.002, 120, false],
  ["hornet", "HORNET SMG", "smg", 1900, 22, 2, 820, 32, 96, 2.0, 0.022, 40, true],
];

function gunFromRow(row) {
  const [id, name, kind, price, damage, headshotMult, rpm, magSize, reserve, reloadTime, spread, range, auto] = row;
  return { id, name, kind, price, damage, headshotMult, rpm, magSize, reserve, reloadTime, spread, range, auto };
}

export const WEAPONS = Object.fromEntries(GUN_ROWS.map((row) => [row[0], gunFromRow(row)]));

// The buy menu sells the same guns (by their catalogue text) plus armour.
// The pistol is free because every operative spawns with one.
// One row per item: id, display name, catalogue text, price.
const GEAR_ROWS = [
  ["armor", "PLATE VEST", "Absorbs half of incoming damage until it breaks. 50 armor.", 650],
  ["mantis", "MANTIS AR", "Standard-issue rifle. 25-round mag, steady at mid range.", 2700],
  ["longbow", "LONGBOW DMR", "Slow, precise marksman rifle. Two body shots at most ranges.", 4100],
  ["hornet", "HORNET SMG", "Fast, close-quarters spray. Cheap, hungry, forgiving.", 1900],
];

function gearFromRow(row) {
  const [id, name, desc, price] = row;
  return { id, name, desc, price };
}

export const GEAR = Object.fromEntries(GEAR_ROWS.map((row) => [row[0], gearFromRow(row)]));

// Money flow, Counter-Strike-style, tuned for 100-second rounds: a kill pays
// for half a vest, a round win pays for a rifle, a loss still pays — and a
// losing streak pays a little more each time, up to two steps.
// r2 polish: weapons re-authored as data rows (same values, same balance).
export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  roundWin: 3250,
  roundLoss: 1900,
  roundLossStreakBonus: 500,
};
