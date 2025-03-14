class QuizApp {
    constructor() {
        this.questions = [];
        this.answers = new Array(this.questions.length).fill('');
        this.currentQuestionIndex = 0;
        this.startTime = null;
        this.timerInterval = null;
        this.totalSeconds = 240; // Default 4 minutes
        this.remainingSeconds = this.totalSeconds;
        this.isCountdown = true;
        
        // DOM elements
        this.setupPanel = document.querySelector('.setup-panel');
        this.quizPanel = document.querySelector('.quiz-panel');
        this.loadingElement = document.getElementById('loading');
        this.apiKeyInput = document.getElementById('apiKey');
        this.numQuestionsInput = document.getElementById('numQuestions');
        this.difficultySelect = document.getElementById('difficulty');
        this.topicInput = document.getElementById('topic');
        this.timerMinutesInput = document.getElementById('timerMinutes');
        this.timerSecondsInput = document.getElementById('timerSeconds');
        this.generateBtn = document.getElementById('generateBtn');
        this.loadSavedBtn = document.getElementById('loadSavedBtn');
        this.timerElement = document.getElementById('timer');
        this.answerInput = document.getElementById('answerInput');
        this.submitAnswerBtn = document.getElementById('submitAnswer');
        this.progressText = document.getElementById('progressText');
        this.quizTable = document.getElementById('quizTable');
        this.quizBody = document.getElementById('quizBody');
        this.endQuizBtn = document.getElementById('endQuizBtn');
        this.saveQuizBtn = document.getElementById('saveQuizBtn');
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Check for saved API key
        const savedApiKey = localStorage.getItem('quizApiKey');
        if (savedApiKey) {
            this.apiKeyInput.value = savedApiKey;
        }
    }
    
    initEventListeners() {
        this.generateBtn.addEventListener('click', () => this.generateQuiz());
        this.loadSavedBtn.addEventListener('click', () => this.loadSavedQuiz());
        this.submitAnswerBtn.addEventListener('click', () => this.checkAnswer());
        this.answerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.checkAnswer();
            }
        });
        
        // Add input event listener for immediate answer checking
        this.answerInput.addEventListener('input', () => {
            const userAnswer = this.answerInput.value.trim();
            if (userAnswer.length > 0) {
                this.checkForExactMatch(userAnswer);
            }
        });
        
        this.endQuizBtn.addEventListener('click', () => this.endQuiz());
        this.saveQuizBtn.addEventListener('click', () => this.saveQuiz());
    }
    
    async generateQuiz() {
        const apiKey = this.apiKeyInput.value.trim();
        const numQuestions = parseInt(this.numQuestionsInput.value, 10);
        const difficulty = this.difficultySelect.value;
        const topic = this.topicInput.value.trim();
        const minutes = parseInt(this.timerMinutesInput.value, 10) || 0;
        const seconds = parseInt(this.timerSecondsInput.value, 10) || 0;
        
        if (!apiKey) {
            alert('Please enter your OpenAI API key');
            return;
        }
        
        if (numQuestions < 1 || numQuestions > 20) {
            alert('Please enter a number of questions between 1 and 20');
            return;
        }
        
        // Validate timer (minimum 10 seconds, maximum 15 minutes)
        this.totalSeconds = (minutes * 60) + seconds;
        if (this.totalSeconds < 10) {
            alert('Please set a time of at least 10 seconds');
            return;
        }
        if (this.totalSeconds > 900) {
            alert('Please set a time of maximum 15 minutes');
            return;
        }
        
        this.remainingSeconds = this.totalSeconds;
        
        // Save API key for convenience
        localStorage.setItem('quizApiKey', apiKey);
        
        // Show loading spinner
        this.setupPanel.style.display = 'none';
        this.loadingElement.style.display = 'block';
        
        try {
            // Make sure any existing fixed timer is removed before starting a new one
            if (document.querySelector('.timer-fixed')) {
                document.querySelector('.timer-fixed').remove();
            }
            
            const api = new QuizAPI(apiKey);
            this.questions = await api.generateQuestions(numQuestions, difficulty, topic);
            
            // Ensure we only use exactly the requested number of questions
            if (this.questions.length > numQuestions) {
                this.questions = this.questions.slice(0, numQuestions);
            }
            
            this.answers = new Array(this.questions.length).fill('');
            
            // Hide loading spinner and show quiz
            this.loadingElement.style.display = 'none';
            this.quizPanel.style.display = 'block';
            
            // Start timer and render quiz
            this.startTimer();
            this.renderQuiz();
            this.answerInput.focus();
        } catch (error) {
            alert(`Error generating quiz: ${error.message}`);
            this.loadingElement.style.display = 'none';
            this.setupPanel.style.display = 'block';
        }
    }
    
    renderQuiz() {
        // First, move the timer element to body if it's not already done
        if (!document.querySelector('.timer-fixed')) {
            // Get the timer element reference
            const timerElement = document.getElementById('timer');
            
            // Only proceed if we have a valid timer element
            if (timerElement) {
                // Create a new timer container
                const fixedTimerContainer = document.createElement('div');
                fixedTimerContainer.id = 'timer';
                fixedTimerContainer.className = 'timer-fixed';
                fixedTimerContainer.textContent = this.timerElement.textContent;
                
                // Remove old timer (safely)
                if (this.timerElement && this.timerElement.parentNode) {
                    this.timerElement.parentNode.remove();
                }
                
                // Add new timer to the body
                document.body.appendChild(fixedTimerContainer);
                
                // Update the timer element reference
                this.timerElement = fixedTimerContainer;
            } else {
                // Create a new timer if none exists
                const fixedTimerContainer = document.createElement('div');
                fixedTimerContainer.id = 'timer';
                fixedTimerContainer.className = 'timer-fixed';
                fixedTimerContainer.textContent = "00:00";
                
                // Add new timer to the body
                document.body.appendChild(fixedTimerContainer);
                
                // Update the timer element reference
                this.timerElement = fixedTimerContainer;
            }
        }
        
        // First render, restructure the quiz panel
        if (!document.querySelector('.quiz-header')) {
            // Create quiz header
            const quizHeader = document.createElement('div');
            quizHeader.className = 'quiz-header';
            
            // Move input and progress to header (timer is now outside)
            quizHeader.appendChild(document.querySelector('.answer-input-container'));
            quizHeader.appendChild(document.querySelector('.progress-container'));
            
            // Create quiz content container
            const quizContent = document.createElement('div');
            quizContent.className = 'quiz-content';
            
            // Move table to content container
            quizContent.appendChild(this.quizTable);
            
            // Get button container
            const buttonContainer = document.querySelector('.button-container');
            
            // Clear quiz panel and restructure
            this.quizPanel.innerHTML = '';
            this.quizPanel.appendChild(quizHeader);
            this.quizPanel.appendChild(quizContent);
            quizContent.appendChild(buttonContainer);
        }
        
        this.quizBody.innerHTML = '';
        
        this.questions.forEach((question, index) => {
            const row = document.createElement('tr');
            
            const questionCell = document.createElement('td');
            questionCell.textContent = `${index + 1}. ${question.question}`;
            
            const answerCell = document.createElement('td');
            if (this.answers[index]) {
                answerCell.textContent = this.answers[index];
                answerCell.classList.add('correct-answer');
            }
            
            row.appendChild(questionCell);
            row.appendChild(answerCell);
            
            this.quizBody.appendChild(row);
        });
        
        // Update progress text
        const answeredCount = this.answers.filter(answer => answer).length;
        this.progressText.textContent = `${answeredCount}/${this.questions.length} questions answered`;
    }
    
    startTimer() {
        // Initialize with the remaining seconds
        this.remainingSeconds = this.totalSeconds;
        this.updateTimerDisplay();
        
        this.timerInterval = setInterval(() => {
            this.remainingSeconds--;
            
            this.updateTimerDisplay();
            
            // Check if timer has expired
            if (this.remainingSeconds <= 0) {
                this.stopTimer();
                setTimeout(() => {
                    const answeredCount = this.answers.filter(answer => answer).length;
                    alert(`Time's up! You've answered ${answeredCount} out of ${this.questions.length} questions.`);
                    this.endQuiz(false); // End quiz without confirmation
                }, 100);
            }
            
            // Add warning class when less than 30 seconds remain
            if (this.remainingSeconds <= 30) {
                this.timerElement.classList.add('timer-warning');
            }
        }, 1000);
    }
    
    stopTimer() {
        clearInterval(this.timerInterval);
    }
    
    checkAnswer() {
        const userAnswer = this.answerInput.value.trim();
        
        if (!userAnswer) return;
        
        // Find unanswered questions
        const unansweredIndices = this.answers.map((answer, index) => 
            answer ? -1 : index
        ).filter(index => index !== -1);
        
        if (unansweredIndices.length === 0) {
            alert('All questions have been answered!');
            return;
        }
        
        // Check if the answer matches any of the unanswered questions
        let matchFound = false;
        
        for (const index of unansweredIndices) {
            const correctAnswer = this.questions[index].answer.toLowerCase();
            
            // Simple string matching (can be improved with more sophisticated matching)
            if (this.isCorrectAnswer(userAnswer, correctAnswer)) {
                this.answers[index] = this.questions[index].answer;
                matchFound = true;
                break;
            }
        }
        
        if (matchFound) {
            this.answerInput.value = '';
            this.renderQuiz();
            
            // Check if all questions are answered
            if (!this.answers.includes('')) {
                this.stopTimer();
                setTimeout(() => {
                    alert(`Congratulations! You've completed the quiz in ${this.timerElement.textContent}!`);
                }, 100);
            }
        } else {
            // Optionally provide feedback for incorrect answers
            this.answerInput.classList.add('incorrect');
            setTimeout(() => {
                this.answerInput.classList.remove('incorrect');
            }, 500);
        }
    }
    
    isCorrectAnswer(userAnswer, correctAnswer) {
        // Convert both to lowercase for case-insensitive comparison
        userAnswer = userAnswer.toLowerCase();
        
        // Exact match
        if (userAnswer === correctAnswer) return true;
        
        // Allow for some flexibility in answers
        // Remove articles and common punctuation
        const normalizeAnswer = (answer) => {
            return answer
                .replace(/^(a|an|the) /i, '')
                .replace(/[.,;:!?'"()]/g, '')
                .trim();
        };
        
        const normalizedUser = normalizeAnswer(userAnswer);
        const normalizedCorrect = normalizeAnswer(correctAnswer);
        
        if (normalizedUser === normalizedCorrect) return true;
        
        // Check if user answer is contained in correct answer or vice versa
        if (normalizedCorrect.includes(normalizedUser) || normalizedUser.includes(normalizedCorrect)) {
            // Only consider it correct if it's a substantial match (more than 3 characters)
            return normalizedUser.length > 3 || normalizedCorrect.length > 3;
        }
        
        return false;
    }
    
    endQuiz(withConfirmation = true) {
        if (!withConfirmation || confirm('Are you sure you want to end the quiz? Your progress will be lost.')) {
            this.stopTimer();
            this.quizPanel.style.display = 'none';
            this.setupPanel.style.display = 'block';
            
            // Remove warning class when returning to setup
            this.timerElement.classList.remove('timer-warning');
            
            // If using the fixed timer, remove it when ending the quiz
            if (document.querySelector('.timer-fixed')) {
                document.querySelector('.timer-fixed').remove();
            }
        }
    }
    
    saveQuiz() {
        const quizData = {
            questions: this.questions,
            answers: this.answers,
            elapsedTime: this.elapsedTime,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('savedQuiz', JSON.stringify(quizData));
        alert('Quiz saved successfully!');
    }
    
    loadSavedQuiz() {
        const savedQuizData = localStorage.getItem('savedQuiz');
        
        if (!savedQuizData) {
            alert('No saved quiz found');
            return;
        }
        
        try {
            const quizData = JSON.parse(savedQuizData);
            
            this.questions = quizData.questions;
            this.answers = quizData.answers;
            this.elapsedTime = quizData.elapsedTime || 0;
            
            // Setup the timer with the saved elapsed time
            this.startTime = new Date(new Date().getTime() - (this.elapsedTime * 1000));
            
            // Hide setup and show quiz
            this.setupPanel.style.display = 'none';
            this.quizPanel.style.display = 'block';
            
            // Start timer and render quiz
            this.startTimer();
            this.renderQuiz();
            this.answerInput.focus();
        } catch (error) {
            alert('Error loading saved quiz');
            console.error(error);
        }
    }
    
    updateTimerDisplay() {
        const hours = Math.floor(this.remainingSeconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((this.remainingSeconds % 3600) / 60).toString().padStart(2, '0');
        const seconds = (this.remainingSeconds % 60).toString().padStart(2, '0');
        
        if (this.totalSeconds > 3600) {
            this.timerElement.textContent = `${hours}:${minutes}:${seconds}`;
        } else {
            this.timerElement.textContent = `${minutes}:${seconds}`;
        }
    }
    
    checkForExactMatch(userAnswer) {
        // Only check for exact matches while typing
        if (!userAnswer) return;
        
        // Find unanswered questions
        const unansweredIndices = this.answers.map((answer, index) => 
            answer ? -1 : index
        ).filter(index => index !== -1);
        
        if (unansweredIndices.length === 0) return;
        
        for (const index of unansweredIndices) {
            const correctAnswer = this.questions[index].answer.toLowerCase();
            userAnswer = userAnswer.toLowerCase();
            
            // Only use exact matching for immediate feedback
            if (userAnswer === correctAnswer) {
                this.answers[index] = this.questions[index].answer;
                this.answerInput.value = '';
                this.renderQuiz();
                
                // Check if all questions are answered
                if (!this.answers.includes('')) {
                    this.stopTimer();
                    setTimeout(() => {
                        alert(`Congratulations! You've completed the quiz in ${this.timerElement.textContent}!`);
                    }, 100);
                }
                
                break;
            }
        }
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new QuizApp();
}); 