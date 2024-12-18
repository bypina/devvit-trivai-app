class App {
  constructor() {
    const questionArea = document.getElementById('questionArea');
    const usernameArea = document.getElementById('usernameArea');
    const answerInput = document.getElementById('answerInput');
    const submitBtn = document.getElementById('submitBtn');
    const resultArea = document.getElementById('resultArea');
    const answerArea = document.getElementById('answerArea');

    window.addEventListener('message', (event) => {
      const { type, data } = event.data;

      // We expect `type` to be 'devvit-message'
      if (type === 'devvit-message') {
        const { message } = data;
        console.log("Full message object:", message);

        // initialData scenario
        if (
          message.data && 
          message.data.message && 
          message.data.message.type === 'initialData'
        ) {
          const question = message.data.message.data.question;
          console.log("data: ", message.data);
          questionArea.textContent = question;
          usernameArea.textContent = "Username: " + message.data.message.data.username;
          answerArea.textContent = "Answer: " + message.data.message.data.answer
        } else if (message.data.message.type === 'answerResult') {
          const isCorrect = message.data.message.data.isCorrect;
          const answer = message.data.message.data.correctAnswer;
          console.log("answerResult isCorrect:", isCorrect, "answer:", answer);
          resultArea.textContent = isCorrect
            ? "Correct! Great job."
            : "Incorrect. The correct answer is: " + answer;

          // Hide the submit button after receiving the result
          submitBtn.style.display = 'none';

          // Display the scoreboard if provided
          const scores = message.data.message.data.scores;
          if (scores && Array.isArray(scores)) {
            const scoreboardArea = document.createElement('div');
            scoreboardArea.classList.add('scoreboard');

            const title = document.createElement('h3');
            title.textContent = 'weekly scoreboard:';
            scoreboardArea.appendChild(title);

            const ul = document.createElement('ul');
            scores.forEach((player) => {
              const li = document.createElement('li');
              li.textContent = `${player.user}: ${player.score}`;
              ul.appendChild(li);
            });
            scoreboardArea.appendChild(ul);

            // Insert the scoreboard below the result area
            resultArea.insertAdjacentElement('afterend', scoreboardArea);
          }
        } else {
          console.warn("Received a message that doesn't match known structures.");
        }
      }
    });

    submitBtn.addEventListener('click', () => {
      const userAnswer = answerInput.value;
      // Send the user's answer back to Devvit
      window.parent.postMessage({
        type: 'devvit-message',
        data: {
          message: {
            type: 'submitAnswer',
            data: { userAnswer }
          }
        }
      }, '*');
    });
  }
}
new App();
