// --- Levenshtein Distance Utility ---
// (Place this near the top of app.js, before the classes)
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
 * Allows only digits (0-9). Add other characters like '.' or '-' if needed,
 * but for years/counts, digits-only is often sufficient.
 * @param {string} str The string to check.
 * @returns {boolean} True if the string contains only digits, false otherwise.
 */
function isDigitsOnly(str) {
    if (!str) return false; // Handle empty or null strings
    return /^\d+$/.test(str);
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
            // Consider notifying the user if storage is full
        }
    }

    getQuizzes() {
        try {
            const quizzesJson = localStorage.getItem(this._getKey('quizzes'));
            return JSON.parse(quizzesJson || '[]');
        } catch (e) {
            console.error("Error getting or parsing quizzes from localStorage:", e);
            return []; // Return empty array on error
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
}

// --- Quiz ---
class Quiz {
    constructor(quizData, callbacks) {
        // quizData expected: { quizNumber, questions: [{question, answer, alternativeAnswers}], difficulty, topic, timeLimitSeconds }
        this.quizData = quizData;
        this.questions = quizData.questions;
        this.timeLimitSeconds = quizData.timeLimitSeconds;
        this.callbacks = callbacks; // { onTimerUpdate(remainingTime), onQuizEnd(reason) }

        this.userAnswers = new Array(this.questions.length).fill(null);
        this.remainingTime = this.timeLimitSeconds;
        this.timerId = null;
        this.isComplete = false;
        this.isGivenUp = false;
        this.startTime = null;

        // Set of indices of unanswered questions for faster lookup
        this._unansweredIndices = new Set(this.questions.map((_, i) => i));
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

    _normalizeString(str) {
        return str.trim().toLowerCase();
        // Future enhancement: remove punctuation, handle articles (a, an, the) if needed
    }

    submitAnswer(submittedAnswer) {
        if (this.isComplete || this.isGivenUp || this.remainingTime <= 0) {
            return { correct: false, reason: 'Quiz ended' };
        }

        const normalizedSubmission = this._normalizeString(submittedAnswer);
        if (!normalizedSubmission) return { correct: false, reason: 'Empty answer' };

        let exactMatchFound = false;
        let matchedIndex = -1;
        let canonicalMatch = null;

        // --- Pass 1: Check for Exact Matches (Case Insensitive, Trimmed) ---
        for (const index of this._unansweredIndices) {
            const question = this.questions[index];
            const normalizedAnswer = this._normalizeString(question.answer);
            const normalizedAlternatives = question.alternativeAnswers.map(this._normalizeString);

            if (normalizedSubmission === normalizedAnswer || normalizedAlternatives.includes(normalizedSubmission)) {
                exactMatchFound = true;
                matchedIndex = index;
                canonicalMatch = question.answer; // Store canonical answer
                break; // Found an exact match, no need to check further questions
            }
        }

        // --- Pass 2: Check for Fuzzy Matches (Levenshtein) if no exact match found ---
        if (!exactMatchFound) { // Renamed flag for clarity
            let fuzzyMatchFound = false; // Use a separate flag for fuzzy pass completion

            for (const index of this._unansweredIndices) {
                const question = this.questions[index];
                // Include main answer and alternatives for fuzzy checking
                const checkTargets = [question.answer, ...question.alternativeAnswers];

                for (const target of checkTargets) {
                    const normalizedTarget = this._normalizeString(target);
                    if (!normalizedTarget) continue; // Skip empty targets

                    const distance = calculateLevenshteinDistance(normalizedSubmission, normalizedTarget);

                    // --- Determine if a fuzzy match is acceptable ---
                    let isAcceptableFuzzyMatch = false;
                    const isSubmissionNumeric = isDigitsOnly(normalizedSubmission);
                    const isTargetNumeric = isDigitsOnly(normalizedTarget);

                    if (isSubmissionNumeric && isTargetNumeric) {
                        // *** Stricter Rule for Numerical Data ***
                        // Only allow distance 1 IF lengths are the same (catches single char typo like 19l2)
                        // Disallows off-by-one numbers (1913) or different length numbers (191)
                        if (distance <= 1 && normalizedSubmission.length === normalizedTarget.length) {
                             // Stricter check: Could even be distance === 1 if 0 means exact match
                             // Let's stick to distance <= 1 for now to allow 1 typo fix.
                             isAcceptableFuzzyMatch = true;
                             console.log(`Fuzzy numeric match for Q#${index + 1}: "${submittedAnswer}" vs "${target}" (Dist: ${distance}, Len Match)`);
                        }
                        // If they are numeric but don't meet the strict criteria, isAcceptableFuzzyMatch remains false
                    } else {
                        // *** Original Rule for Non-Numerical Data ***
                        const thresholdMet = (
                            (distance === 1) ||
                            (distance === 2 && normalizedTarget.length > 5) // Allow distance 2 only for longer text
                        );
                        if (thresholdMet) {
                            isAcceptableFuzzyMatch = true;
                            console.log(`Fuzzy text match for Q#${index + 1}: "${submittedAnswer}" vs "${target}" (Dist: ${distance})`);
                        }
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
            // ... (rest of the success logic: update userAnswers, _unansweredIndices, check completion, return correct) ...
             this.userAnswers[matchedIndex] = canonicalMatch;
             this._unansweredIndices.delete(matchedIndex);

             if (this._unansweredIndices.size === 0) {
                 this._endQuiz('completed');
             }

             return { correct: true, questionIndex: matchedIndex, canonicalAnswer: canonicalMatch };
        }

        // If no match (exact or fuzzy) was found
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
            totalCount: this.questions.length,
            isComplete: this.isComplete,
            isGivenUp: this.isGivenUp
        };
    }

    // Returns data suitable for saving back to storage (original format)
    getSaveData() {
        return this.quizData;
    }

    getAllAnswers() {
        return this.questions.map(q => q.answer);
    }
}


// --- UIManager ---
class UIManager {
    constructor() {
        // Element References
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
             // Implement inline errors if needed, e.g., for setup form
             console.error("Inline error:", message); // Placeholder
        }
    }

    hideError(isGlobal = true) {
         if (isGlobal) {
            this.globalError.style.display = 'none';
            this.globalError.textContent = '';
         }
    }

     displayQuizStatusMessage(message, type = 'info', duration = 3000) {
        this.quizStatusMessage.textContent = message;
        this.quizStatusMessage.className = `status-message ${type}`; // Add type class (success, error, info)
        if (duration > 0) {
            setTimeout(() => {
                 if (this.quizStatusMessage.textContent === message) { // Only clear if it hasn't changed
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
        if (isNaN(timeLimitSeconds) || timeLimitSeconds <= 0) {
            this.timeLimitError.style.display = 'block'; // Show time error
            isValid = false;
        }
         if (!apiKey) {
            this.showError("API Key is required.", false); // Maybe highlight the field instead
            this.apiKeyInput.focus();
            isValid = false;
         }
        if (isNaN(numQuestions) || numQuestions < 1 || numQuestions > 50) { // Added upper limit
            this.showError("Number of questions must be between 1 and 50.", false);
            this.numQuestionsInput.focus();
            isValid = false;
        }


        if (!isValid) {
            throw new Error("Invalid setup options.");
        }

        return { apiKey, numQuestions, difficulty, topic, timeLimitSeconds };
    }

    renderPregeneratedQuizzes(quizzes) {
        this.savedQuizList.innerHTML = ''; // Clear existing list
        if (quizzes.length === 0) {
            this.noSavedQuizzesMessage.style.display = 'block';
        } else {
            this.noSavedQuizzesMessage.style.display = 'none';
            quizzes.forEach((quizData, index) => {
                const card = this.savedQuizCardTemplate.content.cloneNode(true).firstElementChild;
                card.dataset.quizIndex = index; // Store index for identification
                card.querySelector('.quiz-card-number').textContent = quizData.quizNumber;
                card.querySelector('.quiz-card-count').textContent = quizData.questions.length;
                card.querySelector('.quiz-card-time').textContent = this.formatTime(quizData.timeLimitSeconds);
                card.querySelector('.quiz-card-difficulty').textContent = quizData.difficulty;
                const topicEl = card.querySelector('.quiz-card-topic');
                topicEl.textContent = quizData.topic || ''; // Will trigger :empty selector if blank

                 // Ensure data-action attributes are set for delegation
                card.querySelector('.delete-quiz-btn').dataset.quizIndex = index;
                card.querySelector('.start-quiz-btn').dataset.quizIndex = index;

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
        // Reset button text/states if needed (e.g., if "Give Up" changes)
        const giveUpBtn = document.querySelector('#view-quiz button[data-action="give-up"]');
        if (giveUpBtn) giveUpBtn.disabled = false;
    }

    renderQuiz(quizInstance) {
        this.prepareQuizView(); // Reset the view first
        const questions = quizInstance.questions;
        this.updateQuizProgress(0, questions.length); // Initial progress

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
        if (remainingSeconds <= 30 && remainingSeconds > 0) { // Example: Low time threshold
            this.quizTimerDisplay.classList.add('timer-low');
        } else {
            this.quizTimerDisplay.classList.remove('timer-low');
        }
    }

    updateQuizProgress(answered, total) {
        this.quizProgressDisplay.textContent = `${answered}/${total}`;
    }

    updateAnswerCell(questionIndex, answerText, isRevealed = false) {
        const cell = document.getElementById(`answer-cell-${questionIndex}`);
        if (cell) {
            cell.textContent = answerText;
            cell.classList.remove('user-answer', 'revealed-answer'); // Clear previous styles
            if(isRevealed) {
                cell.classList.add('revealed-answer');
            } else {
                 cell.classList.add('user-answer');
            }
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
            this.quizAnswerInput.focus(); // Focus input when enabled
        }
    }

    showAnswerInputError() {
        this.quizAnswerInput.classList.add('input-error');
        // Remove the class after the animation finishes
        setTimeout(() => {
            this.quizAnswerInput.classList.remove('input-error');
        }, 300); // Match animation duration
    }

    resetSetupForm() {
        // Keep API key, reset others
        // this.apiKeyInput.value = ''; // Decided against resetting API key
        this.numQuestionsInput.value = '5';
        this.difficultyInput.value = 'medium';
        this.topicInput.value = '';
        this.timeLimitMinutesInput.value = '5';
        this.timeLimitSecondsInput.value = '0';
         this.timeLimitError.style.display = 'none';
    }

    displayLoading(show, message = 'Loading...') {
        if (show) {
            this.loadingMessage.textContent = message;
            this.showView('loading');
        } else {
             // Don't automatically switch view here, let the controller decide where to go next
             // Only hide the loading view if it's currently active
             if (this.views.loading.classList.contains('active-view')) {
                 this.views.loading.classList.remove('active-view');
             }
        }
    }

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
        this.quizApi = null; // Initialized when API key is available
        this.activeQuiz = null;
        this.savedQuizzes = [];
        this.nextQuizNumber = 1;
    }

    init() {
        // Load data
        const apiKey = this.storage.getApiKey();
        if (apiKey) {
            this.ui.setApiKeyInputValue(apiKey);
             try {
                this.quizApi = new QuizAPI(apiKey);
             } catch (e) {
                 this.ui.showError("Failed to initialize API handler. Please check your API key.");
                 this.storage.saveApiKey(''); // Clear invalid key? Maybe not.
             }
        }
        this.savedQuizzes = this.storage.getQuizzes();
        this.nextQuizNumber = this.storage.getNextQuizNumber();

        // Setup event listeners
        this._setupEventListeners();

        // Show initial view
        this.ui.showView('mainMenu');
        this.ui.hideError(); // Clear any previous errors
    }

    _setupEventListeners() {
        // Use event delegation on the body for button clicks with data-action
        document.body.addEventListener('click', (event) => {
            const target = event.target;
            const action = target.closest('[data-action]')?.dataset.action;

            if (action) {
                this._handleAction(action, target);
            }
        });

        // Form submission for setup
        this.ui.setupForm.addEventListener('submit', (event) => {
            event.preventDefault();
            this._handleGenerateQuiz();
        });

        // API Key input change
        this.ui.apiKeyInput.addEventListener('change', (event) => {
            this._handleApiKeyInput(event.target.value);
        });

        // Enter key in answer input
        this.ui.quizAnswerInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent form submission/newline
                this._handleSubmitAnswer();
            }
        });
    }

    _handleAction(action, target) {
        this.ui.hideError(); // Hide errors on any action

        switch (action) {
            case 'show-setup':
                this._navigate('setup');
                break;
            case 'show-pregenerated':
                this.ui.renderPregeneratedQuizzes(this.savedQuizzes);
                this._navigate('pregenerated');
                break;
            case 'show-main-menu':
                 this._navigate('mainMenu');
                break;
            // case 'generate-quiz': // Handled by form submit
            //     this._handleGenerateQuiz();
            //     break;
            case 'start-saved-quiz':
                const startIndex = target.closest('[data-quiz-index]')?.dataset.quizIndex;
                if (startIndex !== undefined) {
                    this._handleStartSavedQuiz(parseInt(startIndex, 10));
                }
                break;
            case 'delete-quiz':
                const deleteIndex = target.closest('[data-quiz-index]')?.dataset.quizIndex;
                 if (deleteIndex !== undefined) {
                    this._handleDeleteQuiz(parseInt(deleteIndex, 10));
                }
                break;
            case 'submit-answer':
                this._handleSubmitAnswer();
                break;
            case 'give-up':
                this._handleGiveUp();
                break;
            case 'end-quiz':
                this._handleEndQuizEarly();
                break;
            default:
                console.warn("Unhandled action:", action);
        }
    }

    _navigate(viewId) {
         // *** MODIFIED: Removed confirmation logic ***
         if (this.activeQuiz && !this.activeQuiz.isComplete && !this.activeQuiz.isGivenUp && viewId !== 'quiz') {
            // If leaving an active quiz, treat it as aborting
            this.activeQuiz._endQuiz('aborted'); // Use internal method to signal abortion without full completion state
            this.activeQuiz = null; // Discard the active quiz state
        }
        this.ui.showView(viewId);
   }

     _handleApiKeyInput(key) {
        const trimmedKey = key.trim();
        this.storage.saveApiKey(trimmedKey);
        if (trimmedKey) {
            try {
                this.quizApi = new QuizAPI(trimmedKey);
                 this.ui.hideError(); // Hide error if key becomes valid
            } catch (e) {
                 this.quizApi = null; // Invalidate API object
                 this.ui.showError("Failed to initialize API handler with the provided key.");
            }
        } else {
            this.quizApi = null; // Clear API object if key is removed
        }
    }

    async _handleGenerateQuiz() {
        let options;
        try {
            options = this.ui.getSetupOptions();
        } catch (error) {
            this.ui.showError(error.message, false); // Show setup-specific errors inline if possible
            return; // Stop if options are invalid
        }

        if (!this.quizApi) {
            this.ui.showError("OpenAI API Key is not set or invalid. Please provide a valid key in the setup.", true);
             // Don't navigate away, let user fix the key in setup view
             this.ui.apiKeyInput.focus();
            return;
        }

        this.ui.displayLoading(true, `Generating ${options.numQuestions} ${options.difficulty} questions...`);

        try {
            const questions = await this.quizApi.generateQuiz(
                options.numQuestions,
                options.difficulty,
                options.topic
            );

            // Add metadata and unique number
            const newQuizData = {
                quizNumber: this.nextQuizNumber,
                questions: questions,
                difficulty: options.difficulty,
                topic: options.topic || '', // Ensure topic is always a string
                timeLimitSeconds: options.timeLimitSeconds
            };

            // Save and update state
            this.savedQuizzes.push(newQuizData);
            this.storage.saveQuizzes(this.savedQuizzes);
            this.nextQuizNumber++;
            this.storage.saveNextQuizNumber(this.nextQuizNumber);

            this.ui.displayLoading(false); // Hide loading
            this.startQuiz(newQuizData); // Start the newly generated quiz

        } catch (error) {
            console.error("Quiz generation failed:", error);
            this.ui.displayLoading(false);
            this.ui.showError(`Quiz Generation Failed: ${error.message}`, true);
            // Stay on setup view or go back to main menu? Stay on setup for now.
            // this.ui.showView('setup');
        }
    }

     _handleStartSavedQuiz(index) {
         if (index >= 0 && index < this.savedQuizzes.length) {
              if (this.activeQuiz && !this.activeQuiz.isComplete && !this.activeQuiz.isGivenUp) {
                 const leave = this.ui.showConfirmation("Starting a new quiz will end your current one. Are you sure?");
                 if (!leave) return;
                 // Abort previous quiz
                 this.activeQuiz._endQuiz('aborted');
             }
             const quizData = this.savedQuizzes[index];
             this.startQuiz(quizData);
         } else {
             console.error("Invalid quiz index:", index);
             this.ui.showError("Could not find the selected quiz.", true);
         }
     }

     _handleDeleteQuiz(index) {
          if (index >= 0 && index < this.savedQuizzes.length) {
              const quizToDelete = this.savedQuizzes[index];
              const confirmDelete = this.ui.showConfirmation(`Are you sure you want to delete Quiz #${quizToDelete.quizNumber}?`);
              if (confirmDelete) {
                  this.savedQuizzes.splice(index, 1); // Remove the quiz
                  this.storage.saveQuizzes(this.savedQuizzes); // Update storage
                  this.ui.renderPregeneratedQuizzes(this.savedQuizzes); // Re-render the list
                  this.ui.displayQuizStatusMessage(`Quiz #${quizToDelete.quizNumber} deleted.`, 'info', 2000); // Show confirmation inline
              }
          } else {
              console.error("Invalid quiz index for deletion:", index);
              this.ui.showError("Could not find the quiz to delete.", true);
          }
      }


    startQuiz(quizData) {
        this.activeQuiz = new Quiz(quizData, {
            onTimerUpdate: this._handleTimerUpdate.bind(this),
            onQuizEnd: this._handleQuizEnd.bind(this)
        });

        this.ui.renderQuiz(this.activeQuiz);
        this.ui.showView('quiz');
        this.ui.toggleQuizInput(true); // Enable input
        this.activeQuiz.startTimer();
    }

    _handleTimerUpdate(remainingTime) {
        if (this.activeQuiz) { // Check if quiz is still active
             this.ui.updateTimerDisplay(remainingTime);
        }
    }

    _handleQuizEnd(reason) {
        if (!this.activeQuiz) return; // Quiz might have been aborted

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
                 this.ui.revealAllAnswers(this.activeQuiz); // Show answers on completion too
                break;
            case 'timeup':
                message = "Time's up!";
                messageType = 'error';
                this.ui.revealAllAnswers(this.activeQuiz);
                break;
            case 'givenup':
                message = 'Quiz ended. Answers revealed.';
                messageType = 'info';
                 this.ui.revealAllAnswers(this.activeQuiz);
                break;
            case 'aborted':
                 // No message needed, user chose to leave
                 this.activeQuiz = null; // Ensure it's cleared
                 return; // Don't display end message
            default:
                message = 'Quiz ended.';
        }

        this.ui.displayQuizStatusMessage(message, messageType, 0); // Show final message indefinitely
        // The activeQuiz object still holds the final state until the user navigates away
    }


    _handleSubmitAnswer() {
        if (!this.activeQuiz || this.activeQuiz.isComplete || this.activeQuiz.isGivenUp) return;

        const answer = this.ui.quizAnswerInput.value;
        const result = this.activeQuiz.submitAnswer(answer);

        if (result.correct) {
            this.ui.displayQuizStatusMessage('Correct!', 'success', 1500);
            this.ui.updateAnswerCell(result.questionIndex, result.canonicalAnswer);
            this.ui.quizAnswerInput.value = ''; // Clear input on correct answer
            const stats = this.activeQuiz.getQuizStats();
            this.ui.updateQuizProgress(stats.answeredCount, stats.totalCount);
        } else {
            if (result.reason !== 'Empty answer') { // Don't show error for blank submit
                 this.ui.displayQuizStatusMessage('Incorrect. Try another question or answer.', 'error', 2000);
                 this.ui.showAnswerInputError();
            }
        }
    }

    _handleGiveUp() {
        if (this.activeQuiz && !this.activeQuiz.isComplete && !this.activeQuiz.isGivenUp) {
            // *** MODIFIED: Removed confirmation ***
            this.activeQuiz.giveUp();
        }
    }

    _handleEndQuizEarly() {
        // Navigate function now handles abortion without confirmation
        this._navigate('mainMenu');
    }
}


// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const storageManager = new StorageManager();
    const uiManager = new UIManager();
    const appController = new AppController(uiManager, storageManager);
    appController.init();

    // Optional: Make controller accessible globally for debugging
    // window.appController = appController;
});