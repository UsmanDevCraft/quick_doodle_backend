import { ChatOllama } from "@langchain/community/chat_models/ollama";

export const llm = new ChatOllama({
  model: "llama3",
  temperature: 0.8,
});
