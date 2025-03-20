class QuizAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.endpoint = 'https://api.openai.com/v1/chat/completions';
    }

    async generateQuestions(numQuestions, difficulty, topic = '') {
        const topicPrompt = topic ? ` about ${topic}` : ' covering a variety of random topics';
        const systemPrompt = `You are a quiz generator. Generate ${numQuestions} ${difficulty} difficulty trivia questions${topicPrompt}. 
        Each question should have a clear, specific answer.
        
        Format your response as a JSON array of objects with the following structure:
        {
          "question": "The question text",
          "answer": "The primary correct answer",
          "alternativeAnswers": ["Alternative correct answer 1", "Alternative correct answer 2", ...]
        }
        
        Important guidelines for providing alternative answers:
        - For questions with multiple valid ways to refer to the same answer (e.g., "William Shakespeare" could also be "Shakespeare" or "the Bard of Avon"), provide these alternatives in the alternativeAnswers array.
        - For questions with only one specific correct answer (e.g., "What year was penicillin discovered?"), provide an empty alternativeAnswers array.
        - Include common misspellings, abbreviations, or alternative terms that would still be semantically correct.
        - For fictional characters, include both full names and commonly used partial names.
        - For geographic locations, include alternative names or spellings (e.g., "Ayers Rock" and "Uluru").
        
        The primary answer and alternatives should be concise - preferably single words or short phrases that will be easy to match against a user's input.
        Be creative and diverse in your questions - cover a wide range of subtopics and question types.`;

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: `Generate ${numQuestions} ${difficulty} trivia questions${topicPrompt} in JSON format. Include alternative correct answers where applicable. Make the questions diverse and unexpected.`
                        }
                    ],
                    "temperature": 2, // 0 to 2
                    "presence_penalty": 2, // -2 to 2
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to generate questions');
            }

            const content = data.choices[0].message.content;
            try {
                // Extract JSON from the response
                const jsonMatch = content.match(/\[[\s\S]*\]/);
                let questions;
                if (jsonMatch) {
                    questions = JSON.parse(jsonMatch[0]);
                } else {
                    questions = JSON.parse(content);
                }
                
                // Ensure all questions have the alternativeAnswers field
                questions.forEach(question => {
                    if (!question.alternativeAnswers) {
                        question.alternativeAnswers = [];
                    }
                });
                
                // Limit to numQuestions
                return questions.slice(0, numQuestions);
            } catch (parseError) {
                console.error('Failed to parse response:', parseError);
                throw new Error('Failed to parse quiz questions');
            }
        } catch (error) {
            console.error('Error generating questions:', error);
            throw error;
        }
    }
}