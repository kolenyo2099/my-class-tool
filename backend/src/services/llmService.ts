import OpenAI from 'openai';

interface LLMConfig {
  apiKey?: string;
  promptTemplate?: string;
}

let openai: OpenAI | null = null;

function initializeOpenAI(apiKey?: string) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OpenAI API key not configured. Please provide an API key.');
  }
  return new OpenAI({ apiKey: key });
}

/**
 * Build the prompt for the LLM
 */
function buildPrompt(userResponse: string, taskGoal: string, kbContent: string, template?: string): string {
  const defaultTemplate = `You are an educational assistant providing feedback on student responses.

Task Goal:
{taskGoal}

Context from knowledge base:
{kbContent}

Student response:
"{userResponse}"

Please analyze the response in the following steps:

1. Goal Alignment Analysis:
   - Evaluate how well the response aligns with the task's goal
   - Identify specific aspects where the response meets or falls short of the goal
   - Consider both content and approach

2. Knowledge Integration:
   - Connect relevant concepts from the provided knowledge base
   - Identify opportunities to strengthen the response using this knowledge
   - Note any misconceptions or areas for clarification

3. Feedback Formulation:
   - Start with positive acknowledgment of what was done well
   - Provide specific suggestions for improvement
   - Include actionable steps to better align with the goal
   - Reference relevant knowledge base concepts

Keep the feedback constructive, specific, and actionable. Focus on how to help the students achieve the task's goal.`;

  const promptTemplate = template || defaultTemplate;
  return promptTemplate
    .replace('{taskGoal}', taskGoal)
    .replace('{kbContent}', kbContent)
    .replace('{userResponse}', userResponse);
}

/**
 * Call the LLM API with the constructed prompt
 */
export async function callLLMApi(
  userResponse: string,
  taskGoal: string,
  kbContent: string,
  config?: LLMConfig
): Promise<string> {
  try {
    // Create a new OpenAI instance for each request to ensure we use the correct API key
    const client = initializeOpenAI(config?.apiKey);
    const prompt = buildPrompt(userResponse, taskGoal, kbContent, config?.promptTemplate);

    const completion = await client.chat.completions.create({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 250,
    });

    return completion.choices[0]?.message?.content || 'No feedback generated.';

  } catch (error) {
    console.error('[ERROR] OpenAI API call failed:', error);
    
    // Check for specific OpenAI error types
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Handle quota exceeded
      if (message.includes('insufficient_quota') || message.includes('exceeded your current quota')) {
        throw new Error('OpenAI API quota exceeded. Please check your API key and billing details.');
      }
      
      // Handle invalid API key
      if (message.includes('invalid_api_key') || message.includes('incorrect api key')) {
        throw new Error('Invalid OpenAI API key. Please check your API key configuration.');
      }
      
      // Handle rate limiting
      if (message.includes('rate_limit')) {
        throw new Error('OpenAI API rate limit reached. Please try again in a few moments.');
      }
    }
    
    // Generic error
    throw new Error('Failed to generate AI feedback. Please try again later.');
  }
} 