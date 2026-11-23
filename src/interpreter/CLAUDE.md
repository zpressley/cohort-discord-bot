# Reading orders

Words to engine orders. `grammar.js` reads what is written plainly, at no
cost. `aiReader.js` reads the rest with a small model. `resolve.js` turns
either reading into engine orders, questions and counsel. `orders.js` ties
them together.

- **Grammar first.** Anything the grammar can read whole never reaches the
  AI. When you add an order, teach the grammar first.
- **Never guess.** An unknown unit or place is a question back to the
  Commander, not a best guess. One unclear order must not throw away the
  clear ones.
- **The read-back is in the app's own words** (`src/narrator/words.js`), so
  the Commander sees what will happen, not what he typed.
- **Counsel** comes only from what the Commander could know himself. It
  never tells what the enemy is doing.
- **The AI is cheap on purpose.** Groq `openai/gpt-oss-20b`; about $0.0002
  a read; free tier 8,000 tokens a minute and 200,000 a day. Keep the
  prompt short. `docs/ai/MODELS.md` has the measurements.
- Tests never call the network: use `scriptedTransport` from `src/llm`.
- `npm run ai:bench` is live and spends the day's free tokens. Run it only
  when you changed the prompt or the schema. In the cloud sandbox the key
  is injected by the network proxy: run with
  `GROQ_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1`. Never put a real key
  in a command, a file or chat.
