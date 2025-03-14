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
        this.pregeneratedQuizzes = [];
        
        // DOM elements - Main Menu
        this.mainMenu = document.querySelector('.main-menu');
        this.createQuizBtn = document.getElementById('createQuizBtn');
        this.pregeneratedBtn = document.getElementById('pregeneratedBtn');
        
        // DOM elements - Setup
        this.setupPanel = document.querySelector('.setup-panel');
        this.apiKeyInput = document.getElementById('apiKey');
        this.numQuestionsInput = document.getElementById('numQuestions');
        this.difficultySelect = document.getElementById('difficulty');
        this.topicInput = document.getElementById('topic');
        this.timerMinutesInput = document.getElementById('timerMinutes');
        this.timerSecondsInput = document.getElementById('timerSeconds');
        this.generateBtn = document.getElementById('generateBtn');
        this.backToMenuBtn = document.getElementById('backToMenuBtn');
        
        // DOM elements - Pregenerated
        this.pregeneratedPanel = document.querySelector('.pregenerated-panel');
        this.quizList = document.getElementById('quizList');
        this.backFromPregeneratedBtn = document.getElementById('backFromPregeneratedBtn');
        
        // DOM elements - Quiz
        this.quizPanel = document.querySelector('.quiz-panel');
        this.loadingElement = document.getElementById('loading');
        this.timerElement = document.getElementById('timer');
        this.answerInput = document.getElementById('answerInput');
        this.submitAnswerBtn = document.getElementById('submitAnswer');
        this.progressText = document.getElementById('progressText');
        this.quizTable = document.getElementById('quizTable');
        this.quizBody = document.getElementById('quizBody');
        this.endQuizBtn = document.getElementById('endQuizBtn');
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Load pregenerated quizzes and API key
        this.loadPregeneratedQuizzes();
        
        // Check for saved API key
        const savedApiKey = localStorage.getItem('quizApiKey');
        if (savedApiKey) {
            this.apiKeyInput.value = savedApiKey;
        }
    }
    
    initEventListeners() {
        // Main menu
        this.createQuizBtn.addEventListener('click', () => {
            this.mainMenu.style.display = 'none';
            this.setupPanel.style.display = 'block';
        });
        
        this.pregeneratedBtn.addEventListener('click', () => {
            this.mainMenu.style.display = 'none';
            this.pregeneratedPanel.style.display = 'block';
            this.renderPregeneratedQuizzes();
        });
        
        // Setup panel
        this.generateBtn.addEventListener('click', () => this.generateQuiz());
        this.backToMenuBtn.addEventListener('click', () => {
            this.setupPanel.style.display = 'none';
            this.mainMenu.style.display = 'block';
        });
        
        // Pregenerated panel
        this.backFromPregeneratedBtn.addEventListener('click', () => {
            this.pregeneratedPanel.style.display = 'none';
            this.mainMenu.style.display = 'block';
        });
        
        // Quiz panel
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
    }
    
    loadPregeneratedQuizzes() {
        const savedQuizzes = localStorage.getItem('pregeneratedQuizzes');
        if (savedQuizzes) {
            this.pregeneratedQuizzes = JSON.parse(savedQuizzes);
        }
    }
    
    savePregeneratedQuizzes() {
        localStorage.setItem('pregeneratedQuizzes', JSON.stringify(this.pregeneratedQuizzes));
    }
    
    renderPregeneratedQuizzes() {
        this.quizList.innerHTML = '';
        
        if (this.pregeneratedQuizzes.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'No pregenerated quizzes available. Generate a quiz to add it here.';
            emptyMessage.className = 'empty-message';
            this.quizList.appendChild(emptyMessage);
            return;
        }
        
        this.pregeneratedQuizzes.forEach((quiz, index) => {
            const quizCard = document.createElement('div');
            quizCard.className = 'quiz-card';
            quizCard.addEventListener('click', () => this.startPregeneratedQuiz(index));
            
            const title = document.createElement('h3');
            title.textContent = `Quiz #${index + 1}`;
            
            const questions = document.createElement('p');
            questions.textContent = `${quiz.questions.length} questions`;
            
            const time = document.createElement('p');
            const minutes = Math.floor(quiz.totalSeconds / 60);
            const seconds = quiz.totalSeconds % 60;
            time.textContent = `${minutes} min ${seconds} sec`;
            
            const topic = document.createElement('p');
            if (quiz.topic) {
                topic.textContent = `Topic: ${quiz.topic}`;
            } else {
                topic.textContent = 'Random topics';
            }
            
            const difficulty = document.createElement('span');
            difficulty.className = 'tag';
            difficulty.textContent = quiz.difficulty;
            
            quizCard.appendChild(title);
            quizCard.appendChild(questions);
            quizCard.appendChild(time);
            quizCard.appendChild(topic);
            quizCard.appendChild(difficulty);
            
            this.quizList.appendChild(quizCard);
        });
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
            
            // Save this quiz to pregenerated quizzes
            this.pregeneratedQuizzes.push({
                questions: this.questions,
                difficulty: difficulty,
                topic: topic,
                totalSeconds: this.totalSeconds,
                timestamp: Date.now()
            });
            this.savePregeneratedQuizzes();
            
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
    
    startPregeneratedQuiz(index) {
        const quiz = this.pregeneratedQuizzes[index];
        if (!quiz) {
            alert('Quiz not found');
            return;
        }
        
        // Make sure any existing fixed timer is removed before starting a new one
        if (document.querySelector('.timer-fixed')) {
            document.querySelector('.timer-fixed').remove();
        }
        
        this.questions = quiz.questions;
        this.answers = new Array(this.questions.length).fill('');
        this.totalSeconds = quiz.totalSeconds;
        this.remainingSeconds = this.totalSeconds;
        
        // Hide pregenerated panel and show quiz
        this.pregeneratedPanel.style.display = 'none';
        this.quizPanel.style.display = 'block';
        
        // Start timer and render quiz
        this.startTimer();
        this.renderQuiz();
        this.answerInput.focus();
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
        clearInterval(this.timerInterval);
        this.timerElement.classList.remove('timer-warning');
        
        const updateTimer = () => {
            if (this.isCountdown) {
                this.remainingSeconds--;
                
                if (this.remainingSeconds <= 60 && !this.timerElement.classList.contains('timer-warning')) {
                    this.timerElement.classList.add('timer-warning');
                }
                
                if (this.remainingSeconds <= 0) {
                    clearInterval(this.timerInterval);
                    alert('Time\'s up!');
                    this.endQuiz(false);
                    return;
                }
            } else {
                this.remainingSeconds++;
            }
            
            const hours = Math.floor(this.remainingSeconds / 3600);
            const minutes = Math.floor((this.remainingSeconds % 3600) / 60);
            const seconds = this.remainingSeconds % 60;
            
            this.timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };
        
        // Initial display
        updateTimer();
        
        // Start interval
        this.timerInterval = setInterval(updateTimer, 1000);
    }
    
    stopTimer() {
        clearInterval(this.timerInterval);
    }
    
    checkAnswer() {
        const userAnswer = this.answerInput.value.trim();
        if (!userAnswer) return;
        
        for (let i = 0; i < this.questions.length; i++) {
            if (this.answers[i]) continue; // Skip already answered questions
            
            const correctAnswer = this.questions[i].answer.toLowerCase();
            if (this.isCorrectAnswer(userAnswer, correctAnswer)) {
                this.answers[i] = this.questions[i].answer;
                this.renderQuiz();
                this.answerInput.value = '';
                
                // Check if all questions are answered
                if (this.answers.every(answer => answer)) {
                    clearInterval(this.timerInterval);
                    alert('Congratulations! You\'ve answered all questions correctly!');
                }
                
                return;
            }
        }
        
        // Shake the input to indicate wrong answer
        this.answerInput.classList.add('shake');
        setTimeout(() => this.answerInput.classList.remove('shake'), 500);
    }
    
    checkForExactMatch(userAnswer) {
        for (let i = 0; i < this.questions.length; i++) {
            if (this.answers[i]) continue; // Skip already answered questions
            
            const correctAnswer = this.questions[i].answer.toLowerCase();
            if (this.isCorrectAnswer(userAnswer, correctAnswer)) {
                this.answers[i] = this.questions[i].answer;
                this.renderQuiz();
                this.answerInput.value = '';
                
                // Check if all questions are answered
                if (this.answers.every(answer => answer)) {
                    clearInterval(this.timerInterval);
                    alert('Congratulations! You\'ve answered all questions correctly!');
                }
                
                return;
            }
        }
    }
    
    isCorrectAnswer(userAnswer, correctAnswer) {
        // Case insensitive comparison
        userAnswer = userAnswer.toLowerCase();
        
        // Direct match
        if (userAnswer === correctAnswer) return true;
        
        // Allow for minor variations
        const userWords = userAnswer.split(/\s+/).filter(word => word.length > 0);
        const correctWords = correctAnswer.split(/\s+/).filter(word => word.length > 0);
        
        // Check for article differences (a, an, the)
        const articles = ['a', 'an', 'the'];
        const userWordsNoArticles = userWords.filter(word => !articles.includes(word));
        const correctWordsNoArticles = correctWords.filter(word => !articles.includes(word));
        
        if (userWordsNoArticles.join(' ') === correctWordsNoArticles.join(' ')) return true;
        
        // Allow for minor spelling differences
        if (this.levenshteinDistance(userAnswer, correctAnswer) <= 2 && correctAnswer.length > 4) return true;
        
        return false;
    }
    
    levenshteinDistance(a, b) {
        const matrix = [];
        
        // Increment along the first column of each row
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        
        // Increment each column in the first row
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        
        // Fill in the rest of the matrix
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        
        return matrix[b.length][a.length];
    }
    
    endQuiz(withConfirmation = true) {
        if (!withConfirmation || confirm('Are you sure you want to end the quiz? Your progress will be lost.')) {
            this.stopTimer();
            this.quizPanel.style.display = 'none';
            this.mainMenu.style.display = 'block'; // Go back to main menu
            
            // Remove warning class when returning to setup
            this.timerElement.classList.remove('timer-warning');
            
            // If using the fixed timer, remove it when ending the quiz
            if (document.querySelector('.timer-fixed')) {
                document.querySelector('.timer-fixed').remove();
            }
        }
    }
}

// Initialize the app when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new QuizApp();
}); 