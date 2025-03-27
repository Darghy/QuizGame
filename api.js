class QuizAPI {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error("API key is required for QuizAPI.");
        }
        this.apiKey = apiKey;
        // Updated endpoint for chat models
        this.apiUrl = 'https://api.openai.com/v1/chat/completions';
        this.model = 'gpt-4o-mini'; // Use the specified model
    }

    async generateQuiz(numQuestions, difficulty, topic = '') {
        const systemPrompt = `You are a helpful assistant designed to generate trivia quizzes.
Generate a list of ${numQuestions} trivia questions.
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

        const userPrompt = `Generate the ${numQuestions} ${difficulty} trivia questions${topic ? ` about ${topic}` : ''} now in the specified JSON format.`;

        console.log("Sending prompt to OpenAI:", { system: systemPrompt, user: userPrompt });

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    // Request JSON output directly
                    response_format: { type: "json_object" },
                    // Optional: Add temperature for variability, max_tokens if needed
                    // temperature: 0.7,
                    // max_tokens: 1500 // Adjust based on expected output size
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({})); // Try to get error details
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

            return this._parseAndValidate(content, numQuestions);

        } catch (error) {
            console.error("Error generating quiz:", error);
            throw error; // Re-throw the error to be handled by the caller
        }
    }

    _parseAndValidate(jsonString, expectedCount) {
        let parsedData = null;

        // Attempt 1: Direct parse (ideal case with response_format: json_object)
        try {
            parsedData = JSON.parse(jsonString);
            // Sometimes the array might be nested inside the object, e.g., { "questions": [...] }
            if (typeof parsedData === 'object' && !Array.isArray(parsedData)) {
                const keys = Object.keys(parsedData);
                if (keys.length === 1 && Array.isArray(parsedData[keys[0]])) {
                    console.log("Found array nested within object key:", keys[0]);
                    parsedData = parsedData[keys[0]];
                } else {
                     // Check if any value is the array we want
                    for (const key in parsedData) {
                        if (Array.isArray(parsedData[key])) {
                            console.log("Found array nested within object key:", key);
                            parsedData = parsedData[key];
                            break; // Use the first array found
                        }
                    }
                    // If still not an array, something is wrong
                    if (!Array.isArray(parsedData)) {
                         throw new Error("Parsed JSON object does not directly contain the expected array.");
                    }
                }
            }
        } catch (e) {
            console.warn("Direct JSON parsing failed. Attempting regex fallback.", e);
            // Attempt 2: Regex fallback (find first [...] block)
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

        // Validation
        if (!Array.isArray(parsedData)) {
            throw new Error("Parsed data is not a JSON array.");
        }

        // Validate structure and content of each question
        const validatedQuestions = [];
        for (let i = 0; i < parsedData.length; i++) {
            const q = parsedData[i];
            if (typeof q !== 'object' || q === null ||
                typeof q.question !== 'string' || q.question.trim() === '' ||
                typeof q.answer !== 'string' || q.answer.trim() === '' ||
                !Array.isArray(q.alternativeAnswers) ||
                !q.alternativeAnswers.every(alt => typeof alt === 'string')) {
                console.warn("Invalid question format found at index", i, ":", q);
                // Optionally skip invalid questions or throw a stricter error
                // For now, let's skip it and hope we have enough valid ones.
                continue;
                // OR: throw new Error(`Invalid question format at index ${i}: ${JSON.stringify(q)}`);
            }
            // Clean up alternatives: ensure they are trimmed and non-empty strings
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
         // Optional: Check if we got roughly the number requested, though LLMs might vary
        if (validatedQuestions.length < expectedCount * 0.8) { // e.g., less than 80% requested
            console.warn(`Expected ${expectedCount} questions, but only validated ${validatedQuestions.length}.`);
        }


        console.log("Successfully parsed and validated questions:", validatedQuestions);
        return validatedQuestions; // Return the array of validated question objects
    }
}