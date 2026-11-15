// weapons.js — fictional weapon definitions and the buy catalogue.
// Names, stats and prices are original to this build; nothing here copies a
// real-world weapon's branding.

export const WEAPONS = {
  mantis: {
    id: "mantis",
    name: "MANTIS AR",
    kind: "rifle",
    price: 2700,
    damage: 34,          // body damage per hit at close range
    headshotMult: 2,
    rpm: 600,
    magSize: 25,
    reserve: 75,
    reloadTime: 2.2,     // seconds
    spread: 0.011,       // radians of random cone
    range: 90,           // metres before falloff to zero
    auto: true,
  },
  sidewinder: {
    id: "sidewinder",
    name: "SIDEWINDER P9",
    kind: "pistol",
    price: 0,            // every operative starts with one
    damage: 26,
    headshotMult: 2,
    rpm: 320,
    magSize: 12,
    reserve: 36,
    reloadTime: 1.6,
    spread: 0.016,
    range: 45,
    auto: false,
  },
  longbow: {
    id: "longbow",
    name: "LONGBOW DMR",
    kind: "rifle",
    price: 4100,
    damage: 72,
    headshotMult: 2,
    rpm: 150,
    magSize: 10,
    reserve: 30,
    reloadTime: 2.8,
    spread: 0.002,
    range: 120,
    auto: false,
  },
  hornet: {
    id: "hornet",
    name: "HORNET SMG",
    kind: "smg",
    price: 1900,
    damage: 22,
    headshotMult: 2,
    rpm: 820,
    magSize: 32,
    reserve: 96,
    reloadTime: 2.0,
    spread: 0.022,
    range: 40,
    auto: true,
  },
};

export const GEAR = {
  armor: {
    id: "armor",
    name: "PLATE VEST",
    desc: "Absorbs half of incoming damage until it breaks. 50 armor.",
    price: 650,
  },
  mantis: {
    id: "mantis",
    name: "MANTIS AR",
    desc: "Standard-issue rifle. 25-round mag, steady at mid range.",
    price: 2700,
  },
  longbow: {
    id: "longbow",
    name: "LONGBOW DMR",
    desc: "Slow, precise marksman rifle. Two body shots at most ranges.",
    price: 4100,
  },
  hornet: {
    id: "hornet",
    name: "HORNET SMG",
    desc: "Fast, close-quarters spray. Cheap, hungry, forgiving.",
    price: 1900,
  },
};

// Economy: Counter-Strike-style, tuned for 100-second rounds.
export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  roundWin: 3250,
  roundLoss: 1900,
  roundLossStreakBonus: 500, // +500 per consecutive loss, capped at 2 steps
};
