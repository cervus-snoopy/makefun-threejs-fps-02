// state.js — match state machine + economy. Pure logic, no rendering:
// LOBBY -> BUY -> ROUND -> ROUND_END -> (BUY | MATCH_END).
// A round ends when one team is wiped out, or when the timer hits zero
// (defending Sentinel wins a timeout, as in classic round shooters).

import { MAP } from "./map.js";
import { ECONOMY, WEAPONS } from "./weapons.js";

export const PHASE = {
  LOBBY: "lobby",
  BUY: "buy",
  ROUND: "round",
  ROUND_END: "round_end",
  MATCH_END: "match_end",
};

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
    const loser = winningTeam === "vanguard" ? "sentinel" : "vanguard";
    this.lossStreak[loser] += 1;
    this.lossStreak[winningTeam] = 0;
    // Economy: winner paid, loser paid, loss-streak bonus caps at two steps.
    const lossPay = ECONOMY.roundLoss +
      Math.min(this.lossStreak[loser] - 1, 2) * ECONOMY.roundLossStreakBonus;
    if (winningTeam === "vanguard") this.money += ECONOMY.roundWin;
    else this.money += lossPay;
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
    this.winner =
      this.score.vanguard > this.score.sentinel ? "vanguard" : "sentinel";
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

  canAfford(price) { return this.money >= price; }

  buy(itemId) {
    // Returns { ok, item } or { ok: false, reason }.
    if (this.phase !== PHASE.BUY) return { ok: false, reason: "Buy phase is over" };
    if (itemId === "armor") {
      if (!this.canAfford(650)) return { ok: false, reason: "Not enough money" };
      this.money -= 650;
      return { ok: true, item: "armor" };
    }
    const def = WEAPONS[itemId];
    if (!def) return { ok: false, reason: "Unknown item" };
    if (!this.canAfford(def.price)) return { ok: false, reason: "Not enough money" };
    this.money -= def.price;
    return { ok: true, item: itemId };
  }
}
