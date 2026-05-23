import { db, aiSuggestedQuestions } from "@workspace/db";

const questions = [
  { question: "My printer is jamming — how do I fix it?", category: "equipment", order: 1 },
  { question: "When should I reorder ribbon and paper?", category: "consumables", order: 2 },
  { question: "How do I price my photobooth packages?", category: "business", order: 3 },
  { question: "What does the maintenance schedule look like?", category: "equipment", order: 4 },
  { question: "How do I set up the booth for an outdoor event?", category: "operations", order: 5 },
  { question: "What Academy courses should I start with?", category: "academy", order: 6 },
  { question: "How do I handle a cancellation request?", category: "business", order: 7 },
  { question: "What warranty coverage comes with my unit?", category: "equipment", order: 8 },
];

for (const q of questions) {
  await db.insert(aiSuggestedQuestions).values(q).onConflictDoNothing();
}

console.log(`Seeded ${questions.length} AI suggested questions`);
process.exit(0);
