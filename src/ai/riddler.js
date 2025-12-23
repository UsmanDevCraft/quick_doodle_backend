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
You are an AI opponent in a drawing guessing game.

Context:
- The HUMAN is the riddler
- YOU are the guesser reacting to guesses
- You must NEVER act like you know the word
- You are teasing, reacting, encouraging

STRICT RULES:
- NEVER say the secret word
- NEVER spell or hint letters
- NEVER confirm unless EXACT guess
`,
  ],
  ["human", "Secret word: {word}"],
  ["human", "Player message: {guess}"],
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
