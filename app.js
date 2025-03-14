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
        this.nextQuizNumber = 1; // Global quiz number tracker
        
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
            
            // Ensure the button container and generate button are visible
            if (this.generateBtn) {
                this.generateBtn.style.display = 'inline-block';
            }
            if (this.backToMenuBtn) {
                this.backToMenuBtn.style.display = 'inline-block';
            }
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
            // Remove fixed back button if it exists
            const fixedBackBtn = document.querySelector('#fixedBackFromPregeneratedBtn');
            if (fixedBackBtn) {
                fixedBackBtn.remove();
            }
            
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
            
            // Initialize the nextQuizNumber based on existing quizzes
            if (this.pregeneratedQuizzes.length > 0) {
                // Find the highest quiz number + 1
                const highestQuizNumber = Math.max(...this.pregeneratedQuizzes.map(quiz => quiz.quizNumber || 0));
                this.nextQuizNumber = highestQuizNumber + 1;
            }
        }
    }
    
    savePregeneratedQuizzes() {
        localStorage.setItem('pregeneratedQuizzes', JSON.stringify(this.pregeneratedQuizzes));
    }
    
    renderPregeneratedQuizzes() {
        this.quizList.innerHTML = '';
        
        // Remove existing fixed back button if it exists
        const existingBackBtn = document.querySelector('#fixedBackFromPregeneratedBtn');
        if (existingBackBtn) {
            existingBackBtn.remove();
        }
        
        // Create a fixed position back button directly on the body
        const fixedBackBtn = document.createElement('button');
        fixedBackBtn.id = 'fixedBackFromPregeneratedBtn';
        fixedBackBtn.className = 'secondary-btn fixed-back-btn';
        fixedBackBtn.textContent = 'Back to Menu';
        fixedBackBtn.style.position = 'fixed';
        fixedBackBtn.style.top = '20px';
        fixedBackBtn.style.left = '20px';
        fixedBackBtn.style.zIndex = '1000';
        
        fixedBackBtn.addEventListener('click', () => {
            fixedBackBtn.remove();
            this.pregeneratedPanel.style.display = 'none';
            this.mainMenu.style.display = 'block';
        });
        
        // Add the fixed button directly to the body
        document.body.appendChild(fixedBackBtn);
        
        // Hide the original bottom back button since we now have the fixed one
        if (this.backFromPregeneratedBtn) {
            this.backFromPregeneratedBtn.style.display = 'none';
        }
        
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
            quizCard.addEventListener('click', (e) => {
                // Only start quiz if we didn't click on the delete button
                if (!e.target.closest('.delete-quiz-btn')) {
                    this.startPregeneratedQuiz(index);
                }
            });
            
            // Add delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-quiz-btn';
            deleteBtn.innerHTML = '✕';
            deleteBtn.title = 'Delete quiz';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent quiz from starting when clicking delete
                this.deletePreGeneratedQuiz(index);
            });
            quizCard.appendChild(deleteBtn);
            
            const title = document.createElement('h3');
            // Always use the stored quiz number, and ensure every quiz has one
            if (!quiz.quizNumber) {
                quiz.quizNumber = index + 1; // Only as a fallback for older quizzes
                this.savePregeneratedQuizzes(); // Save the updated quiz numbers
            }
            title.textContent = `Quiz #${quiz.quizNumber}`;
            
            const questions = document.createElement('p');
            questions.textContent = `${quiz.questions.length} questions`;
            
            const time = document.createElement('p');
            const minutes = Math.floor(quiz.totalSeconds / 60);
            const seconds = quiz.totalSeconds % 60;
            time.textContent = `${minutes} min ${seconds} sec`;
            
            const topic = document.createElement('p');
            if (quiz.topic) {
                topic.textContent = quiz.topic;
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
        
        // Calculate total time in seconds
        const minutes = parseInt(this.timerMinutesInput.value, 10) || 0;
        const seconds = parseInt(this.timerSecondsInput.value, 10) || 0;
        this.totalSeconds = (minutes * 60) + seconds;
        
        if (!apiKey) {
            alert('Please enter your OpenAI API key.');
            return;
        }
        
        if (numQuestions <= 0) {
            alert('Please enter a valid number of questions.');
            return;
        }
        
        if (this.totalSeconds <= 0) {
            alert('Please set a time limit greater than 0 seconds.');
            return;
        }
        
        // Save API key to localStorage
        localStorage.setItem('quizApiKey', apiKey);
        
        // Show loading spinner
        this.loadingElement.style.display = 'flex';
        this.setupPanel.style.display = 'none';
        
        try {
            // Create an instance of the QuizAPI class
            const quizApi = new QuizAPI(apiKey);
            
            // Generate questions
            const questions = await quizApi.generateQuestions(numQuestions, difficulty, topic);
            
            // Store the quiz data
            this.questions = questions;
            this.answers = new Array(questions.length).fill('');
            this.currentQuestionIndex = 0;
            this.remainingSeconds = this.totalSeconds;
            
            // Save to pregenerated quizzes with a unique quiz number
            // This number is preserved even if other quizzes are deleted
            const quizData = {
                questions: this.questions,
                difficulty: difficulty,
                topic: topic,
                totalSeconds: this.totalSeconds,
                quizNumber: this.nextQuizNumber // Assign a permanent quiz number
            };
            
            this.pregeneratedQuizzes.push(quizData);
            this.savePregeneratedQuizzes();
            
            // Increment the quiz number for next time
            this.nextQuizNumber++;
            
            // Start the quiz
            this.startQuiz();
            
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
        // Remove the fixed back button if it exists
        const fixedBackBtn = document.querySelector('#fixedBackFromPregeneratedBtn');
        if (fixedBackBtn) {
            fixedBackBtn.remove();
        }
        
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
            
            // Make sure all buttons in the button container properly end the quiz
            const backButton = buttonContainer.querySelector('button:not(#endQuizBtn)');
            if (backButton) {
                backButton.addEventListener('click', () => this.endQuiz(false)); // Pass false to skip confirmation
            }
            
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
        correctAnswer = correctAnswer.toLowerCase();
        
        // Direct match
        if (userAnswer === correctAnswer) return true;
        
        // Allow for article differences (a, an, the)
        const articles = ['a', 'an', 'the'];
        const userWords = userAnswer.split(/\s+/).filter(word => word.length > 0);
        const correctWords = correctAnswer.split(/\s+/).filter(word => word.length > 0);
        
        const userWordsNoArticles = userWords.filter(word => !articles.includes(word));
        const correctWordsNoArticles = correctWords.filter(word => !articles.includes(word));
        
        if (userWordsNoArticles.join(' ') === correctWordsNoArticles.join(' ')) return true;
        
        return false;
    }
    
    endQuiz(withConfirmation = true) {
        if (!withConfirmation || confirm('Are you sure you want to end the quiz? Your progress will be lost.')) {
            this.stopTimer();
            
            // Hide all quiz components
            this.quizPanel.style.display = 'none';
            
            // Remove fixed header if it exists
            const quizHeader = document.querySelector('.quiz-header');
            if (quizHeader) {
                quizHeader.remove();
            }
            
            // Remove fixed timer if it exists
            if (document.querySelector('.timer-fixed')) {
                document.querySelector('.timer-fixed').remove();
            }
            
            // Reset the quiz panel structure to its original state
            this.resetQuizPanel();
            
            // Ensure the setup panel is properly reset for future use
            this.resetSetupPanel();
            
            // Reset the main menu to ensure consistent appearance
            this.resetMainMenu();
            
            // Show main menu
            this.mainMenu.style.display = 'block';
            
            // Remove warning class
            this.timerElement.classList.remove('timer-warning');
        }
    }
    
    startQuiz() {
        // Hide loading spinner and show quiz
        this.loadingElement.style.display = 'none';
        this.quizPanel.style.display = 'block';
        
        // Reset answers array
        this.answers = new Array(this.questions.length).fill('');
        this.currentQuestionIndex = 0;
        
        // Start timer and render quiz
        this.startTimer();
        this.renderQuiz();
        this.answerInput.focus();
    }
    
    // Add this new method to reset the quiz panel to its original structure
    resetQuizPanel() {
        // Get the container div
        const container = document.querySelector('.container');
        
        // Create a fresh quiz panel based on the original HTML structure
        const quizPanel = document.createElement('div');
        quizPanel.className = 'quiz-panel';
        quizPanel.style.display = 'none';
        
        // Recreate the timer container
        const timerContainer = document.createElement('div');
        timerContainer.className = 'timer-container';
        const timerDiv = document.createElement('div');
        timerDiv.id = 'timer';
        timerDiv.textContent = '00:00:00';
        timerContainer.appendChild(timerDiv);
        
        // Recreate the answer input container
        const answerInputContainer = document.createElement('div');
        answerInputContainer.className = 'answer-input-container';
        const answerInput = document.createElement('input');
        answerInput.type = 'text';
        answerInput.id = 'answerInput';
        answerInput.placeholder = 'Type your answer here';
        const submitButton = document.createElement('button');
        submitButton.id = 'submitAnswer';
        submitButton.textContent = 'Submit';
        answerInputContainer.appendChild(answerInput);
        answerInputContainer.appendChild(submitButton);
        
        // Recreate the progress container
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        const progressText = document.createElement('span');
        progressText.id = 'progressText';
        progressText.textContent = '0/0 questions answered';
        progressContainer.appendChild(progressText);
        
        // Recreate the quiz table
        const quizTable = document.createElement('table');
        quizTable.id = 'quizTable';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const questionHeader = document.createElement('th');
        questionHeader.textContent = 'Question';
        const answerHeader = document.createElement('th');
        answerHeader.textContent = 'Your Answer';
        headerRow.appendChild(questionHeader);
        headerRow.appendChild(answerHeader);
        thead.appendChild(headerRow);
        const tbody = document.createElement('tbody');
        tbody.id = 'quizBody';
        quizTable.appendChild(thead);
        quizTable.appendChild(tbody);
        
        // Recreate the button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';
        const endQuizBtn = document.createElement('button');
        endQuizBtn.id = 'endQuizBtn';
        endQuizBtn.textContent = 'End Quiz';
        buttonContainer.appendChild(endQuizBtn);
        
        // Add everything to the quiz panel
        quizPanel.appendChild(timerContainer);
        quizPanel.appendChild(answerInputContainer);
        quizPanel.appendChild(progressContainer);
        quizPanel.appendChild(quizTable);
        quizPanel.appendChild(buttonContainer);
        
        // Find the existing quiz panel and replace it
        const oldQuizPanel = document.querySelector('.quiz-panel');
        if (oldQuizPanel) {
            container.replaceChild(quizPanel, oldQuizPanel);
        } else {
            // If for some reason the panel doesn't exist, add it after the pregenerated panel
            const pregeneratedPanel = document.querySelector('.pregenerated-panel');
            container.insertBefore(quizPanel, pregeneratedPanel.nextSibling);
        }
        
        // Update the references
        this.quizPanel = quizPanel;
        this.timerElement = timerDiv;
        this.answerInput = answerInput;
        this.submitAnswerBtn = submitButton;
        this.progressText = progressText;
        this.quizTable = quizTable;
        this.quizBody = tbody;
        this.endQuizBtn = endQuizBtn;
        
        // Re-attach event listeners
        this.submitAnswerBtn.addEventListener('click', () => this.checkAnswer());
        this.answerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.checkAnswer();
            }
        });
        this.answerInput.addEventListener('input', () => {
            const userAnswer = this.answerInput.value.trim();
            if (userAnswer.length > 0) {
                this.checkForExactMatch(userAnswer);
            }
        });
        this.endQuizBtn.addEventListener('click', () => this.endQuiz());
    }
    
    resetSetupPanel() {
        // First, get a reference to the setup panel
        const setupPanel = document.querySelector('.setup-panel');
        
        // Check if the button container exists
        let buttonContainer = setupPanel.querySelector('.button-container');
        
        // If it doesn't exist or is malformed, recreate it
        if (!buttonContainer || !buttonContainer.querySelector('#generateBtn') || !buttonContainer.querySelector('#backToMenuBtn')) {
            // If the container exists but is missing buttons, remove it first
            if (buttonContainer) {
                buttonContainer.remove();
            }
            
            // Create a new button container
            buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';
            
            // Create the Back button
            const backBtn = document.createElement('button');
            backBtn.id = 'backToMenuBtn';
            backBtn.className = 'secondary-btn';
            backBtn.textContent = 'Back';
            backBtn.addEventListener('click', () => {
                setupPanel.style.display = 'none';
                this.mainMenu.style.display = 'block';
            });
            
            // Create the Generate Quiz button
            const generateBtn = document.createElement('button');
            generateBtn.id = 'generateBtn';
            generateBtn.textContent = 'Generate Quiz';
            generateBtn.addEventListener('click', () => this.generateQuiz());
            
            // Add the buttons to the container
            buttonContainer.appendChild(backBtn);
            buttonContainer.appendChild(generateBtn);
            
            // Add the container to the setup panel
            setupPanel.appendChild(buttonContainer);
            
            // Update the class references
            this.generateBtn = generateBtn;
            this.backToMenuBtn = backBtn;
        } else {
            // If the button container exists but isn't displayed correctly
            buttonContainer.style.display = 'flex';
            
            // Make sure the Generate Quiz button is visible
            const generateBtn = buttonContainer.querySelector('#generateBtn');
            if (generateBtn) {
                generateBtn.style.display = 'inline-block';
            }
            
            // Make sure the Back button is visible
            const backBtn = buttonContainer.querySelector('#backToMenuBtn');
            if (backBtn) {
                backBtn.style.display = 'inline-block';
            }
        }
    }
    
    resetMainMenu() {
        // First, get a reference to the main menu
        const mainMenu = document.querySelector('.main-menu');
        
        // Check if the main menu exists
        if (mainMenu) {
            // Ensure proper styling
            mainMenu.style.display = 'flex';
            
            // Check if buttons exist, if not recreate them
            let createQuizBtn = mainMenu.querySelector('#createQuizBtn');
            let pregeneratedBtn = mainMenu.querySelector('#pregeneratedBtn');
            
            if (!createQuizBtn) {
                createQuizBtn = document.createElement('button');
                createQuizBtn.id = 'createQuizBtn';
                createQuizBtn.className = 'menu-btn';
                createQuizBtn.textContent = 'Create New Quiz';
                createQuizBtn.addEventListener('click', () => {
                    mainMenu.style.display = 'none';
                    this.setupPanel.style.display = 'block';
                    this.resetSetupPanel();
                });
                mainMenu.appendChild(createQuizBtn);
                this.createQuizBtn = createQuizBtn;
            }
            
            if (!pregeneratedBtn) {
                pregeneratedBtn = document.createElement('button');
                pregeneratedBtn.id = 'pregeneratedBtn';
                pregeneratedBtn.className = 'menu-btn';
                pregeneratedBtn.textContent = 'Pregenerated Quizzes';
                pregeneratedBtn.addEventListener('click', () => {
                    mainMenu.style.display = 'none';
                    this.pregeneratedPanel.style.display = 'block';
                    this.renderPregeneratedQuizzes();
                });
                mainMenu.appendChild(pregeneratedBtn);
                this.pregeneratedBtn = pregeneratedBtn;
            }
        }
    }
    
    deletePreGeneratedQuiz(index) {
        if (confirm('Are you sure you want to delete this quiz?')) {
            // Remove the quiz at the specified index
            // Note: This doesn't affect the quiz numbers of other quizzes
            // Each quiz has its own persistent number
            this.pregeneratedQuizzes.splice(index, 1);
            this.savePregeneratedQuizzes();
            this.renderPregeneratedQuizzes();
        }
    }
}

// Initialize the app when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new QuizApp();
}); 