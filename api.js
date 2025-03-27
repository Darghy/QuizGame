// Constants for API interaction
const MAX_PROMPT_ANSWERS = 75;

class QuizAPI {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error("API key is required for QuizAPI.");
        }
        this.apiKey = apiKey;
        this.apiUrl = 'https://api.openai.com/v1/chat/completions';
        this.model = 'gpt-4o-mini';
    }

    // generateQuiz method remains the same as the previous correct version
    async generateQuiz(numToRequest, difficulty, topic = '', knownAnswerSet = new Set(), apiOptions = {}) {
        const defaultApiParams = { temperature: 0.7, presence_penalty: 0.0 };
        const currentApiParams = { ...defaultApiParams, ...apiOptions };

        let systemPrompt = `You are a helpful assistant designed to generate trivia quizzes.
Generate a list of trivia questions.
Difficulty: ${difficulty}.
${topic ? `Topic: ${topic}.` : 'Topic: General Knowledge.'}
IMPORTANT: Respond ONLY with a valid JSON object containing a key (e.g., "questions") whose value is a JSON array adhering strictly to the following format:
[
  {
    "question": "The trivia question text?",
    "answer": "The single, most definitive correct answer.",
    "alternativeAnswers": ["alternative answer 1", "very similar answer", "common misspelling"]
  }
]
Each object in the array must have exactly these three keys: "question" (string), "answer" (string), and "alternativeAnswers" (array of strings). The "alternativeAnswers" array should contain common variations, synonyms, or acceptable alternative spellings for the main answer. If there are no reasonable alternatives, provide an empty array []. Do not include any explanations, introductory text, or any text outside the main JSON object itself. Ensure the JSON is well-formed. The array should be the value associated with a key within the JSON object.`;

        let userPromptContent = '';

        // Strategy: Inject known answers if set is small enough
        if (knownAnswerSet.size > 0 && knownAnswerSet.size <= MAX_PROMPT_ANSWERS) {
            console.log(`API: Injecting ${knownAnswerSet.size} known answers into prompt.`);
            const knownAnswersArray = Array.from(knownAnswerSet);
            const answersToInject = knownAnswersArray.slice(0, MAX_PROMPT_ANSWERS);
            const avoidListString = answersToInject.map(ans => `- ${ans}`).join('\n');
            systemPrompt += `\n\nIMPORTANT: Avoid generating questions where the primary answer (case-insensitive) is one of the following:\n${avoidListString}`;
            userPromptContent = `Generate ${numToRequest} ${difficulty} trivia questions${topic ? ` about ${topic}` : ''} now in the specified JSON object format, avoiding the listed answers.`;
        } else {
             if (knownAnswerSet.size > MAX_PROMPT_ANSWERS) {
                 console.log(`API: Known answers (${knownAnswerSet.size}) exceed prompt limit (${MAX_PROMPT_ANSWERS}). Relying on controller filtering.`);
             } else {
                console.log("API: No known answers to inject.");
             }
            userPromptContent = `Generate ${numToRequest} ${difficulty} trivia questions${topic ? ` about ${topic}` : ''} now in the specified JSON object format.`;
        }

        const requestBody = {
            model: this.model,
            messages: [ { role: "system", content: systemPrompt }, { role: "user", content: userPromptContent } ],
            response_format: { type: "json_object" },
            temperature: currentApiParams.temperature,
            presence_penalty: currentApiParams.presence_penalty,
        };

        console.log("API: Sending request. NumToRequest:", numToRequest, "Params:", { temp: requestBody.temperature, penalty: requestBody.presence_penalty });

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("API Error Response:", errorData);
                let errorMsg = `OpenAI API request failed: ${response.status} ${response.statusText}.`;
                if (errorData.error?.message) errorMsg += ` ${errorData.error.message}`;
                if (response.status === 429) errorMsg += " (Rate limit likely exceeded)";
                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
                throw new Error("Invalid response structure received from OpenAI (missing choices/content).");
            }
            const content = data.choices[0].message.content;

            // Pass content to the refined parsing logic
            return this._parseAndValidate(content, numToRequest);

        } catch (error) {
            console.error("API Error during quiz generation fetch/initial processing:", error);
            throw error;
        }
    }

    // *** REVISED _parseAndValidate Method ***
    _parseAndValidate(jsonString, requestedCount) {
        console.log("API Parse: Received content string length:", jsonString.length);
        // Log first 500 chars for debugging if needed
        // console.log("API Parse: Received content preview:", jsonString.substring(0, 500));

        let parsedObject = null;
        let finalArray = null;

        // --- Step 1: Parse the main JSON object string ---
        // This *should* succeed because we requested `json_object` format.
        try {
            parsedObject = JSON.parse(jsonString);
        } catch (e) {
            console.error("API Parse: CRITICAL - Failed to parse content as JSON object.", e.message);
            console.error("API Parse: Raw content was:", jsonString); // Log raw content on critical failure
            // If even the basic JSON object parsing fails, the API didn't adhere to `response_format`.
            // We could attempt a regex fallback here, but it's less likely to be correct.
            // Let's throw a specific error indicating the format failure.
            throw new Error(`OpenAI response was not a valid JSON object string despite request. Error: ${e.message}`);
        }

        // --- Step 2: Find the array *within* the parsed object ---
        if (parsedObject && typeof parsedObject === 'object' && parsedObject !== null) {
            console.log("API Parse: Successfully parsed JSON object. Searching for array value...");

            // Common keys to check first
            const commonKeys = ["questions", "quiz", "data", "items", "results", "list"];
            let foundKey = null;

            // Prioritize common keys
            for (const key of commonKeys) {
                if (Array.isArray(parsedObject[key])) {
                    finalArray = parsedObject[key];
                    foundKey = key;
                    console.log(`API Parse: Found array in common key "${foundKey}".`);
                    break;
                }
            }

            // If not found in common keys, check all top-level values
            if (!foundKey) {
                console.log("API Parse: Array not found in common keys. Checking all object values...");
                for (const key in parsedObject) {
                    if (Array.isArray(parsedObject[key])) {
                        finalArray = parsedObject[key];
                        foundKey = key;
                        console.log(`API Parse: Found array in other key "${foundKey}".`);
                        break; // Use the first array found
                    }
                }
            }

            // Handle case where no array value is found within the object
            if (!foundKey) {
                console.error("API Parse: Parsed JSON object, but no array value found inside.", parsedObject);
                throw new Error("Parsed JSON object from OpenAI, but it did not contain the expected array of questions.");
            }
        } else {
            // This case means JSON.parse resulted in something other than an object (e.g., null, string, number)
            console.error("API Parse: Parsed content did not result in a valid object. Type:", typeof parsedObject, "Value:", parsedObject);
            throw new Error("Parsed JSON response was not a recognizable object structure.");
        }


        // --- Step 3: Validation (runs on finalArray) ---
        if (!Array.isArray(finalArray)) {
            // This should theoretically not be reached if the logic above works, but acts as a final safeguard.
            console.error("API Parse: FINAL CHECK FAILED - Data is not a valid array. This indicates a logic error.", finalArray);
            throw new Error("Parsed data is not a JSON array."); // The error you were seeing
        }

        const validatedQuestions = [];
        finalArray.forEach((q, i) => {
            // Check structure rigorously
            if (typeof q === 'object' && q !== null &&
                typeof q.question === 'string' && q.question.trim() !== '' &&
                typeof q.answer === 'string' && q.answer.trim() !== '' &&
                Array.isArray(q.alternativeAnswers) &&
                q.alternativeAnswers.every(alt => typeof alt === 'string'))
            {
                // Sanitize alternatives
                const cleanAlternatives = q.alternativeAnswers
                    .map(alt => alt.trim())
                    .filter(alt => alt !== '');

                validatedQuestions.push({
                    question: q.question.trim(),
                    answer: q.answer.trim(),
                    alternativeAnswers: cleanAlternatives
                });
            } else {
                 console.warn("API Parse: Invalid question format skipped at index", i, ":", JSON.stringify(q));
            }
        });


        if (validatedQuestions.length === 0) {
             // Check if the original array had items but all failed validation
             if (finalArray.length > 0) {
                 throw new Error("Parsed array contained items, but none matched the required question format.");
             } else {
                 // The array from the API was genuinely empty
                 throw new Error("Received an empty array of questions from OpenAI.");
             }
        }

        // Looser warning about count compared to requestedCount (useful for logging)
        if (validatedQuestions.length < requestedCount * 0.5) {
            console.warn(`API Parse: Validated ${validatedQuestions.length} questions, significantly less than initially requested ${requestedCount}.`);
        }

        console.log(`API Parse: Successfully validated ${validatedQuestions.length} questions.`);
        return validatedQuestions; // Return the list of valid questions
    }
} // End of QuizAPI class