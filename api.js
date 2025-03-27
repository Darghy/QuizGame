// Constants for answer uniqueness strategies
const MAX_PROMPT_ANSWERS = 75; // Max answers to inject into the prompt
const OVER_GENERATION_FACTOR = 1.8; // Request X times more questions in Strategy B (increased from 1.5 for better chance)
const STRATEGY_B_TEMPERATURE = 0.85; // Slightly higher temperature for more variety
const STRATEGY_B_PRESENCE_PENALTY = 0.1; // Small penalty to discourage token repetition

class QuizAPI {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error("API key is required for QuizAPI.");
        }
        this.apiKey = apiKey;
        this.apiUrl = 'https://api.openai.com/v1/chat/completions';
        this.model = 'gpt-4o-mini';
    }

    // *** MODIFIED: Added knownAnswerSet parameter ***
    async generateQuiz(numQuestions, difficulty, topic = '', knownAnswerSet = new Set()) {
        let systemPrompt = `You are a helpful assistant designed to generate trivia quizzes.
Generate a list of trivia questions.
Difficulty: ${difficulty}.
${topic ? `Topic: ${topic}.` : 'Topic: General Knowledge.'}
IMPORTANT: Respond ONLY with a valid JSON array adhering strictly to the following format:
[
  {
    "question": "The trivia question text?",
    "answer": "The single, most definitive correct answer.",
    "alternativeAnswers": ["alternative answer 1", "very similar answer", "common misspelling"]
  }
]
Each object in the array must have exactly these three keys: "question" (string), "answer" (string), and "alternativeAnswers" (array of strings). The "alternativeAnswers" array should contain common variations, synonyms, or acceptable alternative spellings for the main answer. If there are no reasonable alternatives, provide an empty array []. Do not include any explanations, introductory text, or any text outside the JSON array itself. Ensure the JSON is well-formed.`;

        let userPromptContent = '';
        let numToRequest = numQuestions;
        const apiParams = {
            model: this.model,
            messages: [], // Will be populated below
            response_format: { type: "json_object" },
            // Default temperature (can be overridden by Strategy B)
             temperature: 0.7,
        };

        // --- Determine Strategy based on knownAnswerSet size ---
        if (knownAnswerSet.size > 0 && knownAnswerSet.size <= MAX_PROMPT_ANSWERS) {
            // --- Strategy A: Inject known answers into prompt ---
            console.log(`Using Strategy A: Injecting ${knownAnswerSet.size} known answers into prompt.`);
            const knownAnswersArray = Array.from(knownAnswerSet);
            // Simple truncation if somehow Set is larger than constant after check
            const answersToInject = knownAnswersArray.slice(0, MAX_PROMPT_ANSWERS);
            const avoidListString = answersToInject.map(ans => `- ${ans}`).join('\n');

            systemPrompt += `\n\nIMPORTANT: Avoid generating questions where the primary answer (case-insensitive) is one of the following:\n${avoidListString}`;
            userPromptContent = `Generate ${numToRequest} ${difficulty} trivia questions${topic ? ` about ${topic}` : ''} now in the specified JSON format, avoiding the listed answers.`;

        } else {
            // --- Strategy B: Over-generate and tune parameters ---
            if (knownAnswerSet.size > MAX_PROMPT_ANSWERS) {
                 console.log(`Using Strategy B: Known answers (${knownAnswerSet.size}) exceed limit (${MAX_PROMPT_ANSWERS}). Over-generating and tuning parameters.`);
                 numToRequest = Math.ceil(numQuestions * OVER_GENERATION_FACTOR);
                 apiParams.temperature = STRATEGY_B_TEMPERATURE;
                 apiParams.presence_penalty = STRATEGY_B_PRESENCE_PENALTY;
            } else {
                // Case: No known answers (first run or cleared storage)
                console.log("Using Strategy B (default): No known answers to inject.");
                // numToRequest remains numQuestions
                // apiParams use default temperature
            }
             userPromptContent = `Generate ${numToRequest} ${difficulty} trivia questions${topic ? ` about ${topic}` : ''} now in the specified JSON format.`;
        }

        // Finalize API parameters
        apiParams.messages = [
             { role: "system", content: systemPrompt },
             { role: "user", content: userPromptContent }
        ];
         // Optional: Add max_tokens if concerned about output length, especially with over-generation
        // apiParams.max_tokens = numToRequest * 100; // Estimate: 100 tokens per question? Adjust as needed.

        console.log("Sending prompt to OpenAI:", { system: systemPrompt, user: userPromptContent });
        console.log("API Parameters:", { model: apiParams.model, numToRequest, temperature: apiParams.temperature, presence_penalty: apiParams.presence_penalty });

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(apiParams) // Use the constructed params
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("API Error Response:", errorData);
                throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
            }

            const data = await response.json();
            console.log("Raw API Response:", data);

            if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
                throw new Error("Invalid response structure received from OpenAI.");
            }

            const content = data.choices[0].message.content;
            console.log("Extracted Content:", content);

            // Pass numToRequest for validation check, although strict count isn't required here
            return this._parseAndValidate(content, numToRequest);

        } catch (error) {
            console.error("Error generating quiz:", error);
            throw error;
        }
    }

    // _parseAndValidate remains largely the same, maybe relax the count check warning
    _parseAndValidate(jsonString, expectedCount) {
        let parsedData = null;
        try {
            // ... (parsing logic remains the same: direct parse, nested array check) ...
             parsedData = JSON.parse(jsonString);
            if (typeof parsedData === 'object' && !Array.isArray(parsedData)) {
                const keys = Object.keys(parsedData);
                if (keys.length === 1 && Array.isArray(parsedData[keys[0]])) {
                    console.log("Found array nested within object key:", keys[0]);
                    parsedData = parsedData[keys[0]];
                } else {
                    for (const key in parsedData) {
                        if (Array.isArray(parsedData[key])) {
                            console.log("Found array nested within object key:", key);
                            parsedData = parsedData[key];
                            break;
                        }
                    }
                    if (!Array.isArray(parsedData)) {
                         throw new Error("Parsed JSON object does not directly contain the expected array.");
                    }
                }
            }
        } catch (e) {
            console.warn("Direct JSON parsing failed. Attempting regex fallback.", e);
            const jsonArrayMatch = jsonString.match(/\[\s*\{[\s\S]*?\}\s*\]/);
            if (jsonArrayMatch) {
                try {
                    console.log("Trying to parse regex match:", jsonArrayMatch[0]);
                    parsedData = JSON.parse(jsonArrayMatch[0]);
                } catch (e2) {
                    console.error("Regex JSON parsing failed.", e2);
                    throw new Error("Failed to parse JSON response from OpenAI, even with fallbacks.");
                }
            } else {
                throw new Error("Could not find a valid JSON array structure in the response.");
            }
        }

        if (!Array.isArray(parsedData)) {
            throw new Error("Parsed data is not a JSON array.");
        }

        const validatedQuestions = [];
        for (let i = 0; i < parsedData.length; i++) {
            const q = parsedData[i];
            if (typeof q !== 'object' || q === null ||
                typeof q.question !== 'string' || q.question.trim() === '' ||
                typeof q.answer !== 'string' || q.answer.trim() === '' ||
                !Array.isArray(q.alternativeAnswers) ||
                !q.alternativeAnswers.every(alt => typeof alt === 'string')) {
                console.warn("Invalid question format found at index", i, ":", q);
                continue;
            }
            const cleanAlternatives = q.alternativeAnswers
                .map(alt => alt.trim())
                .filter(alt => alt !== '');

            validatedQuestions.push({
                question: q.question.trim(),
                answer: q.answer.trim(),
                alternativeAnswers: cleanAlternatives
            });
        }

         if (validatedQuestions.length === 0) {
            throw new Error("No valid questions could be parsed from the API response.");
        }

         // Modify count warning: Only warn if we get *significantly* fewer than requested,
         // especially in Strategy B where the initial request count is higher.
         const requestedCountForWarning = expectedCount; // Use the potentially higher count for Strategy B
        if (validatedQuestions.length < requestedCountForWarning * 0.5) { // Warn if less than 50%
            console.warn(`Expected roughly ${requestedCountForWarning} questions from API, but only validated ${validatedQuestions.length}.`);
        }


        console.log(`Successfully parsed and validated ${validatedQuestions.length} questions from API response.`);
        return validatedQuestions; // Return the potentially oversized list
    }
}