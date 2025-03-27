// --- Constants ---
const KNOWN_ANSWERS_STORAGE_KEY = 'llmTrivia_knownAnswers';

// --- Utility Functions ---

/**
 * Normalizes a string for comparison and storage: trims and converts to lowercase.
 * @param {string} str The string to normalize.
 * @returns {string} The normalized string.
 */
function normalizeString(str) {
    return typeof str === 'string' ? str.trim().toLowerCase() : '';
}

/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} a First string.
 * @param {string} b Second string.
 * @returns {number} The Levenshtein distance.
 */
function calculateLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1; // cost is 0 if chars are the same
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Checks if a string consists primarily of digits.
 * @param {string} str The string to check.
 * @returns {boolean} True if the string contains only digits, false otherwise.
 */
function isDigitsOnly(str) {
    // Added check for non-empty string as well
    return typeof str === 'string' && str.length > 0 && /^\d+$/.test(str);
}


// --- StorageManager ---
class StorageManager {
    constructor(prefix = 'llmTrivia_') {
        this.prefix = prefix;
    }

    _getKey(key) {
        return this.prefix + key;
    }

    saveApiKey(key) {
        try {
            localStorage.setItem(this._getKey('apiKey'), key || '');
        } catch (e) {
            console.error("Error saving API key to localStorage:", e);
        }
    }

    getApiKey() {
        try {
            return localStorage.getItem(this._getKey('apiKey')) || null;
        } catch (e) {
            console.error("Error getting API key from localStorage:", e);
            return null;
        }
    }

    saveQuizzes(quizzes) {
        try {
            localStorage.setItem(this._getKey('quizzes'), JSON.stringify(quizzes || []));
        } catch (e) {
            console.error("Error saving quizzes to localStorage:", e);
        }
    }

    getQuizzes() {
        try {
            const quizzesJson = localStorage.getItem(this._getKey('quizzes'));
            return JSON.parse(quizzesJson || '[]');
        } catch (e) {
            console.error("Error getting or parsing quizzes from localStorage:", e);
            return [];
        }
    }

    saveNextQuizNumber(num) {
        try {
            localStorage.setItem(this._getKey('nextQuizNumber'), String(num));
        } catch (e) {
            console.error("Error saving next quiz number:", e);
        }
    }

    getNextQuizNumber() {
        try {
            const numStr = localStorage.getItem(this._getKey('nextQuizNumber'));
            const num = parseInt(numStr || '1', 10);
            return isNaN(num) || num < 1 ? 1 : num;
        } catch (e) {
            console.error("Error getting next quiz number:", e);
            return 1;
        }
    }

    // *** NEW: Methods for known answers ***
    saveKnownAnswers(answerSet) {
        try {
            const answerArray = Array.from(answerSet);
            localStorage.setItem(this._getKey(KNOWN_ANSWERS_STORAGE_KEY), JSON.stringify(answerArray));
            console.log(`Saved ${answerArray.length} known answers.`);
        } catch (e) {
            console.error("Error saving known answers to localStorage:", e);
            // Consider notifying user if storage is full
            if (e.name === 'QuotaExceededError') {
                alert('Could not save known answers list, browser storage might be full.');
            }
        }
    }

    getKnownAnswers() {
        try {
            const answersJson = localStorage.getItem(this._getKey(KNOWN_ANSWERS_STORAGE_KEY));
            if (!answersJson) {
                return new Set(); // No data saved yet
            }
            const answerArray = JSON.parse(answersJson);
            if (!Array.isArray(answerArray)) {
                 console.warn("Known answers data in localStorage is not an array. Resetting.");
                 localStorage.removeItem(this._getKey(KNOWN_ANSWERS_STORAGE_KEY)); // Clear invalid data
                 return new Set();
            }
            // Ensure all elements are strings during loading
            const answerSet = new Set(answerArray.filter(item => typeof item === 'string'));
            console.log(`Loaded ${answerSet.size} known answers.`);
            return answerSet;
        } catch (e) {
            console.error("Error getting or parsing known answers from localStorage:", e);
            return new Set(); // Return empty set on error
        }
    }
}

// --- Quiz ---
class Quiz {
    constructor(quizData, callbacks) {
        this.quizData = quizData;
        this.questions = quizData.questions; // This now reflects the potentially filtered list
        this.timeLimitSeconds = quizData.timeLimitSeconds;
        this.callbacks = callbacks; // { onTimerUpdate(remainingTime), onQuizEnd(reason) }

        // State based on the actual number of questions in this instance
        this.userAnswers = new Array(this.questions.length).fill(null);
        this._unansweredIndices = new Set(this.questions.map((_, i) => i));

        this.remainingTime = this.timeLimitSeconds;
        this.timerId = null;
        this.isComplete = false;
        this.isGivenUp = false;
        this.startTime = null;
    }

    startTimer() {
        if (this.timerId) clearInterval(this.timerId); // Clear existing timer if any
        this.startTime = Date.now();
        this.isComplete = false;
        this.isGivenUp = false;

        this.callbacks.onTimerUpdate(this.remainingTime); // Initial update

        this.timerId = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            this.remainingTime = Math.max(0, this.timeLimitSeconds - elapsed);

            this.callbacks.onTimerUpdate(this.remainingTime);

            if (this.remainingTime <= 0) {
                this._endQuiz('timeup');
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    // submitAnswer uses global normalizeString utility
    submitAnswer(submittedAnswer) {
        if (this.isComplete || this.isGivenUp || this.remainingTime <= 0) {
            return { correct: false, reason: 'Quiz ended' };
        }

        const normalizedSubmission = normalizeString(submittedAnswer);
        if (!normalizedSubmission) return { correct: false, reason: 'Empty answer' };

        let matchedIndex = -1;
        let canonicalMatch = null;
        let exactMatchFound = false; // Flag for exact match pass

        // --- Pass 1: Check for Exact Matches ---
        for (const index of this._unansweredIndices) {
            const question = this.questions[index];
            const normalizedAnswer = normalizeString(question.answer);
            const normalizedAlternatives = question.alternativeAnswers.map(normalizeString);

            if (normalizedSubmission === normalizedAnswer || (normalizedAlternatives.length > 0 && normalizedAlternatives.includes(normalizedSubmission))) {
                exactMatchFound = true;
                matchedIndex = index;
                canonicalMatch = question.answer; // Store canonical answer
                break; // Found an exact match, no need to check further questions
            }
        }

        // --- Pass 2: Fuzzy Matches (only if no exact match found) ---
        if (!exactMatchFound) {
            let fuzzyMatchFound = false; // Use a separate flag for fuzzy pass completion

            for (const index of this._unansweredIndices) {
                const question = this.questions[index];
                // Include main answer and alternatives for fuzzy checking
                const checkTargets = [question.answer, ...question.alternativeAnswers];

                for (const target of checkTargets) {
                    const normalizedTarget = normalizeString(target);
                    if (!normalizedTarget) continue; // Skip empty targets

                    let isAcceptableFuzzyMatch = false;
                    const isSubmissionNumeric = isDigitsOnly(normalizedSubmission);
                    const isTargetNumeric = isDigitsOnly(normalizedTarget);

                    if (isSubmissionNumeric && isTargetNumeric) {
                        // Numeric vs Numeric: No fuzzy match allowed in Pass 2
                        // (Exact match would have been caught in Pass 1)
                        isAcceptableFuzzyMatch = false;
                    } else if (!isSubmissionNumeric && !isTargetNumeric) {
                        // Text vs Text: Apply Levenshtein distance check
                        const distance = calculateLevenshteinDistance(normalizedSubmission, normalizedTarget);
                        // Threshold: Dist 1 always OK, Dist 2 only for longer words
                        const thresholdMet = (
                            (distance === 1) ||
                            (distance === 2 && normalizedTarget.length > 5)
                        );
                        if (thresholdMet) {
                            isAcceptableFuzzyMatch = true;
                            console.log(`Fuzzy text match for Q#${index + 1}: "${submittedAnswer}" vs "${target}" (Dist: ${distance})`);
                        }
                    } else {
                        // Mixed types (Text vs Number or Number vs Text): No fuzzy match allowed
                        isAcceptableFuzzyMatch = false;
                    }

                    // --- Process if an acceptable fuzzy match was found ---
                    if (isAcceptableFuzzyMatch) {
                        matchedIndex = index;
                        canonicalMatch = question.answer; // Always return the canonical answer
                        fuzzyMatchFound = true; // Signal that a match was found in this pass
                        break; // Stop checking other targets for this question
                    }
                } // End loop through targets (answer + alternatives)

                if (fuzzyMatchFound) {
                     break; // Stop checking other questions if a fuzzy match was found
                }
            } // End loop through unanswered questions
        } // End Pass 2 (Fuzzy Matching)


        // --- Process Result ---
        if (matchedIndex !== -1 && canonicalMatch !== null) {
             this.userAnswers[matchedIndex] = canonicalMatch;
             this._unansweredIndices.delete(matchedIndex);

             // Check for completion
             if (this._unansweredIndices.size === 0) {
                 this._endQuiz('completed');
             }

             return { correct: true, questionIndex: matchedIndex, canonicalAnswer: canonicalMatch };
        }


        // If loop finishes and no match (exact or fuzzy) was found
        return { correct: false, reason: 'Incorrect' };
    }

    giveUp() {
        if (!this.isGivenUp) {
            this.isGivenUp = true;
            this._endQuiz('givenup');
        }
    }

    _endQuiz(reason) { // reason: 'completed', 'timeup', 'givenup', 'aborted'
        this.stopTimer();
        if (reason !== 'aborted') { // Don't mark as complete if user just navigates away early
             this.isComplete = true; // Mark as finished (used to prevent further actions)
        }
        if (this.callbacks.onQuizEnd) {
            this.callbacks.onQuizEnd(reason);
        }
    }

    getQuizStats() {
        const answeredCount = this.questions.length - this._unansweredIndices.size;
        return {
            remainingTime: this.remainingTime,
            answeredCount: answeredCount,
            totalCount: this.questions.length, // Use actual length from this instance
            isComplete: this.isComplete,
            isGivenUp: this.isGivenUp
        };
    }

    getSaveData() {
        return this.quizData; // Contains the actual questions used
    }

    getAllAnswers() {
        return this.questions.map(q => q.answer);
    }
}


// --- UIManager ---
class UIManager {
    constructor() {
        // Element References (Ensure all IDs match index.html)
        this.views = {
            mainMenu: document.getElementById('view-main-menu'),
            setup: document.getElementById('view-setup'),
            loading: document.getElementById('view-loading'),
            pregenerated: document.getElementById('view-pregenerated'),
            quiz: document.getElementById('view-quiz'),
        };
        this.globalError = document.getElementById('globalError');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.numQuestionsInput = document.getElementById('numQuestionsInput');
        this.difficultyInput = document.getElementById('difficultyInput');
        this.topicInput = document.getElementById('topicInput');
        this.timeLimitMinutesInput = document.getElementById('timeLimitMinutesInput');
        this.timeLimitSecondsInput = document.getElementById('timeLimitSecondsInput');
        this.timeLimitError = document.getElementById('timeLimitError');
        this.setupForm = document.getElementById('setupForm');
        this.loadingMessage = document.getElementById('loadingMessage');
        this.savedQuizList = document.getElementById('savedQuizList');
        this.noSavedQuizzesMessage = document.getElementById('noSavedQuizzesMessage');
        this.quizTimerDisplay = document.getElementById('quizTimerDisplay');
        this.quizProgressDisplay = document.getElementById('quizProgressDisplay');
        this.quizStatusMessage = document.getElementById('quizStatusMessage');
        this.quizAnswerInput = document.getElementById('quizAnswerInput');
        this.submitAnswerBtn = document.getElementById('submitAnswerBtn');
        this.questionTableBody = document.getElementById('questionTableBody');
        this.savedQuizCardTemplate = document.getElementById('savedQuizCardTemplate');
    }

    showView(viewId) {
        Object.values(this.views).forEach(view => {
            if (view) view.classList.remove('active-view');
        });
        const viewToShow = this.views[viewId];
        if (viewToShow) {
             viewToShow.classList.add('active-view');
        } else {
            console.error("View not found:", viewId);
            this.views.mainMenu.classList.add('active-view'); // Fallback
        }
        window.scrollTo(0, 0); // Scroll to top on view change
    }

    showError(message, isGlobal = true) {
        if (isGlobal) {
            this.globalError.textContent = message;
            this.globalError.style.display = 'block';
        } else {
             // For inline errors (like time limit) - already handled by specific element
             console.error("Inline error requested:", message);
             // Example: Find relevant element and display error nearby
             // const errorElement = document.getElementById('someFieldError');
             // if (errorElement) { errorElement.textContent = message; errorElement.style.display = 'block'; }
        }
    }

    hideError(isGlobal = true) {
         if (isGlobal) {
            this.globalError.style.display = 'none';
            this.globalError.textContent = '';
         }
         // Example: Hide specific inline errors
         // const errorElement = document.getElementById('someFieldError');
         // if (errorElement) { errorElement.style.display = 'none'; }
    }

     displayQuizStatusMessage(message, type = 'info', duration = 3000) {
        this.quizStatusMessage.textContent = message;
        this.quizStatusMessage.className = `status-message ${type}`; // Add type class
        if (duration > 0) {
            setTimeout(() => {
                 if (this.quizStatusMessage.textContent === message) { // Only clear if msg hasn't changed
                    this.quizStatusMessage.textContent = '';
                    this.quizStatusMessage.className = 'status-message';
                 }
            }, duration);
        }
    }

    getSetupOptions() {
        const apiKey = this.apiKeyInput.value.trim();
        const numQuestions = parseInt(this.numQuestionsInput.value, 10);
        const difficulty = this.difficultyInput.value;
        const topic = this.topicInput.value.trim();
        const minutes = parseInt(this.timeLimitMinutesInput.value, 10);
        const seconds = parseInt(this.timeLimitSecondsInput.value, 10);

        const timeLimitSeconds = (minutes * 60) + seconds;

        // Validation
        let isValid = true;
        this.timeLimitError.style.display = 'none'; // Hide time error initially
        this.apiKeyInput.style.borderColor = ''; // Reset border color
        this.numQuestionsInput.style.borderColor = '';

        if (isNaN(timeLimitSeconds) || timeLimitSeconds <= 0) {
            this.timeLimitError.style.display = 'block'; // Show time error message
            isValid = false;
        }
         if (!apiKey) {
            // Using global error for API key as it's critical
            this.showError("API Key is required.", true);
            this.apiKeyInput.style.borderColor = 'red'; // Highlight field
            this.apiKeyInput.focus();
            isValid = false;
         }
        if (isNaN(numQuestions) || numQuestions < 1 || numQuestions > 50) { // Added upper limit
            // Using global error for question count validity
            this.showError("Number of questions must be between 1 and 50.", true);
             this.numQuestionsInput.style.borderColor = 'red';
            this.numQuestionsInput.focus();
            isValid = false;
        }

        if (!isValid) {
            throw new Error("Invalid setup options. Please correct the highlighted fields.");
        }

        return { apiKey, numQuestions, difficulty, topic, timeLimitSeconds };
    }

    renderPregeneratedQuizzes(quizzes) {
        this.savedQuizList.innerHTML = ''; // Clear existing list
        if (!quizzes || quizzes.length === 0) {
            this.noSavedQuizzesMessage.style.display = 'block';
        } else {
            this.noSavedQuizzesMessage.style.display = 'none';
            quizzes.forEach((quizData, index) => {
                // Check if template exists
                 if (!this.savedQuizCardTemplate || !this.savedQuizCardTemplate.content) {
                    console.error("Saved quiz card template not found!");
                    return;
                 }
                const card = this.savedQuizCardTemplate.content.cloneNode(true).firstElementChild;
                card.dataset.quizIndex = index; // Store index for identification

                // Safely query elements within the card
                const setContent = (selector, text) => {
                    const el = card.querySelector(selector);
                    if (el) el.textContent = text;
                    else console.warn(`Element not found in template: ${selector}`);
                };

                setContent('.quiz-card-number', quizData.quizNumber);
                // Use actual number of questions from saved data
                setContent('.quiz-card-count', quizData.questions ? quizData.questions.length : 'N/A');
                setContent('.quiz-card-time', this.formatTime(quizData.timeLimitSeconds));
                setContent('.quiz-card-difficulty', quizData.difficulty);
                const topicEl = card.querySelector('.quiz-card-topic');
                if (topicEl) topicEl.textContent = quizData.topic || ''; // Handle empty topic

                // Ensure buttons have the index for event delegation
                const deleteBtn = card.querySelector('.delete-quiz-btn');
                if (deleteBtn) deleteBtn.dataset.quizIndex = index;
                const startBtn = card.querySelector('.start-quiz-btn');
                if (startBtn) startBtn.dataset.quizIndex = index;

                this.savedQuizList.appendChild(card);
            });
        }
    }

    prepareQuizView() {
        this.questionTableBody.innerHTML = '';
        this.quizTimerDisplay.textContent = '--:--:--';
        this.quizTimerDisplay.classList.remove('timer-low');
        this.quizProgressDisplay.textContent = '0/0';
        this.quizStatusMessage.textContent = '';
        this.quizStatusMessage.className = 'status-message';
        this.quizAnswerInput.value = '';
        this.quizAnswerInput.disabled = true;
        this.submitAnswerBtn.disabled = true;
        // Reset button text/states if needed
        const giveUpBtn = document.querySelector('#view-quiz button[data-action="give-up"]');
        if (giveUpBtn) giveUpBtn.disabled = false;
    }

    renderQuiz(quizInstance) {
        this.prepareQuizView(); // Reset the view first
        const questions = quizInstance.questions; // Get actual questions from instance
        this.updateQuizProgress(0, questions.length); // Use actual length

        questions.forEach((q, index) => {
            const row = this.questionTableBody.insertRow();
            row.insertCell(0).textContent = index + 1;
            row.insertCell(1).textContent = q.question;
            const answerCell = row.insertCell(2);
            answerCell.id = `answer-cell-${index}`; // ID for direct targeting
            answerCell.textContent = ''; // Initially empty
        });
    }

    formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const pad = (num) => String(num).padStart(2, '0');
        // Only show hours if necessary
        if (hours > 0) {
            return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        } else {
            return `${pad(minutes)}:${pad(seconds)}`;
        }
    }

    updateTimerDisplay(remainingSeconds) {
        this.quizTimerDisplay.textContent = this.formatTime(remainingSeconds);
        // Use classList.toggle for cleaner adding/removing based on condition
        this.quizTimerDisplay.classList.toggle('timer-low', remainingSeconds <= 30 && remainingSeconds > 0);
    }

    updateQuizProgress(answered, total) {
        this.quizProgressDisplay.textContent = `${answered}/${total}`;
    }

    updateAnswerCell(questionIndex, answerText, isRevealed = false) {
        const cell = document.getElementById(`answer-cell-${questionIndex}`);
        if (cell) {
            cell.textContent = answerText;
            cell.classList.remove('user-answer', 'revealed-answer'); // Clear previous styles
            // Add the appropriate class
            cell.classList.add(isRevealed ? 'revealed-answer' : 'user-answer');
        }
    }

    revealAllAnswers(quizInstance) {
        quizInstance.questions.forEach((q, index) => {
            // Only reveal if the user hasn't already answered it correctly
            if (quizInstance.userAnswers[index] === null) {
                this.updateAnswerCell(index, q.answer, true); // Mark as revealed
            }
        });
    }

    toggleQuizInput(enabled) {
        this.quizAnswerInput.disabled = !enabled;
        this.submitAnswerBtn.disabled = !enabled;
        if (enabled) {
            // Small delay helps ensure the view is rendered before focusing
            setTimeout(() => this.quizAnswerInput.focus(), 50);
        }
    }

    showAnswerInputError() {
        this.quizAnswerInput.classList.add('input-error');
        // Remove the class after the animation finishes (match CSS duration)
        setTimeout(() => {
            this.quizAnswerInput.classList.remove('input-error');
        }, 300);
    }

    resetSetupForm() {
        // Keep API key, reset others
        // this.apiKeyInput.value = ''; // Keep API key filled
        this.numQuestionsInput.value = '15';
        this.difficultyInput.value = 'medium';
        this.topicInput.value = '';
        this.timeLimitMinutesInput.value = '5';
        this.timeLimitSecondsInput.value = '0';
        this.timeLimitError.style.display = 'none'; // Hide time error
        this.numQuestionsInput.style.borderColor = ''; // Reset border color
    }

    displayLoading(show, message = 'Loading...') {
        if (show) {
            this.loadingMessage.textContent = message;
            this.showView('loading');
        } else {
             // Only hide the loading view if it's currently active
             if (this.views.loading.classList.contains('active-view')) {
                 this.views.loading.classList.remove('active-view');
                 // Important: Don't switch view here, controller decides next view
             }
        }
    }

    // Kept confirmation function, but not used by default for give up/end quiz
    showConfirmation(message) {
        return window.confirm(message);
    }

    setApiKeyInputValue(key) {
        this.apiKeyInput.value = key || '';
    }
}


// --- AppController ---
class AppController {
    constructor(uiManager, storageManager) {
        this.ui = uiManager;
        this.storage = storageManager;
        this.quizApi = null;
        this.activeQuiz = null;
        this.savedQuizzes = [];
        this.nextQuizNumber = 1;
        // Initialize known answer set property
        this.knownAnswerSet = new Set();
    }

    init() {
        // Load data
        const apiKey = this.storage.getApiKey();
        if (apiKey) {
            this.ui.setApiKeyInputValue(apiKey);
             try {
                this.quizApi = new QuizAPI(apiKey);
             } catch (e) {
                 // Show error but allow app to continue loading
                 this.ui.showError("Failed to initialize API handler. API Key might be invalid.");
                 // this.storage.saveApiKey(''); // Optionally clear invalid key
             }
        }
        this.savedQuizzes = this.storage.getQuizzes();
        this.nextQuizNumber = this.storage.getNextQuizNumber();
        // Load known answers from storage
        this.knownAnswerSet = this.storage.getKnownAnswers();

        // Setup event listeners
        this._setupEventListeners();

        // Show initial view
        this.ui.showView('mainMenu');
        this.ui.hideError(); // Clear any previous global errors
    }

    _setupEventListeners() {
        // Use event delegation on the body for button clicks with data-action
        document.body.addEventListener('click', (event) => {
            // Find the closest element with data-action, starting from the target
            const actionTarget = event.target.closest('[data-action]');
            if (actionTarget) {
                const action = actionTarget.dataset.action;
                this._handleAction(action, actionTarget); // Pass the element that has the action
            }
        });

        // Form submission for setup
        this.ui.setupForm.addEventListener('submit', (event) => {
            event.preventDefault(); // Prevent default form submission
            this._handleGenerateQuiz();
        });

        // API Key input change (using 'input' for real-time feedback, 'change' fires on blur)
        this.ui.apiKeyInput.addEventListener('input', (event) => {
            // Basic validation feedback could be added here in real-time if desired
            // For now, just update storage on blur via _handleApiKeyInput
        });
        this.ui.apiKeyInput.addEventListener('change', (event) => {
            this._handleApiKeyInput(event.target.value);
        });


        // Enter key in answer input
        this.ui.quizAnswerInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !this.ui.quizAnswerInput.disabled) {
                event.preventDefault(); // Prevent form submission/newline
                this.ui.submitAnswerBtn.click(); // Simulate click on submit button
            }
        });
    }

     _handleAction(action, targetElement) { // targetElement is the element with data-action
         this.ui.hideError(); // Hide global errors on any action

         switch (action) {
             case 'show-setup':
                 this.ui.resetSetupForm(); // Reset form when showing setup
                 this._navigate('setup');
                 break;
             case 'show-pregenerated':
                 this.ui.renderPregeneratedQuizzes(this.savedQuizzes);
                 this._navigate('pregenerated');
                 break;
             case 'show-main-menu':
                  this._navigate('mainMenu');
                 break;
             case 'start-saved-quiz':
                 const startIndex = targetElement.closest('[data-quiz-index]')?.dataset.quizIndex;
                 if (startIndex !== undefined) {
                     this._handleStartSavedQuiz(parseInt(startIndex, 10));
                 } else {
                    console.error("Could not find quiz index on start button parent.");
                 }
                 break;
             case 'delete-quiz':
                 // TargetElement here is the delete button itself which has the index
                 const deleteIndex = targetElement.dataset.quizIndex;
                  if (deleteIndex !== undefined) {
                     this._handleDeleteQuiz(parseInt(deleteIndex, 10));
                 } else {
                     console.error("Could not find quiz index on delete button.");
                 }
                 break;
             case 'submit-answer':
                 this._handleSubmitAnswer();
                 break;
             case 'give-up':
                 this._handleGiveUp(); // No confirmation by default
                 break;
             case 'end-quiz':
                 this._handleEndQuizEarly(); // No confirmation by default (via _navigate)
                 break;
             default:
                 console.warn("Unhandled action:", action);
         }
     }

     // Navigation logic - handles aborting active quiz without confirmation
     _navigate(viewId) {
          // Check if navigating AWAY from an active, unfinished quiz
          if (this.activeQuiz && !this.activeQuiz.isComplete && !this.activeQuiz.isGivenUp && viewId !== 'quiz') {
              console.log("Navigating away from active quiz. Aborting.");
              this.activeQuiz._endQuiz('aborted'); // Use internal method to signal abortion
              this.activeQuiz = null; // Discard the active quiz state
          }
          // Always switch the view
          this.ui.showView(viewId);
     }

     _handleApiKeyInput(key) {
         const trimmedKey = key.trim();
         this.storage.saveApiKey(trimmedKey);
         // Attempt to re-initialize QuizAPI
         if (trimmedKey) {
             try {
                 this.quizApi = new QuizAPI(trimmedKey);
                  this.ui.hideError(); // Hide error if key becomes valid/re-initialized ok
                  this.ui.apiKeyInput.style.borderColor = ''; // Reset border
             } catch (e) {
                  this.quizApi = null; // Invalidate API object
                  this.ui.showError("Failed to initialize API handler with the provided key.");
                  this.ui.apiKeyInput.style.borderColor = 'red'; // Indicate error on field
             }
         } else {
             this.quizApi = null; // Clear API object if key is removed
             this.ui.apiKeyInput.style.borderColor = ''; // Reset border
             // Optionally show a message indicating API key is needed
             // this.ui.showError("API Key is required to generate quizzes.", false);
         }
     }

    // Handles quiz generation, filtering, and saving
    async _handleGenerateQuiz() {
        let options;
        try {
            options = this.ui.getSetupOptions();
        } catch (error) {
            // getSetupOptions now throws and UIManager shows errors
            return; // Stop if options are invalid
        }

        if (!this.quizApi) {
            this.ui.showError("OpenAI API Key is not set or invalid. Please provide a valid key in the setup.", true);
            this.ui.apiKeyInput.style.borderColor = 'red';
            this.ui.apiKeyInput.focus();
            return;
        }

        this.ui.displayLoading(true, `Generating ${options.numQuestions} ${options.difficulty} questions (filtering duplicates)...`);

        try {
            // 1. Call API (passing known answers, potentially over-generating)
            const potentialQuestions = await this.quizApi.generateQuiz(
                options.numQuestions,
                options.difficulty,
                options.topic,
                this.knownAnswerSet // Pass the currently known answers
            );

            // 2. Filter for unique answers
            const finalQuizQuestions = [];
            const currentBatchAnswerSet = new Set(); // Tracks answers unique *within this new batch*

            for (const question of potentialQuestions) {
                // Stop if we have enough questions
                if (finalQuizQuestions.length >= options.numQuestions) {
                    break;
                }

                const canonicalAnswer = question.answer;
                const normalizedAnswer = normalizeString(canonicalAnswer); // Use global utility

                // Check uniqueness against global known set AND current batch set
                if (!this.knownAnswerSet.has(normalizedAnswer) && !currentBatchAnswerSet.has(normalizedAnswer)) {
                    finalQuizQuestions.push(question);
                    currentBatchAnswerSet.add(normalizedAnswer); // Add to batch set to prevent duplicates *within the batch*
                } else {
                    console.log(`Filtering duplicate answer: "${canonicalAnswer}" (Normalized: "${normalizedAnswer}")`);
                }
            }

            // 3. Handle Filtering Outcome
            if (finalQuizQuestions.length === 0) {
                 // Throw error if *no* unique questions could be found
                 throw new Error("Failed to generate any questions with unique answers. Try a different topic, broaden criteria, or clear known answers (via console if needed).");
            }

            let resultMessage = `Generated ${finalQuizQuestions.length} unique questions.`;
            if (finalQuizQuestions.length < options.numQuestions) {
                console.warn(`Requested ${options.numQuestions} unique questions, but only found ${finalQuizQuestions.length}. Proceeding with fewer.`);
                resultMessage += ` (Less than requested ${options.numQuestions})`;
            }

            // 4. Prepare final quiz data object
             const newQuizData = {
                quizNumber: this.nextQuizNumber,
                questions: finalQuizQuestions, // Use the filtered list
                difficulty: options.difficulty,
                topic: options.topic || '',
                timeLimitSeconds: options.timeLimitSeconds
             };

            // 5. Save Quiz & Update Known Answers globally
            this.savedQuizzes.push(newQuizData);
            this.storage.saveQuizzes(this.savedQuizzes);
            this.nextQuizNumber++;
            this.storage.saveNextQuizNumber(this.nextQuizNumber);

            // Add *all* newly used unique answers (from currentBatchAnswerSet) to the global known set
            currentBatchAnswerSet.forEach(answer => this.knownAnswerSet.add(answer));
            // Save the updated global set back to storage
            this.storage.saveKnownAnswers(this.knownAnswerSet);

            // 6. Start the quiz
            this.ui.displayLoading(false); // Hide loading indicator
            // Display success/warning message briefly before starting
            this.ui.displayQuizStatusMessage(resultMessage, 'info', 3000); // Show in quiz view status area
            this.startQuiz(newQuizData); // Pass data with potentially fewer questions

        } catch (error) {
            console.error("Quiz generation and filtering failed:", error);
            this.ui.displayLoading(false); // Hide loading indicator
            // Show error message persistently
            this.ui.showError(`Quiz Generation Failed: ${error.message}`, true);
            // Stay on setup view for user to adjust options or API key
        }
    }

    _handleStartSavedQuiz(index) {
         if (index >= 0 && index < this.savedQuizzes.length) {
              // Abort any currently active quiz (handled by _navigate)
              this._navigate('quiz'); // Navigate to quiz view, will abort if needed
              // Check if navigation actually happened (in case of future confirmation logic)
              if (!this.ui.views.quiz.classList.contains('active-view')) {
                  // If we didn't end up in the quiz view, maybe navigation was prevented
                  // For now, assume it always works or aborts silently
              }

              const quizData = this.savedQuizzes[index];
              // Ensure quizData.questions exists before starting
              if (!quizData || !quizData.questions) {
                  console.error("Saved quiz data is invalid or missing questions at index:", index);
                  this.ui.showError("Selected saved quiz data is corrupted.", true);
                  return;
              }
             this.startQuiz(quizData);
         } else {
             console.error("Invalid quiz index:", index);
             this.ui.showError("Could not find the selected quiz.", true);
         }
     }

     _handleDeleteQuiz(index) {
          if (index >= 0 && index < this.savedQuizzes.length) {
              const quizToDelete = this.savedQuizzes[index];
              // Keep confirmation for delete action
              const confirmDelete = this.ui.showConfirmation(`Are you sure you want to delete Quiz #${quizToDelete.quizNumber}? This action cannot be undone.`);
              if (confirmDelete) {
                  this.savedQuizzes.splice(index, 1); // Remove the quiz from the array
                  this.storage.saveQuizzes(this.savedQuizzes); // Update storage
                  this.ui.renderPregeneratedQuizzes(this.savedQuizzes); // Re-render the list
                  // Optionally clear related answers from knownAnswerSet?
                  // Decision: Keep answers known even if quiz is deleted. Simplifies logic.
                  // Show confirmation message
                  this.ui.showError(`Quiz #${quizToDelete.quizNumber} deleted.`, true); // Use global bar
                  setTimeout(() => this.ui.hideError(), 3000); // Hide after 3 seconds
              }
          } else {
              console.error("Invalid quiz index for deletion:", index);
              this.ui.showError("Could not find the quiz to delete.", true);
          }
      }

    // Starts a quiz instance with the given data
    startQuiz(quizData) {
        // Create new Quiz instance with potentially fewer questions
        this.activeQuiz = new Quiz(quizData, {
            onTimerUpdate: this._handleTimerUpdate.bind(this),
            onQuizEnd: this._handleQuizEnd.bind(this)
        });

        this.ui.renderQuiz(this.activeQuiz); // Renders based on actual questions in quizData
        // Ensure navigation occurs *after* rendering setup if coming from generation
        this._navigate('quiz'); // Use navigate to handle view switching
        this.ui.toggleQuizInput(true); // Enable input area
        this.activeQuiz.startTimer(); // Start the timer
    }

    // Callback for timer updates from the Quiz instance
    _handleTimerUpdate(remainingTime) {
        // Check if the quiz triggering the update is still the active one
        if (this.activeQuiz && !this.activeQuiz.isComplete) {
             this.ui.updateTimerDisplay(remainingTime);
        }
    }

    // Callback for quiz ending (completed, timeup, givenup, aborted)
    _handleQuizEnd(reason) {
        if (!this.activeQuiz) return; // Quiz might have been aborted/cleared already

        this.ui.toggleQuizInput(false); // Disable input on quiz end

        // Find and disable the 'Give Up' button as the quiz is over
        const giveUpBtn = document.querySelector('#view-quiz button[data-action="give-up"]');
        if (giveUpBtn) giveUpBtn.disabled = true;

        let message = '';
        let messageType = 'info';

        switch (reason) {
            case 'completed':
                message = 'Congratulations! You completed the quiz!';
                messageType = 'success';
                // Reveal answers on completion too
                 this.ui.revealAllAnswers(this.activeQuiz);
                break;
            case 'timeup':
                message = "Time's up!";
                messageType = 'error';
                this.ui.revealAllAnswers(this.activeQuiz); // Reveal answers when time is up
                break;
            case 'givenup':
                message = 'Quiz ended. Answers revealed.';
                messageType = 'info';
                 this.ui.revealAllAnswers(this.activeQuiz); // Reveal answers on give up
                break;
            case 'aborted':
                 // Quiz was ended prematurely by navigating away
                 console.log("Quiz aborted.");
                 this.activeQuiz = null; // Ensure it's cleared
                 return; // Don't display end message in the status bar
            default:
                message = 'Quiz ended.';
        }

        // Display final status message indefinitely
        this.ui.displayQuizStatusMessage(message, messageType, 0);

        // Note: activeQuiz object still holds the final state here until user navigates away
        // or starts a new quiz. We don't nullify it here unless aborted.
    }

    // Handles submission of an answer from the UI
    _handleSubmitAnswer() {
        if (!this.activeQuiz || this.activeQuiz.isComplete || this.activeQuiz.isGivenUp) return;

        const answer = this.ui.quizAnswerInput.value;
        const result = this.activeQuiz.submitAnswer(answer);

        if (result.correct) {
            this.ui.displayQuizStatusMessage('Correct!', 'success', 1500);
            this.ui.updateAnswerCell(result.questionIndex, result.canonicalAnswer, false); // Not revealed
            this.ui.quizAnswerInput.value = ''; // Clear input on correct answer
            const stats = this.activeQuiz.getQuizStats();
            this.ui.updateQuizProgress(stats.answeredCount, stats.totalCount);
        } else {
            if (result.reason !== 'Empty answer') { // Don't show error/shake for blank submit
                 this.ui.displayQuizStatusMessage('Incorrect. Try again or another question.', 'error', 2000);
                 this.ui.showAnswerInputError(); // Shake animation
            }
        }
         // Keep focus in the input field for the next answer
         this.ui.quizAnswerInput.focus();
    }

    // Handles the "Give Up" button click (no confirmation)
    _handleGiveUp() {
        if (this.activeQuiz && !this.activeQuiz.isComplete && !this.activeQuiz.isGivenUp) {
            this.activeQuiz.giveUp();
        }
    }

    // Handles the "End Quiz & Back to Menu" button click (no confirmation via _navigate)
    _handleEndQuizEarly() {
         // Navigate function handles confirmation (if added back) and abortion
         this._navigate('mainMenu');
    }

    // --- Optional Debug Method ---
    clearKnownAnswers() {
        console.log("Clearing known answers list...");
        this.knownAnswerSet = new Set();
        this.storage.saveKnownAnswers(this.knownAnswerSet);
        console.log("Known answers cleared.");
        alert("Known answers list has been cleared."); // Provide user feedback
    }
}


// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const storageManager = new StorageManager();
    const uiManager = new UIManager();
    const appController = new AppController(uiManager, storageManager);
    appController.init();

    // Optional: Make controller accessible globally for debugging
    // e.g., open browser console and type: app.clearKnownAnswers()
    window.app = appController;
});