import type { Difficulty } from '../../data/ski-runs';

export const DIFFICULTY_TEXT: Record<Difficulty, string> = { green: 'Beginner', blue: 'Intermediate', black: 'Advanced', 'double-black': 'Expert' };

/** North American trail symbol: green circle, blue square, black diamond, double black. */
export default function DifficultyBadge({ difficulty, size = 'normal' }: { difficulty: Difficulty; size?: 'normal' | 'small' }) {
  return <span className={`trail-badge trail-${difficulty} trail-${size}`} aria-hidden="true">
    <i />{difficulty === 'double-black' && <i />}
  </span>;
}
