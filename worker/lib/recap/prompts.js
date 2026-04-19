/**
 * prompts.js
 * Recap generation: structured summary preprocessing + prompt builders.
 */

export const SYSTEM_PROMPT = `You are a sports writer covering HBCU athletics. Write clear, engaging, AP-style game recaps with light personality. Avoid filler. Focus on what happened, who mattered, and why it matters.`;

/**
 * Build a recap summary from a normalized game object (output of normalizeGame).
 * Accepts the canonical shape: game.away.display_name, game.away.score, etc.
 */
export function buildRecapSummary(game, boxScore = null) {
  return {
    sport: game.sport,
    conference: game.conference,
    start_time: game.start_time,
    status: game.status,

    home: {
      name: game.home?.display_name || game.home_team || null,
      full: game.home?.full_name    || game.home_team_full || null,
      score: game.home?.score       ?? game.home_score ?? null,
      record: game.home?.record     || game.home_record || null,
    },
    away: {
      name: game.away?.display_name || game.away_team || null,
      full: game.away?.full_name    || game.away_team_full || null,
      score: game.away?.score       ?? game.away_score ?? null,
      record: game.away?.record     || game.away_record || null,
    },

    venue: game.venue || null,
    box: boxScore,
  };
}

export function buildUserPrompt(summary) {
  const { home, away } = summary;

  return `Write a short game recap.

Game:
${away.full || away.name} (${away.record || ''}) at ${home.full || home.name} (${home.record || ''})
Final Score: ${away.score} - ${home.score}

Conference: ${summary.conference || 'N/A'}
Sport: ${summary.sport}

If relevant, mention key performances or turning points.
Keep it concise (2-4 paragraphs).`;
}
