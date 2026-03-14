import { useState, useCallback, useEffect } from 'react';
import { GameState } from '../types/dag';
import { achievements } from '../levels/achievements';

const STORAGE_KEY = 'daggle-pro-state';

const initialState: GameState = {
  score: 0,
  streak: 0,
  bestStreak: 0,
  level: 1,
  questionsAnswered: 0,
  questionsCorrect: 0,
  achievements: [],
};

function loadState(): GameState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...initialState, ...JSON.parse(saved) };
  } catch {}
  return initialState;
}

export function useGameState() {
  const [state, setState] = useState<GameState>(loadState);
  const [newAchievement, setNewAchievement] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const checkAchievements = useCallback((newState: GameState) => {
    for (const achievement of achievements) {
      if (!newState.achievements.includes(achievement.id) && achievement.condition(newState)) {
        newState.achievements.push(achievement.id);
        setNewAchievement(achievement.id);
        setTimeout(() => setNewAchievement(null), 3000);
      }
    }
    return newState;
  }, []);

  const recordAnswer = useCallback((correct: boolean) => {
    setState(prev => {
      const newState = { ...prev };
      newState.questionsAnswered++;

      if (correct) {
        newState.questionsCorrect++;
        newState.streak++;
        newState.bestStreak = Math.max(newState.bestStreak, newState.streak);
        newState.score += 10 * newState.streak; // Combo bonus

        // Level up every 3 correct answers
        if (newState.questionsCorrect % 3 === 0) {
          newState.level = Math.min(10, newState.level + 1);
        }
      } else {
        newState.streak = 0;
      }

      return checkAchievements({ ...newState, achievements: [...newState.achievements] });
    });
  }, [checkAchievements]);

  const resetState = useCallback(() => {
    setState(initialState);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { state, recordAnswer, resetState, newAchievement };
}
