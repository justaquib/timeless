import { useEffect, useRef, useState } from "react";
import { Clock3, Volume2, VolumeX } from "lucide-react";

type SoundState = "playing" | "ready" | "blocked" | "unavailable";

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [soundState, setSoundState] = useState<SoundState>("ready");
  const [progress, setProgress] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const soundTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const stopSound = () => {
    oscillatorsRef.current.forEach((oscillator) => oscillator.stop());
    oscillatorsRef.current = [];
    if (soundTimerRef.current !== null) window.clearTimeout(soundTimerRef.current);
    setSoundState("ready");
  };

  const playSound = async (generation = generationRef.current) => {
    try {
      if (!window.AudioContext) {
        if (generation === generationRef.current) setSoundState("unavailable");
        return;
      }
      const audioContext =
        contextRef.current && contextRef.current.state !== "closed"
          ? contextRef.current
          : new AudioContext();
      contextRef.current = audioContext;
      await audioContext.resume();
      if (generation !== generationRef.current) return;
      if (audioContext.state !== "running") {
        setSoundState("blocked");
        return;
      }
      const notes = [261.63, 329.63, 392, 523.25, 392, 329.63];
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const envelope = audioContext.createGain();
        const start = audioContext.currentTime + index * 0.62;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(0.08, start + 0.12);
        envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.95);
        oscillator.connect(envelope);
        envelope.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 1);
        oscillator.addEventListener("ended", () => {
          oscillatorsRef.current = oscillatorsRef.current.filter((item) => item !== oscillator);
        });
        oscillatorsRef.current.push(oscillator);
      });
      setSoundState("playing");
      soundTimerRef.current = window.setTimeout(() => {
        if (generation === generationRef.current) setSoundState("ready");
      }, 4_500);
    } catch {
      if (generation === generationRef.current) setSoundState("blocked");
    }
  };

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const startedAt = Date.now();
    const progressTimer = window.setInterval(() => {
      setProgress(Math.min(100, ((Date.now() - startedAt) / 5_500) * 100));
    }, 50);
    const timer = window.setTimeout(onComplete, 5_500);
    void playSound(generation);
    return () => {
      generationRef.current += 1;
      window.clearInterval(progressTimer);
      window.clearTimeout(timer);
      if (soundTimerRef.current !== null) window.clearTimeout(soundTimerRef.current);
      oscillatorsRef.current.forEach((oscillator) => oscillator.stop());
      const context = contextRef.current;
      contextRef.current = null;
      void context?.close();
    };
  }, []);

  const soundLabel =
    soundState === "playing"
      ? "Mute intro music"
      : soundState === "blocked"
        ? "Play intro music"
        : soundState === "unavailable"
          ? "Audio unavailable"
          : "Replay intro music";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#10172b] px-6 text-white">
      <div className="absolute -left-32 -top-32 size-96 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-32 size-[32rem] rounded-full bg-cyan-400/10 blur-3xl" />
      <main className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <div className="flex size-20 items-center justify-center rounded-[28px] border border-white/15 bg-white/10 shadow-2xl shadow-indigo-950/40 backdrop-blur">
          <Clock3 size={36} strokeWidth={1.5} />
        </div>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200">A little more time for</p>
        <h1 className="mt-2 text-5xl font-semibold tracking-tight">Timeless</h1>
        <p className="mt-3 text-sm text-slate-300">Thoughtful messages, delivered with care.</p>
        <div
          aria-label="Loading Timeless"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(progress)}
          className="mt-12 h-1.5 w-full overflow-hidden rounded-full bg-white/15"
          role="progressbar"
        >
          <div
            className="splash-progress h-full rounded-full bg-gradient-to-r from-indigo-300 to-cyan-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-[11px] tracking-wide text-slate-400">Preparing your workspace</p>
        <button
          aria-label={soundLabel}
          className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
          disabled={soundState === "unavailable"}
          onClick={() => {
            if (soundState === "playing") stopSound();
            else void playSound();
          }}
          type="button"
        >
          {soundState === "playing" ? <Volume2 size={15} /> : <VolumeX size={15} />}
          {soundLabel}
        </button>
      </main>
      <span className="absolute bottom-7 text-[10px] tracking-[0.18em] text-slate-500">A PRIVATE MAIL WORKSPACE</span>
    </div>
  );
}
