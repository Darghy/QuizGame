class QuizAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.endpoint = 'https://api.openai.com/v1/chat/completions';
    }

    async generateQuestions(numQuestions, difficulty, topic = '') {
        const topicPrompt = topic ? ` about ${topic}` : '';
        const systemPrompt = `You are a quiz generator. Generate ${numQuestions} ${difficulty} difficulty trivia questions${topicPrompt}. 
        Each question should have a clear, specific answer.
        Format your response as a JSON array of objects, each with 'question' and 'answer' fields.
        The answers should be concise - preferably single words or short phrases that will be easy to match against a user's input.
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
                            content: `Generate ${numQuestions} ${difficulty} trivia questions${topicPrompt} in JSON format. Make the questions diverse and unexpected.`
                        }
                    ],
                    "temperature": 1.2,
                    "presence_penalty": 1,
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