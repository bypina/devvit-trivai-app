import { Devvit, useState } from '@devvit/public-api';

type MessagePayload =
  | {
      type: 'initialData';
      data: {
        username: string;
        question: string;
        answer: string;
      };
    }
  | {
      type: 'submitAnswer';
      data: {
        userAnswer: string;
      };
    }
  | {
      type: 'answerResult';
      data: {
        isCorrect: boolean;
        correctAnswer: string;
        scores: { user: string; score: number }[];
      };
    };

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true
});

// Replace with your actual OpenAI API key
const OPENAI_API_KEY = '';

const DAY_MS = 24 * 60 * 60 * 1000;   // one day
const WEEK_MS = 7 * DAY_MS;           // one week

Devvit.addCustomPostType({
  name: 'do you know music?',
  height: 'tall',
  render: (context) => {
    const [username] = useState(async () => {
      const currUser = await context.reddit.getCurrentUser();
      return currUser?.username ?? 'anon';
    });

    const [currentQuestion, setCurrentQuestion] = useState("");
    const [currentAnswer, setCurrentAnswer] = useState("");

    async function fetchTriviaQuestionFromAPI(): Promise<{ question: string; answer: string }> {
      const prompt = `Give me a single random trivia question about the artist tame impala or his music, 
      dont make it basic and nothing to do with his name. Also give me the correct answer in strict JSON format like: {"question":"...","answer":"..."}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100,
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      console.log("API response:", data)
      const content = data.choices?.[0]?.message?.content.trim();
      if (!content) {
        return { question: "Could not fetch trivia question", answer: "unknown" };
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
        console.log("parsed: ", parsed);
      } catch (e) {
        parsed = { question: "Error parsing question", answer: "unknown" };
      }
      return { question: parsed.question, answer: parsed.answer };
    }

    // Fetch or retrieve trivia question from Redis, only update once a day
    async function getDailyTriviaQuestion(): Promise<{ question: string; answer: string }> {
      const currentQuestionKey = 'current_question';
      const currentAnswerKey = 'current_answer';
      const questionTimestampKey = 'current_question_timestamp';

      const savedQuestion = await context.redis.get(currentQuestionKey);
      const savedAnswer = await context.redis.get(currentAnswerKey);
      const savedTimestamp = await context.redis.get(questionTimestampKey);

      const now = Date.now();
      const lastUpdated = savedTimestamp ? Number(savedTimestamp) : 0;

      if (savedQuestion && savedAnswer && (now - lastUpdated) < DAY_MS) {
        // Use cached question and answer
        console.log("Using cached question and answer from Redis (within a day).");
        return { question: savedQuestion, answer: savedAnswer };
      } else {
        // Either no cached data or it's older than a day, fetch a new one
        console.log("Fetching new daily question from API...");
        const newTrivia = await fetchTriviaQuestionFromAPI();
        // Store in Redis
        await context.redis.set(currentQuestionKey, newTrivia.question);
        await context.redis.set(currentAnswerKey, newTrivia.answer);
        await context.redis.set(questionTimestampKey, now.toString());

        return newTrivia;
      }
    }

    // Check scoreboard weekly; if older than a week, reset everyone to 0
    async function resetScoreboardIfNeeded() {
      const scoresKey = 'scores_current_week';
      const scoreboardTimestampKey = 'scoreboard_timestamp';

      const savedTimestamp = await context.redis.get(scoreboardTimestampKey);
      const now = Date.now();
      const lastUpdated = savedTimestamp ? Number(savedTimestamp) : 0;

      if ((now - lastUpdated) > WEEK_MS) {
        console.log("Weekly reset of scoreboard.");
        // Reset scoreboard
        await context.redis.set(scoresKey, JSON.stringify({}));
        await context.redis.set(scoreboardTimestampKey, now.toString());
      } else {
        console.log("Scoreboard still valid, no reset needed.");
      }
    }

    const [webviewVisible, setWebviewVisible] = useState(false);

    const onMessage = async (msg: { type: 'devvit-message'; data: { message: MessagePayload } }) => {
      const message = msg.data.message;
      if (message.type === 'submitAnswer') {
        console.log("submitAnswer message: ", message)
        const isCorrect = message.data.userAnswer.trim().toLowerCase() === currentAnswer.trim().toLowerCase();

        // Update scoreboard if correct
        const scoresKey = 'scores_current_week';
        const rawScores = await context.redis.get(scoresKey);
        const scores = rawScores ? JSON.parse(rawScores) : {};

        if (isCorrect && username) {
          scores[username] = (scores[username] ?? 0) + 1;
          await context.redis.set(scoresKey, JSON.stringify(scores));
        }

        // Sort scores for display
        const entries = Object.entries(scores) as [string, number][];
        entries.sort((a, b) => b[1] - a[1]);
        const sortedScores = entries.map(([user, score]) => ({ user, score }));

        // Send answerResult
        context.ui.webView.postMessage('myWebView', {
          type: 'devvit-message',
          data: {
            message: {
              type: 'answerResult',
              data: {
                isCorrect,
                correctAnswer: currentAnswer,
                scores: sortedScores,
              },
            },
          },
        });
      }
    };

    const onShowWebviewClick = async () => {
      // First, reset scoreboard if older than a week
      await resetScoreboardIfNeeded();

      // Get the daily cached question or fetch a new one
      const trivia = await getDailyTriviaQuestion();
      setCurrentQuestion(trivia.question);
      setCurrentAnswer(trivia.answer);

      setWebviewVisible(true);

      context.ui.webView.postMessage('myWebView', {
        type: 'devvit-message',
        data: {
          message: {
            type: 'initialData',
            data: {
              username: username!,
              question: trivia.question,
              answer: trivia.answer
            },
          },
        },
      });
    };

    return (
      <vstack grow padding="small">
   
        <vstack
          grow={!webviewVisible}
          height={webviewVisible ? '0%' : '100%'}
          alignment="middle center"
          
        >
          <text size="xxlarge" weight="bold">do you know music?</text>
          <spacer size="medium" />

          <image
            url="album-collage.jpg"
            height="75%"
            width="100%"
            imageWidth={250}
            imageHeight={250}
            resizeMode="fit"
            description="Generative artwork: Fuzzy Fingers"
          />
          <spacer />
          <vstack alignment="start middle">
            <hstack>
              <text size="medium">Username:</text>
              <text size="medium" weight="bold">{username ?? ''}</text>
            </hstack>
          </vstack>
          <spacer />
          <button onPress={onShowWebviewClick}>try it</button>
        </vstack>

        <vstack grow={webviewVisible} height={webviewVisible ? '100%' : '0%'}>
          <vstack border="thick" borderColor="black" height={webviewVisible ? '100%' : '0%'}>
            <webview
              id="myWebView"
              url="page.html"
              onMessage={(msg) => onMessage(msg as any)}
              grow
              height={webviewVisible ? '100%' : '0%'}
            />
          </vstack>
        </vstack>
      </vstack>
    );
  },
});

export default Devvit;
