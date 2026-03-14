import { useState, useMemo, useCallback } from 'react';
import DagCanvas from '../DagCanvas/DagCanvas';
import { tutorialSteps } from '../../levels/tutorials';
import { findMinimalAdjustmentSets } from '../../engine/adjustment';
import './TutorialMode.css';

interface TutorialModeProps {
  onComplete: () => void;
}

export default function TutorialMode({ onComplete }: TutorialModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(false);

  const step = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;

  const toggleNode = useCallback((nodeId: string) => {
    if (quizSubmitted) return;
    if (nodeId === step.dag.exposure || nodeId === step.dag.outcome) return;
    setSelectedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, [quizSubmitted, step]);

  const handleQuizSubmit = useCallback(() => {
    const correctSets = findMinimalAdjustmentSets(step.dag);
    const selected = [...selectedNodes].sort();
    const correct = correctSets.some(set => {
      const sorted = [...set].sort();
      return sorted.length === selected.length && sorted.every((v, i) => v === selected[i]);
    });
    setQuizCorrect(correct);
    setQuizSubmitted(true);
  }, [selectedNodes, step]);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setCurrentStep(prev => prev + 1);
    setShowQuiz(false);
    setSelectedNodes(new Set());
    setQuizSubmitted(false);
    setQuizCorrect(false);
  }, [isLastStep, onComplete]);

  const handlePrev = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1));
    setShowQuiz(false);
    setSelectedNodes(new Set());
    setQuizSubmitted(false);
  }, []);

  return (
    <div className="tutorial-mode">
      <div className="tutorial-progress">
        {tutorialSteps.map((_, i) => (
          <div
            key={i}
            className={`progress-dot ${i === currentStep ? 'active' : i < currentStep ? 'done' : ''}`}
            onClick={() => {
              setCurrentStep(i);
              setShowQuiz(false);
              setSelectedNodes(new Set());
              setQuizSubmitted(false);
            }}
          />
        ))}
      </div>

      <div className="tutorial-content">
        <h2 className="tutorial-title">{step.title}</h2>
        <div className="tutorial-description" dangerouslySetInnerHTML={{ __html: markdownToHtml(step.description) }} />

        <DagCanvas
          graph={step.dag}
          highlightNodes={step.highlightNodes}
          showRoles={true}
          selectedNodes={showQuiz ? selectedNodes : undefined}
          onNodeClick={showQuiz ? toggleNode : undefined}
          height={300}
        />

        <div className="tutorial-explanation" dangerouslySetInnerHTML={{ __html: markdownToHtml(step.explanation) }} />

        {step.quiz && !showQuiz && (
          <button className="btn btn-secondary" onClick={() => setShowQuiz(true)}>
            Probar con ejercicio
          </button>
        )}

        {showQuiz && step.quiz && (
          <div className="tutorial-quiz">
            <div className="quiz-question">{step.quiz.prompt}</div>
            <div className="node-chips">
              {step.dag.nodes
                .filter(n => n.id !== step.dag.exposure && n.id !== step.dag.outcome)
                .map(node => (
                  <button
                    key={node.id}
                    className={`node-chip ${selectedNodes.has(node.id) ? 'selected' : ''}`}
                    onClick={() => toggleNode(node.id)}
                    disabled={quizSubmitted}
                  >
                    {node.label}
                  </button>
                ))}
            </div>
            <div className="selected-set">
              Tu respuesta: {selectedNodes.size === 0
                ? '{ } (vacío)'
                : `{ ${[...selectedNodes].map(id => step.dag.nodes.find(n => n.id === id)?.label).join(', ')} }`
              }
            </div>
            {!quizSubmitted ? (
              <button className="btn btn-primary" onClick={handleQuizSubmit}>
                Verificar
              </button>
            ) : (
              <div className={`quiz-feedback ${quizCorrect ? 'correct' : 'incorrect'}`}>
                {quizCorrect ? '¡Correcto!' : `Incorrecto. ${step.quiz.explanation}`}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tutorial-nav">
        <button className="btn btn-ghost" onClick={handlePrev} disabled={currentStep === 0}>
          ← Anterior
        </button>
        <span className="step-counter">{currentStep + 1} / {tutorialSteps.length}</span>
        <button className="btn btn-primary" onClick={handleNext}>
          {isLastStep ? 'Ir a practicar →' : 'Siguiente →'}
        </button>
      </div>
    </div>
  );
}

function markdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}
