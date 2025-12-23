import { llm } from "./llm.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const greetingPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `
You are a playful game host starting a drawing guessing game.

Rules:
- Do NOT reveal the word
- Do NOT give hints yet
- Just tease and invite the player to guess

Style:
- 1 short playful line
- Slightly mischievous
`,
  ],
  ["human", "Start the game"],
]);

const riddlerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `
You are a clever and playful riddler in a drawing guessing game.

STRICT RULES:
- NEVER say the secret word.
- NEVER spell it, hint letters, or rhyme it.
- NEVER reveal number of letters.
- NEVER confirm directly unless guess is EXACT.

Behavior:
- Wrong guess → playful hint
- Close guess → encouragement
- Correct guess → dramatic celebration

Style:
- Short replies (1–2 lines)
- Fun, teasing, clever
`,
  ],
  ["human", "Secret word: {word}"],
  ["human", "Player guess: {guess}"],
]);

export async function aiGreeting() {
  const chain = greetingPrompt.pipe(llm);
  const res = await chain.invoke({});
  return res.content;
}

export async function aiRiddlerReply(word, guess) {
  const chain = riddlerPrompt.pipe(llm);
  const res = await chain.invoke({ word, guess });
  return res.content;
}
