/**
 * Voice duress trigger.
 *
 * Listens for a driver-chosen phrase and raises a silent panic when it is
 * spoken — the covert channel that works when both hands are on the wheel or
 * visible to an attacker.
 *
 * ## Why this is an interface with an unavailable default
 *
 * Always-on wake-word detection cannot be done in managed Expo:
 *
 *   - It must run **on-device**. Streaming cabin audio to a cloud recogniser to
 *     wait for one phrase is a privacy violation, a data cost, and useless in
 *     the dead zones where hijackings happen.
 *   - It must survive the screen being off, which needs a foreground service on
 *     Android and an audio background mode on iOS.
 *   - Expo ships no wake-word module. The realistic implementations are
 *     Picovoice Porcupine or a bundled TFLite keyword model, both of which are
 *     native and require a **development build** — not Expo Go.
 *
 * So this file defines the contract, the phrase policy and the safety rules,
 * and ships an `UnavailableRecognizer` that reports honestly. Wiring Porcupine
 * means implementing `VoiceRecognizer` and registering it. Nothing else changes.
 *
 * A stub that pretended to listen would be far worse than one that says it
 * cannot: a driver who believes their duress phrase is armed will rely on it.
 */

export const VoiceTriggerState = {
  /** No recogniser is installed in this build. */
  UNAVAILABLE: 'UNAVAILABLE',
  /** Available, but the driver has not enrolled a phrase. */
  NOT_ENROLLED: 'NOT_ENROLLED',
  /** Available and enrolled, but microphone permission is missing. */
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  ERROR: 'ERROR',
} as const;
export type VoiceTriggerState = (typeof VoiceTriggerState)[keyof typeof VoiceTriggerState];

export interface VoiceDetection {
  phrase: string;
  /** 0-1. Compared against `MIN_CONFIDENCE` before a panic is raised. */
  confidence: number;
  detectedAt: string;
}

/**
 * A wake-word engine.
 *
 * Implemented by the native module in a development build. The whole surface is
 * deliberately small — everything else (debounce, confidence gating, panic
 * dispatch) lives here so it is identical whichever engine is used.
 */
export interface VoiceRecognizer {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  /** Begins listening. `onDetected` may fire many times. */
  start(phrase: string, onDetected: (detection: VoiceDetection) => void): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Minimum confidence before a spoken phrase raises a panic.
 *
 * High on purpose. A false positive dispatches armed responders to a driver
 * having a normal conversation; a false negative leaves the button, the shake
 * gesture and the watch. The asymmetry is not close, so the threshold is
 * conservative.
 */
export const MIN_CONFIDENCE = 0.85;

/** A detection within this window of the last one is ignored. */
const DEBOUNCE_MS = 5_000;

/**
 * Phrase policy.
 *
 * The phrase must be something a driver can say under duress without an
 * attacker noticing — which rules out anything that sounds like a distress
 * call. Good phrases are mundane and unlikely in normal speech, e.g. "I need to
 * fetch my blue folder".
 */
export const PHRASE_RULES = {
  minWords: 3,
  maxWords: 8,
  minCharacters: 12,
  maxCharacters: 64,
  /** Words that make the phrase obvious to a listener. */
  forbiddenWords: ['help', 'police', 'emergency', 'panic', 'sos', 'hijack', 'gun', 'robbery'],
} as const;

export interface PhraseValidation {
  valid: boolean;
  problems: string[];
}

export function validatePhrase(phrase: string): PhraseValidation {
  const trimmed = phrase.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const problems: string[] = [];

  if (trimmed.length < PHRASE_RULES.minCharacters) {
    problems.push(`Use at least ${PHRASE_RULES.minCharacters} characters.`);
  }
  if (trimmed.length > PHRASE_RULES.maxCharacters) {
    problems.push(`Keep it under ${PHRASE_RULES.maxCharacters} characters.`);
  }
  if (words.length < PHRASE_RULES.minWords) {
    problems.push(
      `Use at least ${PHRASE_RULES.minWords} words — single words are triggered by accident.`,
    );
  }
  if (words.length > PHRASE_RULES.maxWords) {
    problems.push(`Use at most ${PHRASE_RULES.maxWords} words, so you can say it under stress.`);
  }

  const lowered = trimmed.toLowerCase();
  const flagged = PHRASE_RULES.forbiddenWords.filter((word) =>
    new RegExp(`\\b${word}\\b`).test(lowered),
  );

  if (flagged.length > 0) {
    problems.push(
      `Avoid ${flagged.join(', ')} — the phrase must sound ordinary to anyone listening.`,
    );
  }

  return { valid: problems.length === 0, problems };
}

/**
 * The recogniser used when no native engine is present.
 *
 * Reports unavailable rather than silently doing nothing, so the settings
 * screen can tell the driver plainly that the voice trigger is not armed in
 * this build.
 */
class UnavailableRecognizer implements VoiceRecognizer {
  readonly name = 'none';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async requestPermission(): Promise<boolean> {
    return false;
  }

  async start(): Promise<void> {
    throw new Error(
      'No on-device wake-word engine is installed in this build. The voice trigger requires a development build with a native recogniser (e.g. Picovoice Porcupine). Use the shake gesture or the panic button.',
    );
  }

  async stop(): Promise<void> {}
}

let recognizer: VoiceRecognizer = new UnavailableRecognizer();

/** Installs a native recogniser. Called once at startup by the dev build. */
export function registerVoiceRecognizer(implementation: VoiceRecognizer): void {
  recognizer = implementation;
}

export function activeRecognizerName(): string {
  return recognizer.name;
}

export interface VoiceTriggerHandle {
  stop: () => Promise<void>;
}

/**
 * Arms the voice trigger.
 *
 * Confidence gating and debounce are applied here rather than in the engine, so
 * they hold identically whichever engine is installed.
 */
export async function armVoiceTrigger(
  phrase: string,
  onTrigger: (detection: VoiceDetection) => void,
): Promise<VoiceTriggerHandle> {
  if (!(await recognizer.isAvailable())) {
    throw new Error('The voice trigger is not available in this build.');
  }

  if (!(await recognizer.requestPermission())) {
    throw new Error('Microphone permission is required to arm the voice trigger.');
  }

  let lastFired = 0;

  await recognizer.start(phrase, (detection) => {
    if (detection.confidence < MIN_CONFIDENCE) return;

    const now = Date.now();
    if (now - lastFired < DEBOUNCE_MS) return;

    lastFired = now;
    onTrigger(detection);
  });

  return { stop: () => recognizer.stop() };
}

export async function voiceTriggerState(enrolledPhrase: string | null): Promise<VoiceTriggerState> {
  if (!(await recognizer.isAvailable())) return VoiceTriggerState.UNAVAILABLE;
  if (!enrolledPhrase) return VoiceTriggerState.NOT_ENROLLED;
  return VoiceTriggerState.IDLE;
}
