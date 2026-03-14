import { DagGraph, QuizQuestion } from '../types/dag';

export interface TutorialStep {
  id: string;
  title: string;
  concept: string;
  description: string;
  dag: DagGraph;
  highlightNodes?: string[];
  highlightEdges?: { source: string; target: string }[];
  explanation: string;
  quiz?: QuizQuestion;
}

export const tutorialSteps: TutorialStep[] = [
  {
    id: 'intro-confounding',
    title: '1. Confusión (Confounding)',
    concept: 'confounder',
    description:
      'Un **confusor** es una variable que causa tanto la exposición como el resultado. Si no ajustamos por él, obtenemos una asociación espuria.',
    dag: {
      nodes: [
        { id: 'ice', label: 'Helados', description: 'Ventas de helado' },
        { id: 'sun', label: 'Quemaduras', description: 'Quemaduras solares' },
        { id: 'temp', label: 'Temperatura', description: 'Temperatura ambiente' },
      ],
      edges: [
        { source: 'temp', target: 'ice' },
        { source: 'temp', target: 'sun' },
      ],
      exposure: 'ice',
      outcome: 'sun',
    },
    highlightNodes: ['temp'],
    explanation:
      '**Temperatura** es un confusor: causa que se vendan más helados Y que haya más quemaduras solares. Sin ajustar por temperatura, parecería que los helados causan quemaduras. El conjunto de ajuste mínimo es: {Temperatura}.',
    quiz: {
      id: 'q-confounding',
      type: 'adjustment_set',
      dag: {} as DagGraph, // Will be filled
      prompt: '¿Por qué variable(s) debes ajustar para estimar el efecto de Helados sobre Quemaduras?',
      correctAnswer: [['temp']],
      explanation: 'Debes ajustar por Temperatura, que es el confusor.',
      difficulty: 1,
    },
  },
  {
    id: 'intro-mediation',
    title: '2. Mediación',
    concept: 'mediator',
    description:
      'Un **mediador** está en el camino causal entre exposición y resultado. NO debemos ajustar por él si queremos el efecto total.',
    dag: {
      nodes: [
        { id: 'exercise', label: 'Ejercicio' },
        { id: 'endorphins', label: 'Endorfinas' },
        { id: 'mood', label: 'Ánimo' },
      ],
      edges: [
        { source: 'exercise', target: 'endorphins' },
        { source: 'endorphins', target: 'mood' },
      ],
      exposure: 'exercise',
      outcome: 'mood',
    },
    highlightNodes: ['endorphins'],
    explanation:
      '**Endorfinas** median el efecto del ejercicio sobre el ánimo. Si ajustamos por endorfinas, bloqueamos el camino causal y subestimaríamos el efecto total del ejercicio. El conjunto de ajuste correcto es: {} (vacío).',
    quiz: {
      id: 'q-mediation',
      type: 'adjustment_set',
      dag: {} as DagGraph,
      prompt: '¿Debes ajustar por Endorfinas para estimar el efecto total de Ejercicio sobre Ánimo?',
      correctAnswer: [[]],
      explanation: 'No debes ajustar por el mediador. El conjunto correcto es vacío.',
      difficulty: 1,
    },
  },
  {
    id: 'intro-collider',
    title: '3. Sesgo del Colisionador (Collider Bias)',
    concept: 'collider',
    description:
      'Un **colisionador** recibe flechas de dos o más variables. Ajustar por un colisionador ABRE un camino espurio (¡lo opuesto a un confusor!).',
    dag: {
      nodes: [
        { id: 'talent', label: 'Talento' },
        { id: 'beauty', label: 'Belleza' },
        { id: 'fame', label: 'Fama' },
      ],
      edges: [
        { source: 'talent', target: 'fame' },
        { source: 'beauty', target: 'fame' },
      ],
      exposure: 'talent',
      outcome: 'beauty',
    },
    highlightNodes: ['fame'],
    explanation:
      '**Fama** es un colisionador: es causada por Talento Y Belleza. Si solo estudiamos personas famosas (ajustar por Fama), parecerá que talento y belleza están negativamente correlacionados. ¡No ajustes por colisionadores!',
    quiz: {
      id: 'q-collider',
      type: 'adjustment_set',
      dag: {} as DagGraph,
      prompt: '¿Debes ajustar por Fama para estimar el efecto de Talento sobre Belleza?',
      correctAnswer: [[]],
      explanation: 'No. Fama es un colisionador — ajustar por él introduce sesgo.',
      difficulty: 1,
    },
  },
  {
    id: 'intro-fork',
    title: '4. La Bifurcación (Fork)',
    concept: 'fork',
    description:
      'En una **bifurcación** (A ← B → C), B es causa común. El camino está abierto a menos que condicionemos en B.',
    dag: {
      nodes: [
        { id: 'gene', label: 'Gen' },
        { id: 'height', label: 'Altura' },
        { id: 'weight', label: 'Peso' },
      ],
      edges: [
        { source: 'gene', target: 'height' },
        { source: 'gene', target: 'weight' },
      ],
      exposure: 'height',
      outcome: 'weight',
    },
    highlightNodes: ['gene'],
    explanation:
      'La estructura Altura ← Gen → Peso es una bifurcación. Gen causa ambas variables, creando una asociación espuria. Ajustar por Gen bloquea este camino.',
  },
  {
    id: 'intro-chain',
    title: '5. La Cadena (Chain)',
    concept: 'chain',
    description:
      'En una **cadena** (A → B → C), B es un mediador. El camino causal fluye a través de B.',
    dag: {
      nodes: [
        { id: 'smoking', label: 'Fumar' },
        { id: 'tar', label: 'Alquitrán' },
        { id: 'cancer', label: 'Cáncer' },
      ],
      edges: [
        { source: 'smoking', target: 'tar' },
        { source: 'tar', target: 'cancer' },
      ],
      exposure: 'smoking',
      outcome: 'cancer',
    },
    highlightNodes: ['tar'],
    explanation:
      'Fumar → Alquitrán → Cáncer es una cadena. El alquitrán media el efecto. Si quieres el efecto total de fumar, NO ajustes por alquitrán.',
  },
  {
    id: 'mixed-1',
    title: '6. Ejemplo Mixto: Confusor + Mediador',
    concept: 'mixed',
    description:
      'Los DAGs reales mezclan múltiples estructuras. Aquí hay confusión Y mediación.',
    dag: {
      nodes: [
        { id: 'ses', label: 'Nivel Socioeconómico' },
        { id: 'edu', label: 'Educación' },
        { id: 'job', label: 'Empleo' },
        { id: 'health', label: 'Salud' },
      ],
      edges: [
        { source: 'ses', target: 'edu' },
        { source: 'ses', target: 'health' },
        { source: 'edu', target: 'job' },
        { source: 'job', target: 'health' },
      ],
      exposure: 'edu',
      outcome: 'health',
    },
    highlightNodes: ['ses', 'job'],
    explanation:
      '**Nivel Socioeconómico** es un confusor (causa Educación y Salud). **Empleo** es un mediador (Educación → Empleo → Salud). Para el efecto total: ajusta por {Nivel Socioeconómico} pero NO por Empleo.',
    quiz: {
      id: 'q-mixed-1',
      type: 'adjustment_set',
      dag: {} as DagGraph,
      prompt: '¿Qué conjunto de ajuste mínimo necesitas para el efecto total de Educación sobre Salud?',
      correctAnswer: [['ses']],
      explanation: 'Ajusta por Nivel Socioeconómico (confusor), pero no por Empleo (mediador).',
      difficulty: 2,
    },
  },
  {
    id: 'mixed-2',
    title: '7. El M-Bias',
    concept: 'mbias',
    description:
      'El **M-bias** es una estructura engañosa donde ajustar por una variable que parece confusora en realidad introduce sesgo.',
    dag: {
      nodes: [
        { id: 'u1', label: 'U₁' },
        { id: 'u2', label: 'U₂' },
        { id: 'z', label: 'Z' },
        { id: 'x', label: 'X' },
        { id: 'y', label: 'Y' },
      ],
      edges: [
        { source: 'u1', target: 'x' },
        { source: 'u1', target: 'z' },
        { source: 'u2', target: 'z' },
        { source: 'u2', target: 'y' },
        { source: 'x', target: 'y' },
      ],
      exposure: 'x',
      outcome: 'y',
    },
    highlightNodes: ['z'],
    explanation:
      'Z es un colisionador en el camino X ← U₁ → Z ← U₂ → Y. Este camino está BLOQUEADO naturalmente. Si ajustamos por Z, ¡lo abrimos! El conjunto correcto es {} (vacío).',
    quiz: {
      id: 'q-mbias',
      type: 'adjustment_set',
      dag: {} as DagGraph,
      prompt: '¿Debes ajustar por Z?',
      correctAnswer: [[]],
      explanation: 'No. Z es un colisionador — el camino ya está bloqueado. Ajustar por Z lo abriría.',
      difficulty: 3,
    },
  },
  {
    id: 'mixed-3',
    title: '8. Butterfly Bias (Mariposa)',
    concept: 'butterfly',
    description:
      'Un DAG complejo con múltiples caminos — debes identificar cuáles bloquear y cuáles dejar abiertos.',
    dag: {
      nodes: [
        { id: 'x', label: 'X' },
        { id: 'y', label: 'Y' },
        { id: 'z1', label: 'Z₁' },
        { id: 'z2', label: 'Z₂' },
        { id: 'w', label: 'W' },
      ],
      edges: [
        { source: 'x', target: 'y' },
        { source: 'z1', target: 'x' },
        { source: 'z1', target: 'y' },
        { source: 'z2', target: 'x' },
        { source: 'z2', target: 'y' },
        { source: 'w', target: 'z1' },
        { source: 'w', target: 'z2' },
      ],
      exposure: 'x',
      outcome: 'y',
    },
    highlightNodes: ['z1', 'z2', 'w'],
    explanation:
      'Z₁ y Z₂ son confusores directos. W es causa común de ambos confusores. Ajustar por {Z₁, Z₂} es suficiente — también podrías ajustar por {W}, ya que bloquea ambos caminos a través de Z₁ y Z₂.',
    quiz: {
      id: 'q-butterfly',
      type: 'adjustment_set',
      dag: {} as DagGraph,
      prompt: '¿Cuál es un conjunto de ajuste mínimo válido?',
      correctAnswer: [['z1', 'z2'], ['w']],
      explanation: 'Hay dos opciones: {Z₁, Z₂} o {W}. Ambos bloquean todos los caminos backdoor.',
      difficulty: 3,
    },
  },
];

// Fill in quiz DAGs
tutorialSteps.forEach(step => {
  if (step.quiz) {
    step.quiz.dag = step.dag;
  }
});
