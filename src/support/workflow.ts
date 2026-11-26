export type WorkflowStep = <T>(name: string, action: () => Promise<T>) => Promise<T>;
export interface WorkflowProgress { stage: string; lastCompletedStage?: string; failedStage?: string }

/** Keep failed transitions separate from the last confirmed completion. Never retry actions. */
export function checkpointSteps(step: WorkflowStep, progress: WorkflowProgress, onComplete?: () => void): WorkflowStep {
  return async (name, action) => {
    progress.stage = `started: ${name}`;
    delete progress.failedStage;
    let result: Awaited<ReturnType<typeof action>>;
    try { result = await step(name, action); }
    catch (error) {
      progress.failedStage = name;
      const reason = error instanceof Error ? error.message : 'Operation failed without an error message.';
      throw new Error(`${name} failed. ${reason} Last confirmed completed step: ${progress.lastCompletedStage ?? 'none in this workflow'}. Review this run's attached identities before repeating a mutation.`, {cause: error});
    }
    progress.stage = `completed: ${name}`;
    progress.lastCompletedStage = name;
    try { onComplete?.(); }
    catch (error) {
      throw new Error(`Checkpoint logging failed after ${name} completed. The business action was not retried; inspect retained effects before recovery.`, {cause: error});
    }
    return result;
  };
}
