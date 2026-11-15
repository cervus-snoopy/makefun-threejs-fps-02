// state.js — the match state machine and the money. Pure logic, no drawing:
// LOBBY -> BUY -> ROUND -> ROUND_END -> (BUY | MATCH_END).
// A round ends when one team is wiped out, or when the clock runs out —
// a timeout goes to Sentinel, the defenders, as in classic round shooters.

import { MAP } from "./map.js";
import { ECONOMY, WEAPONS } from "./weapons.js";

export const PHASE = {
  LOBBY: "lobby",
  BUY: "buy",
  ROUND: "round",
  ROUND_END: "round_end",
  MATCH_END: "match_end",
};

const ARMOR_PRICE = 650;
const ARMOR_AMOUNT = 50;

// Losing-streak payout: the base loss purse plus a bonus per consecutive
// loss, capped after two steps.
export function lossPayout(streak) {
  const steps = Math.min(streak - 1, 2);
  return ECONOMY.roundLoss + steps * ECONOMY.roundLossStreakBonus;
}

export class Match {
  constructor(seed) {
    this.seed = seed;
    this.phase = PHASE.LOBBY;
    this.round = 1;
    this.score = { vanguard: 0, sentinel: 0 };
    this.lossStreak = { vanguard: 0, sentinel: 0 };
    this.timeLeft = MAP.roundTime;
    this.buyTimeLeft = MAP.buyTime;
    this.money = ECONOMY.startMoney;
    this.kills = 0;
    this.deaths = 0;
    this.winner = null;
  }

  startMatch() {
    this.phase = PHASE.BUY;
    this.buyTimeLeft = MAP.buyTime;
  }

  startRound() {
    this.phase = PHASE.ROUND;
    this.timeLeft = MAP.roundTime;
  }

  endRound(winningTeam, reason) {
    if (this.phase !== PHASE.ROUND) return null;
    this.phase = PHASE.ROUND_END;
    this.score[winningTeam] += 1;
    const losingTeam = winningTeam === "vanguard" ? "sentinel" : "vanguard";
    this.lossStreak[losingTeam] += 1;
    this.lossStreak[winningTeam] = 0;
    // Payday: the winners take the round-win purse; the losers take the
    // loss purse plus a streak bonus that caps after two steps.
    const lossPay = lossPayout(this.lossStreak[losingTeam]);
    this.money += winningTeam === "vanguard" ? ECONOMY.roundWin : lossPay;
    const matchOver =
      this.score[winningTeam] >= MAP.roundsToWin || this.round >= MAP.maxRounds;
    return { winner: winningTeam, reason, matchOver, lossPay };
  }

  nextRound() {
    if (this.round >= MAP.maxRounds) return false;
    this.round += 1;
    this.phase = PHASE.BUY;
    this.buyTimeLeft = MAP.buyTime;
    return true;
  }

  finishMatch() {
    this.phase = PHASE.MATCH_END;
    this.winner = this.score.vanguard > this.score.sentinel ? "vanguard" : "sentinel";
    return this.winner;
  }

  tick(dt) {
    if (this.phase === PHASE.ROUND) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        return { timeout: true };
      }
    } else if (this.phase === PHASE.BUY) {
      this.buyTimeLeft -= dt;
      if (this.buyTimeLeft <= 0) {
        this.buyTimeLeft = 0;
        return { buyDone: true };
      }
    }
    return null;
  }

  canAfford(price) {
    return this.money >= price;
  }

  buy(itemId) {
    // Returns { ok, item } on success, { ok: false, reason } otherwise.
    if (this.phase !== PHASE.BUY) return { ok: false, reason: "Buy phase is over" };
    if (itemId === "armor") {
      if (!this.canAfford(ARMOR_PRICE)) return { ok: false, reason: "Not enough money" };
      this.money -= ARMOR_PRICE;
      return { ok: true, item: "armor" };
    }
    const def = WEAPONS[itemId];
    if (!def) return { ok: false, reason: "Unknown item" };
    if (!this.canAfford(def.price)) return { ok: false, reason: "Not enough money" };
    this.money -= def.price;
    return { ok: true, item: itemId };
  }
}

// The vest's protection, shared with the buy menu: 50 armour points.
// r2 polish: state re-authored (same rules, same payouts, same phase flow).
export { ARMOR_AMOUNT };
