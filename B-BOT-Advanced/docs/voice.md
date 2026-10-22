# Voice Service

> Status: planned for milestone 5. The backend currently exposes a `voice` config
> section and nothing in `app/voice/` is implemented yet.

## Pipeline

1. **Wake word.** `openWakeWord` models: English **“B-BOT”** and Spanish **“Bebote”**.
2. **VAD.** Silero VAD or WebRTC VAD decides when speech starts and ends.
3. **STT.** Remote Whisper `base` on the inference machine. The wake word picks the
   initial language; mixed speech falls back to auto-detection.
4. **Routing.** Deterministic commands first (reminders, timers, chores, device
   commands), then LLM tool calling, then plain chat.
5. **TTS.** Local Piper with English and Spanish voices.
6. **Delivery.** Results go to the speaker and the web UI; reminders also fan out to
   notification channels.

## States

`idle -> listening -> thinking -> speaking -> idle`

- **Barge-in:** a new wake word or stop command interrupts speech.
- **Stop:** the web UI and voice both support stopping an in-flight reply.
- **Push-to-talk:** the web UI provides a secondary input path.

## Language handling

- English wake word “B-BOT” (pronounced like “bebop” with a final T).
- Spanish wake word “Bebote” (pronounced “be'βote”).
- Interaction languages: English and Argentinian Spanish.
- The wake word chooses the initial language; detection handles mixed speech.

## Privacy

- Audio recordings are discarded after transcription by default.
- Transcripts are retained in SQLite; raw audio is not stored.

## Latency targets

Measure and record wake-word, STT, LLM, and TTS latency in `docs/discovery.md`.
Keep replies short and stream aggressively to hide remote inference latency.

## Fallbacks

- Push-to-talk when wake-word confidence is low.
- Configurable wake threshold.
- Upgrade path from Whisper `base` to a larger model.
- Optional remote TTS if a distinct Argentinian Spanish voice is required.
