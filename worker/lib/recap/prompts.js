/**
 * prompts.js
 * Recap generation: structured summary preprocessing + prompt builders.
 */

export const SYSTEM_PROMPT = `You are a sports writer covering HBCU athletics. Write clear, engaging, AP-style game recaps with light personality. Avoid filler. Focus on what happened, who mattered, and why it matters.`;

export function buildRecapSummary(game, boxScore = null) {
  return {
    sport: game.sport,
    conference: game.conference,
    start_time: game.start_time,
    status: game.status,

    home: {
      name: game.home_team_name,
      full: game.home_team_full,
      score: game.home_score,
      record: game.home_record,
    },
    away: {
      name: game.away_team_name,
      full: game.away_team_full,
      score: game.away_score,
      record: game.away_record,
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
