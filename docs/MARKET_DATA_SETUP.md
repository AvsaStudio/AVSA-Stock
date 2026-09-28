# Connect AVSA Stock to Alpaca

## Provider choice

Alpaca Basic is the recommended starting point for this personal US-stock dashboard. Its free plan includes IEX stock data, 30 streaming symbols and 200 historical requests per minute. IEX is one exchange; prices and volumes are not consolidated across all US exchanges. The adapter explicitly requests IEX and uses cached REST snapshots every 15 seconds. It does not place orders or use trading endpoints.

Twelve Data Basic has 8 API credits per minute and 800 per day, which is restrictive for continuously refreshing ten symbols. Its free plan describes internal non-display usage. Before making any real-data dashboard public, arrange the appropriate provider display/redistribution permissions.

Sources checked September 27, 2026:
- [Alpaca plans](https://docs.alpaca.markets/us/docs/about-market-data-api)
- [Alpaca data FAQ](https://docs.alpaca.markets/us/docs/market-data-faq)
- [Twelve Data plans](https://twelvedata.com/pricing)

## Account and keys

1. Create an account at [Alpaca](https://app.alpaca.markets/signup), then select the Paper Trading dashboard and generate an API key and secret. See [Alpaca's account/key instructions](https://alpaca.markets/learn/start-paper-trading).
2. Open `backend/.env` locally. It is ignored by Git. Fill in these backend-only settings:

   ```dotenv
   DATA_MODE=alpaca
   ALPACA_API_KEY=your_key_id
   ALPACA_SECRET_KEY=your_secret
   ```

   Do not use `REACT_APP_` names for credentials; those are included in the frontend bundle. Do not paste keys into chat or commit them.
3. From the project directory, run:

   ```bash
   npm --prefix backend run check:provider
   ./start.sh
   ```

4. Open `http://localhost:3000`. The header should say **Alpaca IEX · Single exchange**, and the footer should describe the 15-second refresh. The latest trade time is displayed; markets may be closed and some stocks may have sparse IEX trades. Missing news access displays a separate error while retaining quotes.

Live activation has not been verified yet because no account credentials have been provided. The provider adapter has fixture tests for response mapping, concurrency, caching, invalid credentials, unavailable data and rate limits.

## Modes

- `DATA_MODE=demo`: in-process simulated ticks and clearly labeled generated headlines.
- `DATA_MODE=alpaca`: real IEX snapshots, one-minute history, daily bars, and provider headlines. News sentiment is unavailable rather than fabricated.
- `DATA_MODE=kafka`: reads the simulated Kafka producer through Redis/Cassandra. No generator fallback in the API. `./start.sh --all` selects this mode and launches Spark through Docker.

Alpaca mode is a direct backend integration; it does not currently send live provider data through Kafka, Spark or Airflow. These services remain the separate simulated engineering pipeline.

## Deployment

The Render blueprint now uses Node 22, matching the tested runtime. Keep the default demo mode until ready to activate real data. In the backend service's environment, set `DATA_MODE=alpaca`, `ALPACA_API_KEY`, and `ALPACA_SECRET_KEY`. In the static frontend environment, set only `REACT_APP_API_URL` to the HTTPS backend origin, then rebuild the frontend. The WebSocket URL derives from that origin. Deployment itself has not been performed.

## Endpoint references

- [Snapshots](https://docs.alpaca.markets/us/reference/stocksnapshots-1)
- [Historical bars](https://docs.alpaca.markets/us/reference/stockbarsingle-1)
- [News](https://docs.alpaca.markets/us/reference/news-3)
