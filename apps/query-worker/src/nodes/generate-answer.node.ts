import type { AnswerService } from "../services/answer.service";
import type { QueryWorkflowState } from "../workflow/state";

export interface GenerateAnswerNodeDependencies {
  readonly answerService: AnswerService;
}

export function createGenerateAnswerNode(
  dependencies: GenerateAnswerNodeDependencies,
): (
  state: QueryWorkflowState,
) => Promise<Pick<QueryWorkflowState, "finalAnswer">> {
  return async (
    state: QueryWorkflowState,
  ): Promise<Pick<QueryWorkflowState, "finalAnswer">> => {
    if (state.builtContext === undefined) {
      throw new Error("Built context is required before answer generation.");
    }

    const finalAnswer = await dependencies.answerService.generate({
      queryRequest: state.queryRequest,
      builtContext: state.builtContext,
    });

    return { finalAnswer };
  };
}
