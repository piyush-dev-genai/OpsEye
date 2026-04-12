export interface HybridSearchOptions<TResult> {
  readonly vectorSearch: () => Promise<readonly TResult[]>;
  readonly keywordQuery?: string;
}

// Placeholder: lexical retrieval is not implemented yet, so hybrid search
// currently falls back to the vector path while preserving a stable interface.
export async function hybridSearch<TResult>(
  options: HybridSearchOptions<TResult>,
): Promise<readonly TResult[]> {
  return options.vectorSearch();
}
