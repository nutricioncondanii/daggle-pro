import { Achievement } from '../types/dag';

export const achievements: Achievement[] = [
  {
    id: 'first-correct',
    name: 'Primera Respuesta',
    description: 'Responde correctamente tu primer ejercicio',
    icon: '⭐',
    condition: (s) => s.questionsCorrect >= 1,
  },
  {
    id: 'streak-3',
    name: 'En Racha',
    description: 'Responde 3 ejercicios correctos seguidos',
    icon: '🔥',
    condition: (s) => s.bestStreak >= 3,
  },
  {
    id: 'streak-5',
    name: 'Imparable',
    description: 'Responde 5 ejercicios correctos seguidos',
    icon: '💫',
    condition: (s) => s.bestStreak >= 5,
  },
  {
    id: 'streak-10',
    name: 'Maestro Causal',
    description: 'Responde 10 ejercicios correctos seguidos',
    icon: '👑',
    condition: (s) => s.bestStreak >= 10,
  },
  {
    id: 'level-3',
    name: 'Intermedio',
    description: 'Alcanza el nivel 3',
    icon: '📊',
    condition: (s) => s.level >= 3,
  },
  {
    id: 'level-5',
    name: 'Avanzado',
    description: 'Alcanza el nivel 5',
    icon: '🎯',
    condition: (s) => s.level >= 5,
  },
  {
    id: 'level-8',
    name: 'Experto',
    description: 'Alcanza el nivel 8',
    icon: '🏆',
    condition: (s) => s.level >= 8,
  },
  {
    id: 'perfect-10',
    name: 'Perfeccionista',
    description: 'Responde 10 ejercicios sin error',
    icon: '💎',
    condition: (s) => s.questionsAnswered >= 10 && s.questionsCorrect === s.questionsAnswered,
  },
  {
    id: 'answered-25',
    name: 'Dedicado',
    description: 'Responde 25 ejercicios',
    icon: '📚',
    condition: (s) => s.questionsAnswered >= 25,
  },
  {
    id: 'answered-50',
    name: 'Incansable',
    description: 'Responde 50 ejercicios',
    icon: '🦾',
    condition: (s) => s.questionsAnswered >= 50,
  },
];
