const STORAGE_KEY = 'snake_arcade_highscores';
const MAX_SCORES = 10;

export interface HighScoreEntry {
  score: number;
  date: string;
}

export function getHighScores(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HighScoreEntry[];
  } catch {
    return [];
  }
}

export function saveHighScore(score: number): number {
  const scores = getHighScores();
  const entry: HighScoreEntry = {
    score,
    date: new Date().toLocaleDateString(),
  };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, MAX_SCORES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
  return trimmed.findIndex((e) => e === entry);
}

export function getTopScore(): number {
  const scores = getHighScores();
  return scores.length > 0 ? scores[0].score : 0;
}
